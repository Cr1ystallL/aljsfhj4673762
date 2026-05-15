import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Plinko Game Engine — Single-shot, server-authoritative.
 *
 * The user picks a stake and a risk tier. The server:
 *   1. Generates a provably-fair seed pair.
 *   2. Derives a 16-step left/right path from the seed (Fisher-Yates style
 *      uniform stream — see provably-fair.generatePlinkoPins).
 *   3. The bucket index is the number of right-decisions (range 0..16).
 *   4. Looks up the multiplier from the canonical Stake-style table for
 *      the chosen risk tier.
 *   5. Atomically debits the stake and credits the payout via
 *      bettingPipeline. The bet row is `won` (multiplier ≥ 1) or `lost`
 *      otherwise, but we always credit the gross payout — i.e. on a 0.5x
 *      bucket the user gets back half their stake.
 *
 * Risk tables are RTP ≈ 99% by construction.
 */

export type PlinkoRisk = 'low' | 'medium' | 'high';

export const PLINKO_ROWS = 16;
export const PLINKO_BUCKETS = PLINKO_ROWS + 1;

const MIN_BET = 1;
const MAX_BET = 10000;

/**
 * Multiplier tables for 16 rows / 17 buckets — canonical Stake values.
 * Indexed by bucket number 0..16 from far-left to far-right. The
 * distribution is symmetric so leftmost and rightmost buckets share the
 * same headline multiplier.
 */
export const PLINKO_MULTIPLIERS: Record<PlinkoRisk, number[]> = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

export interface PlinkoDropResult {
  roundId: string;
  /** Final bucket index 0..16 (inclusive). */
  bucket: number;
  /** Sequence of left/right decisions per row, 0=left, 1=right. */
  path: number[];
  multiplier: number;
  betAmount: number;
  payout: number;
  risk: PlinkoRisk;
  /** Provably-fair material — visible to user for verification. */
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export class PlinkoEngine {
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

    // 1. Provably-fair material
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = 0;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    const serverSeedHash = provablyFair.hashServerSeed(serverSeed);

    // 2. Path: 16 binary decisions L (0) / R (1). Bucket = sum of rights.
    const path = provablyFair.generatePlinkoPins(hash, PLINKO_ROWS);
    const bucket = path.reduce((acc, x) => acc + x, 0);
    const multiplier = PLINKO_MULTIPLIERS[risk][bucket];
    const payout = +(amount * multiplier).toFixed(2);

    const roundId = `plinko_${Date.now()}_${randomUUID()}`;

    // 3. Build a bet record + persist a round row so the audit trail
    //    matches what we do for crash & mines.
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
      // Debit the stake atomically.
      await bettingPipeline.processBet(bet, false);
      bet.state = 'active';

      // Persist the round (audit trail across services).
      await prisma.gameRound
        .create({
          data: {
            id: roundId,
            gameType: 'plinko',
            state: 'completed',
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce,
            startedAt: new Date(),
            endedAt: new Date(),
            metadata: { risk, betAmount: amount },
            result: { bucket, multiplier, payout, path },
          },
        })
        .catch((err) => logger.warn(err, 'Failed to record plinko round'));

      // Resolve outcome — credit gross payout (covers <1x partial returns
      // such as the 0.5x medium-risk middle bucket).
      if (payout > 0) {
        await bettingPipeline.processPayout(bet, payout, false);
      } else {
        await bettingPipeline.processLoss(bet);
      }

      logger.info(
        { userId, roundId, risk, bucket, multiplier, betAmount: amount, payout },
        'Plinko drop resolved'
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
}

export const plinkoEngine = new PlinkoEngine();
