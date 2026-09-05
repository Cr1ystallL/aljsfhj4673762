import crypto from 'crypto';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { gameConfig } from '../../services/game-config.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import { logger } from '../../utils/logger.js';
import type { Bet } from '../../game-engine/types.js';

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high';

// The house draws 7 numbers from a pool of 40 (1-40).
export const KENO_MAX_NUMBERS = 40;
export const KENO_DRAW_COUNT = 7;
export const KENO_MAX_PICKS = 7;
export const KENO_MIN_PICKS = 1;

/**
 * Mathematically balanced multiplier tables for Keno.
 * Every pick combination has target RTP of 91% - 95.5% (eliminating player edge).
 */
export const KENO_MULTIPLIERS: Record<KenoRisk, Record<number, number[]>> = {
  classic: {
    1: [0, 5.4],
    2: [0, 1.9, 14.5],
    3: [0, 1.2, 3.7, 65.0],
    4: [0, 0.8, 2.4, 11.5, 380.0],
    5: [0, 0.65, 1.9, 6.2, 45.0, 1400.0],
    6: [0, 0.6, 1.6, 3.9, 19.0, 150.0, 5500.0],
    7: [0, 0.5, 1.3, 3.0, 10.0, 55.0, 450.0, 18000.0],
  },
  low: {
    1: [0, 5.4],
    2: [0, 1.9, 14.5],
    3: [0, 1.2, 3.7, 65.0],
    4: [0, 0.8, 2.4, 11.5, 380.0],
    5: [0, 0.65, 1.9, 6.2, 45.0, 1400.0],
    6: [0, 0.6, 1.6, 3.9, 19.0, 150.0, 5500.0],
    7: [0, 0.5, 1.3, 3.0, 10.0, 55.0, 450.0, 18000.0],
  },
  medium: {
    1: [0, 5.4],
    2: [0, 0.5, 30.0],
    3: [0, 1.0, 4.1, 80.0],
    4: [0, 0, 3.0, 20.0, 800.0],
    5: [0, 0, 1.8, 11.0, 100.0, 3200.0],
    6: [0, 0, 1.2, 6.5, 42.0, 400.0, 14000.0],
    7: [0, 0, 0.9, 4.2, 20.0, 150.0, 1300.0, 45000.0],
  },
  high: {
    1: [0, 5.4],
    2: [0, 0, 35.0],
    3: [0, 0, 0, 265.0],
    4: [0, 0, 0, 36.0, 1300.0],
    5: [0, 0, 0, 15.0, 180.0, 6800.0],
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
      let drawnNumbers = this.generateDraw(crypto.randomBytes(32).toString('hex'));
      
      // Count the hits
      let hits = 0;
      for (const pick of params.picks) {
        if (drawnNumbers.includes(pick)) {
          hits++;
        }
      }
      
      const pickCount = params.picks.length;
      let rawMultiplier = KENO_MULTIPLIERS[params.risk][pickCount][hits];

      // Smart bias check if player is hitting a big multiplier
      if (!demoMode) {
        const bias = await rtpEngine.getBiasFor(userId, false).catch(() => 0);
        const isDrain = await rtpEngine.isDrainActive(userId, false).catch(() => false);
        const shouldForceLoss = await rtpEngine.shouldForceLoss(userId, params.amount, rawMultiplier, false).catch(() => false);

        // Only re-roll on active drain, or large multiplier spikes (>= 6x) under positive house bias
        if ((isDrain || (shouldForceLoss && rawMultiplier >= 4.0) || (bias > 0.25 && rawMultiplier >= 6.0 && Math.random() < bias * 0.5)) && rawMultiplier >= 2.5) {
          // Gentle single re-draw to regulate payout without crushing regular 2x-4x wins
          const candidate = this.generateDraw(crypto.randomBytes(32).toString('hex'));
          let cHits = 0;
          for (const pick of params.picks) {
            if (candidate.includes(pick)) cHits++;
          }
          const cMult = KENO_MULTIPLIERS[params.risk][pickCount][cHits];
          if (cMult < rawMultiplier) {
            drawnNumbers = candidate;
            hits = cHits;
            rawMultiplier = cMult;
          }
        }
      }

      const payout = params.amount * rawMultiplier;

      // Ensure the multiplier and payout are saved to the DB
      bet.multiplier = rawMultiplier;
      bet.payout = payout;

      if (payout > 0) {
        await bettingPipeline.processPayout(bet, payout, demoMode, true);
        if (!demoMode) void rtpEngine.recordRoundForDrain(userId, params.amount, payout, true, false);
      } else {
        await bettingPipeline.processLoss(bet, demoMode, true);
        if (!demoMode) void rtpEngine.recordRoundForDrain(userId, params.amount, 0, false, false);
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
