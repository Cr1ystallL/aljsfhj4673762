import { BaseGameEngine } from '../../game-engine/base-game-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { logger } from '../../utils/logger.js';
import type { GameRound, Bet, GameTick, GameConfig } from '../../game-engine/types.js';

/**
 * Plinko Game Engine - Production Implementation
 * Deterministic ball drop with provably fair outcomes
 * 
 * FEATURES:
 * - Server-authoritative outcomes
 * - Deterministic ball paths
 * - Multiple risk levels
 * - Batch ball drops
 * - Provably fair verification
 */

interface PlinkoState {
  rows: number;
  riskLevel: 'low' | 'medium' | 'high';
  activeBalls: Map<string, PlinkoBall>;
}

interface PlinkoBall {
  id: string;
  userId: string;
  betAmount: number;
  path: number[]; // 0 = left, 1 = right
  finalBucket: number;
  multiplier: number;
  payout: number;
}

// Multiplier tables for different risk levels
const MULTIPLIERS = {
  low: {
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export class PlinkoGameEngine extends BaseGameEngine {
  private plinkoState: PlinkoState = {
    rows: 16,
    riskLevel: 'medium',
    activeBalls: new Map(),
  };

  private ballIdCounter = 0;

  constructor(gameId: string) {
    const config: GameConfig = {
      minBet: 0.1,
      maxBet: 100,
      tickRate: 0, // Event-based
      provablyFair: true,
    };

    super(gameId, 'plinko', config);
  }

  /**
   * Create new round
   */
  protected async createRound(): Promise<GameRound> {
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.room.currentRound?.nonce || 0) + 1;

    const round: GameRound = {
      id: `plinko_${Date.now()}_${nonce}`,
      gameId: this.gameId,
      state: 'active',
      startedAt: Date.now(),
      seed: provablyFair.generateResult(serverSeed, clientSeed, nonce),
      serverSeed,
      clientSeed,
      nonce,
      metadata: {
        serverSeedHash: provablyFair.hashServerSeed(serverSeed),
      },
    };

    return round;
  }

  /**
   * Drop ball
   */
  async dropBall(userId: string, betAmount: number, riskLevel: 'low' | 'medium' | 'high'): Promise<void> {
    // Validate bet
    if (betAmount < this.config.minBet || betAmount > this.config.maxBet) {
      throw new Error(`Bet must be between ${this.config.minBet} and ${this.config.maxBet}`);
    }

    // Get or create player
    let player = this.room.players.get(userId);
    if (!player) {
      this.addPlayer(userId, false);
      player = this.room.players.get(userId)!;
    }

    // Create bet
    const bet: Bet = {
      id: `bet_${Date.now()}_${userId}`,
      userId,
      gameId: this.gameId,
      roundId: this.room.currentRound?.id || '',
      amount: betAmount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { riskLevel },
    };

    // Process bet
    await this.processBet(bet, player.demoMode);

    // Generate ball path using provably fair
    const round = this.room.currentRound || await this.createRound();
    const ballSeed = `${round.seed}_${this.ballIdCounter++}`;
    const path = provablyFair.generatePlinkoPins(ballSeed, this.plinkoState.rows);

    // Calculate final bucket
    const finalBucket = path.reduce((sum, direction) => sum + direction, 0);

    // Get multiplier
    const multipliersForRisk = MULTIPLIERS[riskLevel] as Record<number, number[]>;
    const multipliers = multipliersForRisk[this.plinkoState.rows];
    const multiplier = multipliers[finalBucket];

    // Calculate payout
    const payout = betAmount * multiplier;

    // Create ball
    const ball: PlinkoBall = {
      id: `ball_${Date.now()}_${this.ballIdCounter}`,
      userId,
      betAmount,
      path,
      finalBucket,
      multiplier,
      payout,
    };

    this.plinkoState.activeBalls.set(ball.id, ball);

    // Emit ball dropped event
    this.emitEvent('ball:dropped', {
      ballId: ball.id,
      userId,
      betAmount,
      path,
      riskLevel,
    });

    // Simulate ball drop (emit path events)
    await this.simulateBallDrop(ball);

    // Emit ball landed event
    this.emitEvent('ball:landed', {
      ballId: ball.id,
      userId,
      finalBucket,
      multiplier,
      payout,
    });

    // Process payout - ALWAYS process, even for losses
    bet.multiplier = multiplier;
    bet.payout = payout;

    // Always process payout to save bet with multiplier
    await bettingPipeline.processPayout(bet, payout, player.demoMode);

    // Remove ball
    this.plinkoState.activeBalls.delete(ball.id);

    logger.info(
      { userId, multiplier, payout, finalBucket },
      'Plinko ball completed'
    );
  }

  /**
   * Simulate ball drop with path events
   */
  private async simulateBallDrop(ball: PlinkoBall): Promise<void> {
    for (let row = 0; row < ball.path.length; row++) {
      // Emit pin collision event
      this.emitEvent('ball:pin_collision', {
        ballId: ball.id,
        row,
        direction: ball.path[row],
      });

      // Small delay between pins (for animation)
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Process bet
   */
  protected async processBet(bet: Bet, demoMode: boolean): Promise<void> {
    await bettingPipeline.processBet(bet, demoMode);
  }

  /**
   * Can place bet
   */
  protected canPlaceBet(): boolean {
    return true;
  }

  /**
   * Get tick state
   */
  protected getTickState(): any {
    return null;
  }

  /**
   * Resolve bets
   */
  protected async resolveBets(result: any): Promise<void> {
    // Plinko resolves bets individually
  }

  /**
   * Get active balls
   */
  getActiveBalls(): PlinkoBall[] {
    return Array.from(this.plinkoState.activeBalls.values());
  }
}
