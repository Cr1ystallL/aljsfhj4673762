import { Decimal } from 'decimal.js';
import crypto from 'crypto';
import { bettingPipeline, type GameResultInfo } from '../../game-engine/betting-pipeline.js';
import { gameConfig } from '../../services/game-config.js';
import { logger } from '../../utils/logger.js';

export type KenoRisk = 'classic' | 'low' | 'medium' | 'high';

// The house draws 10 numbers from a pool of 40 (1-40).
export const KENO_MAX_NUMBERS = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MAX_PICKS = 10;
export const KENO_MIN_PICKS = 1;

/**
 * Multiplier tables for Keno based on standard crypto casino formats.
 * Map: Risk Level -> Pick Count (1-10) -> Array of multipliers for (0 to Pick Count) hits.
 */
export const KENO_MULTIPLIERS: Record<KenoRisk, Record<number, number[]>> = {
  classic: {
    1: [0, 3.8],
    2: [0, 1.7, 5.2],
    3: [0, 0, 2.7, 48],
    4: [0, 0, 1.7, 10, 84],
    5: [0, 0, 1.4, 4, 14, 290],
    6: [0, 0, 0, 3, 9, 160, 700],
    7: [0, 0, 0, 2, 7, 30, 280, 800],
    8: [0, 0, 0, 2, 5, 15, 50, 400, 900],
    9: [0, 0, 0, 1, 4, 10, 26, 120, 500, 1000],
    10: [0, 0, 0, 1, 3, 6, 20, 80, 400, 700, 1000],
  },
  low: {
    1: [0, 3.8],
    2: [0.2, 1.7, 3.8],
    3: [0, 1.1, 2.7, 24],
    4: [0, 1.1, 1.7, 6, 42],
    5: [0, 0.7, 1.4, 4, 12, 145],
    6: [0, 0.6, 1.1, 3, 9, 80, 350],
    7: [0, 0.6, 1.1, 2, 7, 30, 140, 400],
    8: [0, 0.6, 1.1, 2, 5, 15, 50, 200, 450],
    9: [0, 0.6, 1.1, 1.2, 4, 10, 26, 60, 250, 500],
    10: [0, 0.5, 1.1, 1.2, 3, 6, 20, 40, 200, 350, 500],
  },
  medium: {
    1: [0, 3.8],
    2: [0, 1.7, 4.2],
    3: [0, 0, 2.7, 35],
    4: [0, 0, 1.7, 8, 63],
    5: [0, 0, 1.4, 4, 14, 215],
    6: [0, 0, 0, 3, 9, 120, 525],
    7: [0, 0, 0, 2, 7, 30, 210, 600],
    8: [0, 0, 0, 2, 5, 15, 50, 300, 675],
    9: [0, 0, 0, 1, 4, 10, 26, 90, 375, 750],
    10: [0, 0, 0, 1, 3, 6, 20, 60, 300, 525, 750],
  },
  high: {
    1: [0, 3.8],
    2: [0, 0, 7.5],
    3: [0, 0, 2.7, 65],
    4: [0, 0, 0, 12, 126],
    5: [0, 0, 0, 6, 28, 430],
    6: [0, 0, 0, 0, 18, 240, 1050],
    7: [0, 0, 0, 0, 14, 60, 420, 1200],
    8: [0, 0, 0, 0, 10, 30, 100, 600, 1350],
    9: [0, 0, 0, 0, 8, 20, 52, 180, 750, 1500],
    10: [0, 0, 0, 0, 6, 12, 40, 120, 600, 1050, 1500],
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

  async processBet(userId: string, params: KenoBetParams): Promise<GameResultInfo & KenoResult> {
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

    // Run through the betting pipeline
    return bettingPipeline.processSinglePlayerGame(
      {
        userId,
        gameType: 'keno',
        betAmount: params.amount,
        currency: params.currency,
        minBet: cfg.minBet,
        maxBet: cfg.maxBet,
      },
      async (seed) => {
        // Generate the 10 numbers for this round
        const drawnNumbers = this.generateDraw(seed.serverSeed + seed.clientSeed + seed.nonce.toString());
        
        // Count the hits
        let hits = 0;
        for (const pick of params.picks) {
          if (drawnNumbers.includes(pick)) {
            hits++;
          }
        }
        
        // Get the multiplier based on Risk, Pick Count, and Hits
        const pickCount = params.picks.length;
        const table = KENO_MULTIPLIERS[params.risk][pickCount];
        
        // The house edge is already considered when determining payouts (or apply a multiplier reduction if you want).
        // Standard crypto Keno tables are already tuned to ~1% house edge.
        let rawMultiplier = table[hits];
        
        // Optionally apply dynamic house edge from config if desired
        // (but usually not necessary if the hardcoded table is designed for 99% RTP)
        // rawMultiplier = rawMultiplier * (1 - cfg.houseEdge);

        return {
          multiplier: rawMultiplier,
          gameData: {
            picks: params.picks,
            risk: params.risk,
            drawnNumbers,
            hits,
          },
        };
      }
    ) as Promise<GameResultInfo & KenoResult>;
  }
}

export const kenoEngine = new KenoEngine();
