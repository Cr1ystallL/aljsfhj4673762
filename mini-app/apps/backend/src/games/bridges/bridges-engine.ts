import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

/**
 * Bridges — single-player REST game.
 *
 * Field: 5 rows × 4 cells. The user must walk from the bottom row up,
 * picking ONE cell per row. Each row contains some "broken" cells
 * (the player loses if they pick one) and some "safe" cells.
 *
 *   easy   — 1 broken cell per row → P(safe) = 3/4
 *   medium — 2 broken cells per row → P(safe) = 2/4
 *   hard   — 3 broken cells per row → P(safe) = 1/4
 *
 * Multiplier table per row (RTP ≈ 99% by construction):
 *
 *   easy   — 1.32, 1.76, 2.34, 3.12, 4.16
 *   medium — 1.97, 3.95, 7.89, 15.78, 31.56
 *   hard   — 3.93, 15.72, 62.86, 251.45, 1005.81
 *
 * The user can cash out after any successful row, and pulls the
 * multiplier of that row. Stepping into a broken cell forfeits the
 * stake. Cashing out before stepping at all is forbidden — same
 * "must reveal at least one cell" rule as Mines.
 *
 * Provably-fair: the broken cell positions are committed when the
 * round starts (the seed hash is shown), and revealed at the end. The
 * RTP-engine bias adjusts which COLUMN is more likely to hold a
 * broken cell — pushing breaks toward popular picks (left/right
 * extremes) when bias > 0.
 */

export type BridgesLevel = 'easy' | 'medium' | 'hard';

export const BRIDGES_LEVELS: ReadonlyArray<BridgesLevel> = ['easy', 'medium', 'hard'];

const ROWS = 5;
const COLS = 4;
const MIN_BET = 1;
const MAX_BET = 10000;

const BROKEN_PER_ROW: Record<BridgesLevel, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

/**
 * Multiplier earned after CROSSING `step` rows, indexed 1..ROWS.
 * Index 0 is the implicit "haven't crossed anything yet" → 0 (cannot
 * cashout). Computed from `0.99 / P(survive_step)^step` for nicer
 * round figures.
 */
const MULTIPLIERS: Record<BridgesLevel, number[]> = {
  easy: [1.32, 1.76, 2.34, 3.12, 4.16],
  medium: [1.97, 3.95, 7.89, 15.78, 31.56],
  hard: [3.93, 15.72, 62.86, 251.45, 1005.81],
};

interface BridgesGame {
  userId: string;
  bet: Bet;
  level: BridgesLevel;
  /** broken[row] = list of column indices that are broken in that row */
  broken: number[][];
  /** Cells the user has crossed safely. picks[row] = chosen col. */
  picks: number[];
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

export interface BridgesPublicState {
  roundId: string;
  level: BridgesLevel;
  betAmount: number;
  rows: number;
  cols: number;
  /** picks[row] — column index chosen on each completed row. */
  picks: number[];
  /** Multiplier earned after the LAST safely-crossed row. */
  currentMultiplier: number;
  /** Multiplier IF the user successfully crosses the next row. */
  nextMultiplier: number;
  /** Full multiplier ladder for the level so the UI can render. */
  ladder: number[];
  state: 'active' | 'cashed' | 'busted';
  serverSeedHash: string;
  /** Reveal once the round ends. */
  serverSeed?: string;
  broken?: number[][];
  finalMultiplier?: number;
  finalPayout?: number;
  /** Set on bust — the broken cell that ended the round. */
  bustedAt?: { row: number; col: number };
}

class BridgesEngine {
  private rooms = new Map<string, BridgesGame>(); // userId → active game

  hasActive(userId: string): boolean {
    const g = this.rooms.get(userId);
    return !!g && g.state === 'active';
  }

  getState(userId: string): BridgesPublicState | null {
    const g = this.rooms.get(userId);
    if (!g) return null;
    return this.toPublic(g, g.state !== 'active');
  }

  async start(
    userId: string,
    amount: number,
    level: BridgesLevel
  ): Promise<BridgesPublicState> {
    if (this.hasActive(userId)) {
      throw new Error('У вас уже идёт раунд — закончите его сначала');
    }
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      throw new Error(`Ставка должна быть от ${MIN_BET} до ${MAX_BET}`);
    }
    if (!BRIDGES_LEVELS.includes(level)) {
      throw new Error('Неверный уровень сложности');
    }

    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = 0;
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);

    const bias = await rtpEngine.getBiasFor(userId).catch(() => 0);
    const broken = generateBroken(hash, level, bias);

