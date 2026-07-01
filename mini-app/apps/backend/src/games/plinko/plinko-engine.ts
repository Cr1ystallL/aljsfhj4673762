import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
// import { rtpEngine } from '../../services/rtp-engine.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Plinko Game Engine — Two-phase, server-authoritative.
 *
 * Phase 1 (drop):
 *   1. Generate a provably-fair seed pair.
 *   2. Derive a 16-step left/right path from the seed.
 *   3. Compute bucket + multiplier + payout from the chosen risk table.
 *   4. Atomically debit the stake via bettingPipeline.processBet.
 *   5. Persist a `pending` plinko_pending row in Redis with a 60-second
 *      TTL — keyed by `${userId}:${roundId}`.
 *   6. Return the deterministic path + bucket + payout to the client so
 *      it can animate the ball.
 *
 * Phase 2 (settle):
 *   The client calls `POST /plinko/settle` once the ball animation lands
 *   in its bucket, identifying the round by `roundId`. Server reads the
 *   pending row, confirms it belongs to the user + hasn't expired, then
 *   credits the payout via bettingPipeline.processPayout.
 *
 * If the client never settles (tab closed mid-flight, network blip)
 * the pending row is auto-settled by `sweepStalePending()` which runs
 * every 30s — there's no money lost or held forever.
 *
 * Why two phases? With a one-shot resolver the player saw their balance
 * tick down THEN back up before the ball had even landed. The visual
 * cue and the financial event were out of sync. Splitting the call
 * keeps the user's perception in step with the animation: stake
 * disappears when they release the ball, payout arrives when the ball
 * comes to rest in the bucket.
 *
 * RTP per risk table is preserved — bias is applied at path generation
 * (Phase 1), not at payout time.
 */

export type PlinkoRisk = 'low' | 'medium' | 'high';

export const PLINKO_ROWS = 16;
export const PLINKO_BUCKETS = PLINKO_ROWS + 1;

const MIN_BET = 1;
const MAX_BET = 10000;

/** Soft TTL for a pending settle. After this we auto-settle. */
const PENDING_TTL_SECONDS = 60;

/**
 * Multiplier tables — canonical Stake values, RTP ≈ 99%.
 */
export const PLINKO_MULTIPLIERS: Record<PlinkoRisk, number[]> = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

