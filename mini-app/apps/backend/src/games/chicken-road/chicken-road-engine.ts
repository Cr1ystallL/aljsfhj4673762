import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { gameConfig } from '../../services/game-config.js';
import type { Bet } from '../../game-engine/types.js';

export type ChickenRoadLevel = 'easy' | 'medium' | 'hard';

export const CHICKEN_ROAD_LEVELS: ReadonlyArray<ChickenRoadLevel> = ['easy', 'medium', 'hard'];

const LEVEL_LANES: Record<ChickenRoadLevel, number> = {
  easy: 10,
  medium: 12,
  hard: 15,
};

const LEVEL_SURVIVAL_CHANCE: Record<ChickenRoadLevel, number> = {
  easy: 0.90, // 90% survival per lane
  medium: 0.85, // 85% survival
  hard: 0.80, // 80% survival
};

const RTP = 0.96;

/**
 * Multiplier earned after CROSSING `step` lanes, indexed 1..lanesCount.
 * Computed from `0.96 / P(survive_step)^step`.
 */
function calculateMultipliers(level: ChickenRoadLevel, maxLanes: number): number[] {
  const multipliers: number[] = [];
  const p = LEVEL_SURVIVAL_CHANCE[level];
  for (let i = 1; i <= maxLanes; i++) {
    const survivalProb = Math.pow(p, i);
    // Round to 2 decimal places
    const m = Math.floor((RTP / survivalProb) * 100) / 100;
    // Ensure multiplier is at least 1.01
    multipliers.push(Math.max(1.01, m));
  }
  return multipliers;
}

export const CHICKEN_ROAD_MULTIPLIERS: Record<ChickenRoadLevel, number[]> = {
  easy: calculateMultipliers('easy', LEVEL_LANES.easy),
  medium: calculateMultipliers('medium', LEVEL_LANES.medium),
  hard: calculateMultipliers('hard', LEVEL_LANES.hard),
};

interface ChickenRoadGame {
  userId: string;
  bet: Bet;
  level: ChickenRoadLevel;
  lanesCount: number;
  /**
   * Lane index (1-indexed) where the chicken dies.
   * If null or > lanesCount, it means the chicken survives all lanes.
   */
  crashLane: number | null;
  /** Current lane the chicken is standing on. 0 = sidewalk. */
  currentLane: number;
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

export interface ChickenRoadPublicState {
  roundId: string;
  level: ChickenRoadLevel;
  betAmount: number;
  lanesCount: number;
  currentLane: number;
  crashLane: number | null; // Only exposed when game ends
  currentMultiplier: number;
  nextMultiplier: number;
  ladder: number[];
  state: 'active' | 'cashed' | 'busted';
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  finalMultiplier?: number;
  finalPayout?: number;
  serverSeed?: string; // Revealed on end
}

class ChickenRoadEngine {
  private activeGames = new Map<string, ChickenRoadGame>();

  private toPublicState(game: ChickenRoadGame): ChickenRoadPublicState {
    const isEnded = game.state !== 'active';
    const ladder = CHICKEN_ROAD_MULTIPLIERS[game.level];
    
    // currentMultiplier is the multiplier for the lane we are standing on right now
    const currentMultiplier = game.currentLane > 0 ? ladder[game.currentLane - 1] : 0;
    // nextMultiplier is the multiplier for the NEXT step
    const nextMultiplier = game.currentLane < game.lanesCount ? ladder[game.currentLane] : 0;

    return {
      roundId: game.bet.roundId,
      level: game.level,
      betAmount: game.bet.amount,
      lanesCount: game.lanesCount,
      currentLane: game.currentLane,
      crashLane: isEnded ? game.crashLane : null, // keep secret until over
      currentMultiplier,
      nextMultiplier,
      ladder,
      state: game.state,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      finalMultiplier: game.finalMultiplier,
      finalPayout: game.finalPayout,
      serverSeed: isEnded ? game.serverSeed : undefined,
    };
  }

  public getActiveGame(userId: string): ChickenRoadPublicState | null {
    const g = this.activeGames.get(userId);
    return g ? this.toPublicState(g) : null;
  }

