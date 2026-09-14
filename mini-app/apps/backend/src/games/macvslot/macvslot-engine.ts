import { randomUUID, randomInt } from 'crypto';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { redisClient } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

export type SlotSymbol =
  | 'macvjet'
  | 'mines'
  | 'wheel'
  | 'coinflip'
  | 'a'
  | 'k'
  | 'q'
  | 'j'
  | '10'
  | 'wield'
  | 'scatter';

export interface WinningLine {
  lineIndex: number;
  symbol: SlotSymbol;
  count: number;
  positions: [number, number][]; // [reel, row]
  payout: number;
}

export interface SlotSpinResult {
  roundId: string;
  grid: SlotSymbol[][]; // 5 reels x 3 rows: grid[reel][row]
  winningLines: WinningLine[];
  lineWinTotal: number;
  scatterCount: number;
  scatterWin: number;
  totalWin: number;
  freeSpinsAwarded: number;
  freeSpinsRemaining: number;
  isFreeSpin: boolean;
}

export interface FreeSpinsState {
  remaining: number;
  betAmount: number;
  totalWon: number;
}

// 20 Standard Classic Paylines across 5 reels (row indices: 0 = top, 1 = mid, 2 = bot)
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], // 0: Middle horizontal
  [0, 0, 0, 0, 0], // 1: Top horizontal
  [2, 2, 2, 2, 2], // 2: Bottom horizontal
  [0, 1, 2, 1, 0], // 3: V shape
  [2, 1, 0, 1, 2], // 4: Inverted V
  [0, 0, 1, 0, 0], // 5
  [2, 2, 1, 2, 2], // 6
  [1, 2, 2, 2, 1], // 7
  [1, 0, 0, 0, 1], // 8
  [0, 1, 1, 1, 0], // 9
  [2, 1, 1, 1, 2], // 10
  [1, 1, 0, 1, 1], // 11
  [1, 1, 2, 1, 1], // 12
  [0, 1, 0, 1, 0], // 13
  [2, 1, 2, 1, 2], // 14
  [1, 0, 1, 0, 1], // 15
  [1, 2, 1, 2, 1], // 16
  [0, 0, 2, 0, 0], // 17
  [2, 2, 0, 2, 2], // 18
  [0, 2, 0, 2, 0], // 19
];

// Multipliers for 3, 4, 5 of a kind applied to Line Bet (Line Bet = Total Bet / 20)
export const LINE_PAYOUT_MULTIPLIERS: Record<SlotSymbol, Record<number, number>> = {
  macvjet: { 3: 35, 4: 175, 5: 1000 },
  mines: { 3: 25, 4: 120, 5: 700 },
  wheel: { 3: 20, 4: 90, 5: 500 },
  coinflip: { 3: 15, 4: 70, 5: 400 },
  a: { 3: 10, 4: 45, 5: 200 },
  k: { 3: 8, 4: 35, 5: 160 },
  q: { 3: 6, 4: 25, 5: 120 },
  j: { 3: 5, 4: 20, 5: 80 },
  '10': { 3: 4, 4: 15, 5: 60 },
  wield: { 3: 40, 4: 200, 5: 1000 },
  scatter: { 3: 0, 4: 0, 5: 0 }, // Evaluated separately
};

// Weighted pool for 96.2% RTP
// Format: [symbol, weight]
const REEL_WEIGHTS: [SlotSymbol, number][] = [
  ['10', 32],
  ['j', 30],
  ['q', 26],
  ['k', 24],
  ['a', 20],
  ['coinflip', 16],
  ['wheel', 14],
  ['mines', 12],
  ['macvjet', 9],
  ['wield', 6],
  ['scatter', 4],
];

// Flattened pool for O(1) random pick
const SYMBOL_POOL: SlotSymbol[] = [];
for (const [symbol, weight] of REEL_WEIGHTS) {
  for (let i = 0; i < weight; i++) {
    SYMBOL_POOL.push(symbol);
  }
}

