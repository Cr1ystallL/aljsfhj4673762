import crypto from 'crypto';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { gameConfig } from '../../services/game-config.js';
import { logger } from '../../utils/logger.js';
import type { Bet } from '../../game-engine/types.js';

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high';

// The house draws 7 numbers from a pool of 40 (1-40).
export const KENO_MAX_NUMBERS = 40;
export const KENO_DRAW_COUNT = 7;
export const KENO_MAX_PICKS = 7;
export const KENO_MIN_PICKS = 1;

/**
 * Multiplier tables for Keno based on standard crypto casino formats.
 * Map: Risk Level -> Pick Count (1-7) -> Array of multipliers for (0 to Pick Count) hits.
 */
export const KENO_MULTIPLIERS: Record<KenoRisk, Record<number, number[]>> = {
  classic: {
    1: [0, 5.5],
    2: [0, 1.9, 15.0],
    3: [0, 1.2, 3.8, 70.0],
    4: [0, 0.9, 2.5, 12.0, 400.0],
    5: [0, 0.7, 2.0, 6.5, 50.0, 1500.0],
    6: [0, 0.6, 1.6, 4.0, 20.0, 160.0, 6000.0],
    7: [0, 0.5, 1.3, 3.0, 10.0, 60.0, 500.0, 20000.0],
  },
  low: {
    1: [0, 5.5],
    2: [0, 1.9, 15.0],
    3: [0, 1.2, 3.8, 70.0],
    4: [0, 0.9, 2.5, 12.0, 400.0],
    5: [0, 0.7, 2.0, 6.5, 50.0, 1500.0],
    6: [0, 0.6, 1.6, 4.0, 20.0, 160.0, 6000.0],
    7: [0, 0.5, 1.3, 3.0, 10.0, 60.0, 500.0, 20000.0],
  },
  medium: {
    1: [0, 5.5],
    2: [0, 0.5, 30.0],
    3: [0, 1.0, 4.2, 85.0],
    4: [0, 0, 3.2, 22.0, 850.0],
    5: [0, 0, 2.2, 12.0, 110.0, 3500.0],
    6: [0, 0, 1.5, 7.0, 45.0, 450.0, 15000.0],
    7: [0, 0, 1.1, 4.5, 22.0, 160.0, 1400.0, 50000.0],
  },
  high: {
    1: [0, 5.5],
    2: [0, 0, 35.8],
    3: [0, 0, 0, 270.0],
    4: [0, 0, 0, 36.0, 1300.0],
    5: [0, 0, 0, 15.0, 190.0, 7000.0],
    6: [0, 0, 0, 0, 125.0, 1100.0, 30000.0],
    7: [0, 0, 0, 0, 50.0, 500.0, 4500.0, 100000.0],
  },
};

export interface KenoBetParams {
  amount: number;
  currency: string;
  picks: number[]; // Numbers from 1 to 40
  risk: KenoRisk;
}

export interface KenoResult {
  drawnNumbers: number[];
  hits: number;
  multiplier: number;
  payout: number;
}

class KenoEngine {
  /**
   * Generates a provably fair draw of 10 numbers from 1 to 40.
   */
  private generateDraw(seed: string): number[] {
    const draw: number[] = [];
    const pool = Array.from({ length: KENO_MAX_NUMBERS }, (_, i) => i + 1);
    
    // Hash the seed to create a deterministic but unpredictable sequence
    let currentHash = crypto.createHash('sha256').update(seed).digest('hex');
    
    for (let i = 0; i < KENO_DRAW_COUNT; i++) {
      // Take first 8 chars for 32-bit integer
      const hex = currentHash.substring(0, 8);
      const int = parseInt(hex, 16);
      
      // Select index from remaining pool
      const index = int % pool.length;
      draw.push(pool[index]);
      pool.splice(index, 1); // Remove selected to prevent duplicates
      
      // Re-hash for next number
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    return draw.sort((a, b) => a - b);
  }

  async processBet(userId: string, params: KenoBetParams, demoMode: boolean = false): Promise<KenoResult> {
    if (params.picks.length < KENO_MIN_PICKS || params.picks.length > KENO_MAX_PICKS) {
      throw new Error(`Keno picks must be between ${KENO_MIN_PICKS} and ${KENO_MAX_PICKS}`);
    }
    
    if (new Set(params.picks).size !== params.picks.length) {
      throw new Error('Keno picks must be unique');
    }
    
    if (params.picks.some(p => p < 1 || p > KENO_MAX_NUMBERS)) {
      throw new Error(`Keno picks must be between 1 and ${KENO_MAX_NUMBERS}`);
    }
    
    if (!KENO_MULTIPLIERS[params.risk]) {
      throw new Error(`Invalid Keno risk level: ${params.risk}`);
    }

    const cfg = gameConfig.getCachedOrDefault('keno');

    if (params.amount < cfg.minBet) {
      throw new Error(`Минимальная ставка ${cfg.minBet}`);
    }
    if (params.amount > cfg.maxBet) {
      throw new Error(`Максимальная ставка ${cfg.maxBet}`);
    }

    const betId = crypto.randomUUID();
    const roundId = crypto.randomUUID();
    
    const bet: Bet = {
      id: betId,
      userId,
      gameId: `keno_${betId}`,
      roundId,
      amount: params.amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: {
        picks: params.picks,
        risk: params.risk,
      }
    };

    // Run through the betting pipeline
    await bettingPipeline.processBet(bet, demoMode);

    try {
      // Generate the 10 numbers for this round
      const seed = crypto.randomBytes(32).toString('hex');
      const drawnNumbers = this.generateDraw(seed);
      
      // Count the hits
      let hits = 0;
      for (const pick of params.picks) {
        if (drawnNumbers.includes(pick)) {
          hits++;
        }
      }
      
      // Get the multiplier based on Risk, Pick Count, and Hits
      const pickCount = params.picks.length;
      const rawMultiplier = KENO_MULTIPLIERS[params.risk][pickCount][hits];
      const payout = params.amount * rawMultiplier;

      // Ensure the multiplier and payout are saved to the DB
      bet.multiplier = rawMultiplier;
      bet.payout = payout;

      if (payout > 0) {
        await bettingPipeline.processPayout(bet, payout, demoMode, true);
      } else {
        await bettingPipeline.processLoss(bet, demoMode, true);
      }

      return {
        drawnNumbers,
        hits,
        multiplier: rawMultiplier,
        payout
      };
    } catch (e) {
      logger.error(e, 'Failed to resolve keno bet');
      throw e;
    }
  }
}

export const kenoEngine = new KenoEngine();