  public async placeBet(
    userId: string,
    amount: number,
    level: ChickenRoadLevel
  ): Promise<ChickenRoadPublicState> {
    if (this.activeGames.has(userId)) {
      throw new Error('You already have an active Chicken Road game.');
    }

    const config = await gameConfig.get('chicken-road');
    if (config.paused) throw new Error('Game is temporarily paused.');
    if (amount < config.minBet || amount > config.maxBet) {
      throw new Error(`Bet must be between ${config.minBet} and ${config.maxBet}.`);
    }

    const { serverSeed, serverSeedHash, clientSeed, nonce } = await provablyFair.rotate(userId, 'chicken-road');
    const lanesCount = LEVEL_LANES[level];
    const survivalChance = LEVEL_SURVIVAL_CHANCE[level];

    // Determine crash lane using RNG
    let crashLane: number | null = null;
    let combinedSeed = `${serverSeed}:${clientSeed}:${nonce}`;
    // We sample a float [0, 1) for each step
    for (let i = 1; i <= lanesCount; i++) {
      const float = provablyFair.generateFloat(combinedSeed + `:${i}`);
      if (float > survivalChance) { // Example: if chance is 0.9, then any float > 0.9 means death
        crashLane = i;
        break;
      }
    }

    const bet = await bettingPipeline.deductBet({
      userId,
      amount,
      gameType: 'chicken-road',
      wagerMultiplier: config.wagerContribution,
    });

    const game: ChickenRoadGame = {
      userId,
      bet,
      level,
      lanesCount,
      crashLane,
      currentLane: 0,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      state: 'active',
      startedAt: Date.now(),
    };

    this.activeGames.set(userId, game);

    // The user requested: "курица сразу делает автоматом ход с тратуара на 1 люк"
    // So we automatically apply the first step.
    return this.step(userId);
  }

  public async step(userId: string): Promise<ChickenRoadPublicState> {
    const game = this.activeGames.get(userId);
    if (!game) throw new Error('No active game found.');
    if (game.state !== 'active') throw new Error('Game is already finished.');

    game.currentLane += 1;

    if (game.crashLane === game.currentLane) {
      // Busted!
      game.state = 'busted';
      game.finishedAt = Date.now();
      game.finalMultiplier = 0;
      game.finalPayout = 0;
      
      this.activeGames.delete(userId);
      await this.saveHistory(game);
      return this.toPublicState(game);
    }

    // Survived
    if (game.currentLane === game.lanesCount) {
      // Reached the end, auto-cashout
      return this.cashout(userId);
    }

    return this.toPublicState(game);
  }

  public async cashout(userId: string): Promise<ChickenRoadPublicState> {
    const game = this.activeGames.get(userId);
    if (!game) throw new Error('No active game found.');
    if (game.state !== 'active') throw new Error('Game is already finished.');
    if (game.currentLane === 0) throw new Error('Cannot cashout before making the first step.');

    const ladder = CHICKEN_ROAD_MULTIPLIERS[game.level];
    const multiplier = ladder[game.currentLane - 1];
    const payout = Math.floor(game.bet.amount * multiplier * 100) / 100;

    game.state = 'cashed';
    game.finishedAt = Date.now();
    game.finalMultiplier = multiplier;
    game.finalPayout = payout;

    await bettingPipeline.creditWin({
      userId,
      roundId: game.bet.roundId,
      amount: payout,
      gameType: 'chicken-road',
      multiplier,
    });

    this.activeGames.delete(userId);
    await this.saveHistory(game);
    return this.toPublicState(game);
  }

  private async saveHistory(game: ChickenRoadGame) {
    try {
      await prisma.gameHistory.create({
        data: {
          id: game.bet.roundId,
          userId: game.userId,
          gameType: 'chicken-road',
          betAmount: game.bet.amount,
          multiplier: game.finalMultiplier ?? 0,
          payout: game.finalPayout ?? 0,
          status: game.state === 'cashed' ? 'WON' : 'LOST',
          serverSeed: game.serverSeed,
          clientSeed: game.clientSeed,
          nonce: game.nonce,
          details: {
            level: game.level,
            lanesCount: game.lanesCount,
            crashLane: game.crashLane,
            currentLane: game.currentLane,
            ladder: CHICKEN_ROAD_MULTIPLIERS[game.level],
          },
        },
      });
    } catch (error) {
      logger.error({ error, roundId: game.bet.roundId }, 'Failed to save Chicken Road history');
    }
  }
}

export const chickenRoadEngine = new ChickenRoadEngine();