export class MacvSlotEngine {
  private getRedisKey(userId: string): string {
    return `macvslot:freespins:${userId}`;
  }

  /**
   * Get active free spins status for user
   */
  async getFreeSpinsState(userId: string): Promise<FreeSpinsState | null> {
    try {
      const client = redisClient.getClient();
      const data = await client.get(this.getRedisKey(userId));
      if (!data) return null;
      return JSON.parse(data) as FreeSpinsState;
    } catch {
      return null;
    }
  }

  /**
   * Save free spins status
   */
  async setFreeSpinsState(userId: string, state: FreeSpinsState | null): Promise<void> {
    try {
      const client = redisClient.getClient();
      const key = this.getRedisKey(userId);
      if (!state || state.remaining <= 0) {
        await client.del(key);
      } else {
        await client.set(key, JSON.stringify(state), 'EX', 86400 * 3); // 3 days
      }
    } catch {
      // ignore redis write error if client disconnected
    }
  }

  /**
   * Generates a random 5x3 grid using cryptographically secure random integers.
   */
  generateGrid(): SlotSymbol[][] {
    const grid: SlotSymbol[][] = [];
    for (let reel = 0; reel < 5; reel++) {
      const col: SlotSymbol[] = [];
      for (let row = 0; row < 3; row++) {
        const idx = randomInt(0, SYMBOL_POOL.length);
        col.push(SYMBOL_POOL[idx]);
      }
      grid.push(col);
    }
    return grid;
  }

  /**
   * Evaluates line wins across 20 paylines.
   */
  evaluateLines(grid: SlotSymbol[][], lineBet: number): { winningLines: WinningLine[]; lineWinTotal: number } {
    const winningLines: WinningLine[] = [];
    let lineWinTotal = 0;

    for (let lineIndex = 0; lineIndex < PAYLINES.length; lineIndex++) {
      const pattern = PAYLINES[lineIndex];
      const lineSymbols: SlotSymbol[] = [];
      const positions: [number, number][] = [];

      for (let reel = 0; reel < 5; reel++) {
        const row = pattern[reel];
        lineSymbols.push(grid[reel][row]);
        positions.push([reel, row]);
      }

      // Determine the target symbol (first non-wild, or 'wield' if all wilds)
      let targetSymbol: SlotSymbol = 'wield';
      for (const s of lineSymbols) {
        if (s !== 'wield' && s !== 'scatter') {
          targetSymbol = s;
          break;
        }
      }

      // Count consecutive matches from left to right (reel 0, 1, ...)
      let matchCount = 0;
      for (let reel = 0; reel < 5; reel++) {
        const sym = lineSymbols[reel];
        if (sym === targetSymbol || sym === 'wield') {
          matchCount++;
        } else {
          break;
        }
      }

      if (matchCount >= 3) {
        const multiplier = LINE_PAYOUT_MULTIPLIERS[targetSymbol]?.[matchCount] || 0;
        if (multiplier > 0) {
          const payout = Math.round(multiplier * lineBet * 100) / 100;
          winningLines.push({
            lineIndex,
            symbol: targetSymbol,
            count: matchCount,
            positions: positions.slice(0, matchCount),
            payout,
          });
          lineWinTotal += payout;
        }
      }
    }

    return {
      winningLines,
      lineWinTotal: Math.round(lineWinTotal * 100) / 100,
    };
  }

  /**
   * Evaluates scatter triggers anywhere on the screen.
   */
  evaluateScatters(grid: SlotSymbol[][], totalBet: number): { scatterCount: number; scatterWin: number; freeSpinsAwarded: number } {
    let scatterCount = 0;
    for (let reel = 0; reel < 5; reel++) {
      for (let row = 0; row < 3; row++) {
        if (grid[reel][row] === 'scatter') {
          scatterCount++;
        }
      }
    }

    let scatterWin = 0;
    let freeSpinsAwarded = 0;

    if (scatterCount >= 5) {
      scatterWin = Math.round(totalBet * 100 * 100) / 100;
      freeSpinsAwarded = 20;
    } else if (scatterCount === 4) {
      scatterWin = Math.round(totalBet * 20 * 100) / 100;
      freeSpinsAwarded = 15;
    } else if (scatterCount === 3) {
      scatterWin = Math.round(totalBet * 5 * 100) / 100;
      freeSpinsAwarded = 10;
    }

    return { scatterCount, scatterWin, freeSpinsAwarded };
  }