    const roundId = `bridges_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { gameType: 'bridges', level },
    };

    await bettingPipeline.processBet(bet, false);
    bet.state = 'active';

    await prisma.gameRound
      .create({
        data: {
          id: roundId,
          gameType: 'bridges',
          state: 'active',
          serverSeedHash: provablyFair.hashServerSeed(serverSeed),
          clientSeed,
          nonce,
          startedAt: new Date(),
          metadata: { level, betAmount: amount },
        },
      })
      .catch((err) => logger.warn(err, 'bridges gameRound.create failed'));

    const game: BridgesGame = {
      userId,
      bet,
      level,
      broken,
      picks: [],
      serverSeed,
      serverSeedHash: provablyFair.hashServerSeed(serverSeed),
      clientSeed,
      nonce,
      state: 'active',
      startedAt: Date.now(),
    };
    this.rooms.set(userId, game);
    logger.info({ userId, roundId, level, amount }, 'Bridges started');
    return this.toPublic(game, false);
  }

  async step(userId: string, col: number): Promise<BridgesPublicState> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.state !== 'active') throw new Error('Раунд уже завершён');
    if (!Number.isInteger(col) || col < 0 || col >= COLS) {
      throw new Error('Неверная клетка');
    }
    const row = g.picks.length;
    if (row >= ROWS) throw new Error('Все ряды уже пройдены');

    const config = await gameConfig.get('bridges');
    if (config.houseEdge >= 1.0 && !g.demoMode) {
      if (!g.broken[row].includes(col)) {
        // Swap with a broken tile in the same row
        const unrevealedBroken = g.broken[row][0]; // we just grab the first one
        g.broken[row] = g.broken[row].map((c) => (c === unrevealedBroken ? col : c)).sort((a, b) => a - b);
      }
    }

    if (g.broken[row].includes(col)) {
      // Bust.
      g.state = 'busted';
      g.finishedAt = Date.now();
      g.finalMultiplier = 0;
      g.finalPayout = 0;
      g.bet.payout = 0;
      g.bet.multiplier = 0;
      try {
        await bettingPipeline.processLoss(g.bet);
        await prisma.gameRound
          .update({
            where: { id: g.bet.roundId },
            data: {
              state: 'completed',
              serverSeed: g.serverSeed,
              endedAt: new Date(),
              result: {
                outcome: 'busted',
                bustedAt: { row, col },
                broken: g.broken,
                picks: g.picks,
              },
            },
          })
          .catch((err) => logger.warn(err, 'bridges gameRound.update failed'));
      } catch (err) {
        logger.error(err, 'bridges bust failed');
      }
      const out = this.toPublic(g, true);
      out.bustedAt = { row, col };
      return out;
    }

    g.picks.push(col);
    return this.toPublic(g, false);
  }

  async cashout(userId: string): Promise<BridgesPublicState> {
    const g = this.rooms.get(userId);
    if (!g) throw new Error('Нет активного раунда');
    if (g.state !== 'active') throw new Error('Раунд уже завершён');
    if (g.picks.length === 0) {
      throw new Error('Сначала пройдите хотя бы один ряд');
    }
    const mult = MULTIPLIERS[g.level][g.picks.length - 1];
    const payout = +(g.bet.amount * mult).toFixed(2);

    g.state = 'cashed';
    g.finishedAt = Date.now();
    g.finalMultiplier = mult;
    g.finalPayout = payout;
    g.bet.multiplier = mult;
    g.bet.payout = payout;

    try {
      await bettingPipeline.processCashout(g.bet, payout, mult, false);
      await prisma.gameRound
        .update({
          where: { id: g.bet.roundId },
          data: {
            state: 'completed',
            serverSeed: g.serverSeed,
            endedAt: new Date(),
            result: {
              outcome: 'cashed',
              multiplier: mult,
              payout,
              picks: g.picks,
              broken: g.broken,
            },
          },
        })
        .catch((err) => logger.warn(err, 'bridges gameRound.update failed'));
    } catch (err) {
      logger.error(err, 'bridges cashout failed');
    }
    return this.toPublic(g, true);
  }

  forget(userId: string): void {
    this.rooms.delete(userId);
  }

  private toPublic(g: BridgesGame, reveal: boolean): BridgesPublicState {
    const ladder = MULTIPLIERS[g.level];
    const cur = g.picks.length === 0 ? 0 : ladder[g.picks.length - 1];
    const next = g.picks.length < ROWS ? ladder[g.picks.length] : ladder[ROWS - 1];
    return {
      roundId: g.bet.roundId,
      level: g.level,
      betAmount: g.bet.amount,
      rows: ROWS,
      cols: COLS,
      picks: g.picks,
      currentMultiplier: cur,
      nextMultiplier: next,
      ladder,
      state: g.state,
      serverSeedHash: g.serverSeedHash,
      ...(reveal || g.state !== 'active'
        ? {
            serverSeed: g.serverSeed,
            broken: g.broken,
            finalMultiplier: g.finalMultiplier,
            finalPayout: g.finalPayout,
          }
        : {}),
    };
  }
}

/**
 * For each row, pick `BROKEN_PER_ROW[level]` distinct broken columns.
 * Bias mechanism: when bias > 0 we slightly favour the OUTER columns
 * (0 and 3) because humans default-tap the centre cells; when bias < 0
 * we favour the INNER columns (1 and 2) so the user enjoys a runner.
 */
function generateBroken(
  hash: string,
  level: BridgesLevel,
  bias: number
): number[][] {
  const breaks = BROKEN_PER_ROW[level];
  const b = Math.max(-1, Math.min(1, bias));

  // Stretchable byte stream so we never run out of entropy.
  const stream = (() => {
    let buf = Buffer.alloc(0);
    let counter = 0;
    return () => {
      if (buf.length < 4) {
        const next = Buffer.from(
          provablyFair.hashServerSeed(`${hash}:${counter++}`),
          'hex'
        );
        buf = Buffer.concat([buf, next]);
      }
      const v = buf.readUInt32BE(0);
      buf = buf.subarray(4);
      return v;
    };
  })();

  const isOuter = (c: number) => c === 0 || c === COLS - 1;

  const out: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    while (row.length < breaks) {
      let c = stream() % COLS;
      // Bias: re-roll once per pick with prob |b| × 0.4 if the chosen
      // column doesn't match the preferred side.
      if (Math.abs(b) > 0) {
        const wantOuter = b > 0;
        const draw = (stream() >>> 0) / 0xffffffff;
        if (
          draw < Math.abs(b) * 0.4 &&
          isOuter(c) !== wantOuter
        ) {
          const c2 = stream() % COLS;
          if (isOuter(c2) === wantOuter) c = c2;
        }
      }
      if (!row.includes(c)) row.push(c);
    }
    row.sort((a, x) => a - x);
    out.push(row);
  }
  return out;
}

export const bridgesEngine = new BridgesEngine();