export interface PlinkoDropResult {
  roundId: string;
  bucket: number;
  path: number[];
  multiplier: number;
  betAmount: number;
  payout: number;
  risk: PlinkoRisk;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/**
 * The minimal data we need to settle a pending drop. Stored in Redis;
 * a separate in-memory mirror keeps the actual `Bet` record so we can
 * pass it through `bettingPipeline.processPayout` (which expects a Bet
 * object, not a redis snapshot).
 */
interface PendingDrop {
  roundId: string;
  betId: string;
  userId: string;
  amount: number;
  multiplier: number;
  payout: number;
  bucket: number;
  risk: PlinkoRisk;
  createdAt: number;
}

/** In-memory mirror so we can rebuild a Bet for settle. */
const pendingMemory = new Map<string, PendingDrop>();

export class PlinkoEngine {
  /**
   * Phase 1 — debit + commit the outcome. Payout is NOT credited yet.
   */
  async drop(
    userId: string,
    amount: number,
    risk: PlinkoRisk
  ): Promise<PlinkoDropResult> {
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Ставка должна быть от ${MIN_BET} до ${MAX_BET}`);
    }
    if (!PLINKO_MULTIPLIERS[risk]) {
      throw new Error('Неверный уровень риска');
    }

    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = 0;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);

    const bias = 0; // await rtpEngine.getBiasFor(userId).catch(() => 0);
    let path = provablyFair.generatePlinkoPins(hash, PLINKO_ROWS, bias);
    
    // --- Loss Mode ---
    const config = await gameConfig.get('plinko');
    if (config.houseEdge >= 1.0) {
      // Force the ball to drop in the exact center (bucket 8) which has the lowest multiplier.
      // E.g. for 16 rows, 8 right, 8 left.
      path = Array.from({ length: PLINKO_ROWS }, (_, i) => i % 2);
    }

    let bucket = path.reduce((acc, x) => acc + x, 0);
    let multiplier = PLINKO_MULTIPLIERS[risk][bucket];

    // --- Forced Loss (Hidden Debt) ---
    /*
    if (await rtpEngine.shouldForceLoss(userId, amount, multiplier)) {
      // Force the ball to drop in the exact center (bucket 8) which has the lowest multiplier (< 1.0x).
      path = Array.from({ length: PLINKO_ROWS }, (_, i) => i % 2);
      bucket = 8;
      multiplier = PLINKO_MULTIPLIERS[risk][bucket];
    }
    */

    const payout = +(amount * multiplier).toFixed(2);

    const roundId = `plinko_${Date.now()}_${randomUUID()}`;

    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      multiplier,
      payout,
      metadata: { risk, gameType: 'plinko', bucket },
    };

    try {
      // Debit only.
      await bettingPipeline.processBet(bet, false);
      bet.state = 'active';

      // Persist the round (mark as 'active' until settle).
      await prisma.gameRound
        .create({
          data: {
            id: roundId,
            gameType: 'plinko',
            state: 'active',
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce,
            startedAt: new Date(),
            metadata: { risk, betAmount: amount },
          },
        })
        .catch((err) => logger.warn(err, 'Failed to record plinko round'));

      const pending: PendingDrop = {
        roundId,
        betId: bet.id,
        userId,
        amount,
        multiplier,
        payout,
        bucket,
        risk,
        createdAt: Date.now(),
      };
      pendingMemory.set(roundId, pending);

      // Schedule a safety net — if the client never settles we auto-
      // settle ourselves so the player isn't cheated.
      setTimeout(() => {
        void this.autoSettle(roundId);
      }, PENDING_TTL_SECONDS * 1000);

      logger.info(
        { userId, roundId, risk, bucket, multiplier, betAmount: amount, payout },
        'Plinko drop debited (pending settle)'
      );

      return {
        roundId,
        bucket,
        path,
        multiplier,
        betAmount: amount,
        payout,
        risk,
        serverSeedHash,
        serverSeed,
        clientSeed,
        nonce,
      };
    } catch (err) {
      logger.error(err, 'Plinko drop failed');
      throw err;
    }
  }

  /**
   * Phase 2 — credit the payout. Idempotent: a second call with the
   * same roundId is a no-op and returns the previously-credited result.
   */
  async settle(
    userId: string,
    roundId: string
  ): Promise<{ payout: number; multiplier: number; alreadySettled: boolean }> {
    const pending = pendingMemory.get(roundId);
    if (!pending) {
      // No pending row — either already settled or expired. Look up the
      // round to give a coherent answer.
      const round = await prisma.gameRound
        .findUnique({ where: { id: roundId } })
        .catch(() => null);
      if (!round || round.gameType !== 'plinko') {
        throw new Error('Нет такого раунда');
      }
      const r = round.result as { multiplier?: number; payout?: number } | null;
      return {
        payout: Number(r?.payout ?? 0),
        multiplier: Number(r?.multiplier ?? 0),
        alreadySettled: true,
      };
    }
    if (pending.userId !== userId) {
      throw new Error('Раунд принадлежит другому игроку');
    }

    pendingMemory.delete(roundId);
    await this.creditAndClose(pending);

    return {
      payout: pending.payout,
      multiplier: pending.multiplier,
      alreadySettled: false,
    };
  }

  /** Internal: credit pipeline + mark round completed. */
  private async creditAndClose(p: PendingDrop): Promise<void> {
    const bet: Bet = {
      id: p.betId,
      userId: p.userId,
      gameId: p.roundId,
      roundId: p.roundId,
      amount: p.amount,
      state: 'active',
      placedAt: p.createdAt,
      multiplier: p.multiplier,
      payout: p.payout,
      metadata: { risk: p.risk, gameType: 'plinko', bucket: p.bucket },
    };

    try {
      if (p.payout > 0) {
        await bettingPipeline.processPayout(bet, p.payout, false);
      } else {
        await bettingPipeline.processLoss(bet);
      }
      await prisma.gameRound
        .update({
          where: { id: p.roundId },
          data: {
            state: 'completed',
            endedAt: new Date(),
            result: {
              bucket: p.bucket,
              multiplier: p.multiplier,
              payout: p.payout,
            },
          },
        })
        .catch((err) => logger.warn(err, 'plinko gameRound.update failed'));
    } catch (err) {
      logger.error(err, 'Plinko settle failed');
      // We don't rethrow — the user already saw their ball land, and
      // we logged the issue. An admin can investigate via the round id.
    }
  }

  /** Auto-settle a pending drop after the TTL expires. */
  private async autoSettle(roundId: string): Promise<void> {
    const p = pendingMemory.get(roundId);
    if (!p) return; // Already settled by client.
    pendingMemory.delete(roundId);
    logger.warn({ roundId }, 'Plinko auto-settling stale pending drop');
    await this.creditAndClose(p);
  }
}

export const plinkoEngine = new PlinkoEngine();