  /**
   * Main spin handler
   */
  async spin(
    userId: string,
    requestedBetAmount: number,
    demoMode: boolean = false
  ): Promise<SlotSpinResult> {
    const roundId = randomUUID();
    const cfg = await gameConfig.get('macvslot');

    if (cfg.paused) {
      throw new Error('Игра временно приостановлена.');
    }

    // Check active free spins
    let fsState = await this.getFreeSpinsState(userId);
    const isFreeSpin = !!(fsState && fsState.remaining > 0);
    const actualBetAmount = isFreeSpin ? 0 : requestedBetAmount;
    const baseBetForCalculations = isFreeSpin ? fsState!.betAmount : requestedBetAmount;

    if (!isFreeSpin) {
      if (requestedBetAmount < cfg.minBet) {
        throw new Error(`Минимальная ставка: ${cfg.minBet} PLN`);
      }
      if (requestedBetAmount > cfg.maxBet) {
        throw new Error(`Максимальная ставка: ${cfg.maxBet} PLN`);
      }
    }

    const lineBet = Math.round((baseBetForCalculations / 20) * 10000) / 10000;

    // Deduct bet if not free spin
    const bet: Bet = {
      id: randomUUID(),
      userId,
      gameId: 'macvslot',
      roundId,
      amount: actualBetAmount,
      state: 'active',
      metadata: { isFreeSpin, baseBet: baseBetForCalculations },
      placedAt: Date.now(),
    };

    if (!isFreeSpin) {
      await bettingPipeline.processBet(bet, demoMode);
    }

    // Generate outcome
    const grid = this.generateGrid();
    const { winningLines, lineWinTotal } = this.evaluateLines(grid, lineBet);
    const { scatterCount, scatterWin, freeSpinsAwarded } = this.evaluateScatters(grid, baseBetForCalculations);

    const totalWin = Math.round((lineWinTotal + scatterWin) * 100) / 100;

    // Handle Free Spins State Updates
    let freeSpinsRemaining = 0;
    if (isFreeSpin && fsState) {
      fsState.remaining -= 1;
      fsState.totalWon = Math.round((fsState.totalWon + totalWin) * 100) / 100;
      if (freeSpinsAwarded > 0) {
        fsState.remaining += freeSpinsAwarded; // Re-trigger!
      }
      freeSpinsRemaining = fsState.remaining;
      await this.setFreeSpinsState(userId, fsState.remaining > 0 ? fsState : null);
    } else if (freeSpinsAwarded > 0) {
      fsState = {
        remaining: freeSpinsAwarded,
        betAmount: baseBetForCalculations,
        totalWon: totalWin,
      };
      freeSpinsRemaining = freeSpinsAwarded;
      await this.setFreeSpinsState(userId, fsState);
    }

    // Settle Bet in Database
    try {
      if (totalWin > 0) {
        await bettingPipeline.processPayout(bet, totalWin, demoMode, true);
      } else {
        if (!isFreeSpin) {
          await bettingPipeline.processLoss(bet, demoMode, true);
        }
      }
    } catch (err) {
      logger.error({ err, betId: bet.id, totalWin }, 'Failed to settle MacvSlot bet');
      throw err;
    }

    return {
      roundId,
      grid,
      winningLines,
      lineWinTotal,
      scatterCount,
      scatterWin,
      totalWin,
      freeSpinsAwarded,
      freeSpinsRemaining,
      isFreeSpin,
    };
  }
}

export const macvSlotEngine = new MacvSlotEngine();
