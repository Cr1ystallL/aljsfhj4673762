import { BaseGameEngine } from '../../game-engine/base-game-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { logger } from '../../utils/logger.js';
import type { GameRound, Bet, GameTick, GameConfig } from '../../game-engine/types.js';

/**
 * Mines Game Engine - Production Implementation
 * Turn-based mine sweeper with progressive multipliers
 * 
 * FEATURES:
 * - Server-authoritative mine validation
 * - Progressive multiplier system
 * - Cashout at any point
 * - Provably fair mine placement
 * - Rollback-safe reveals
 */

interface MinesState {
  gridSize: number;
  mineCount: number;
  minePositions: number[];
  revealedTiles: Set<number>;
  currentMultiplier: number;
  isActive: boolean;
}

interface MinesConfig {
  gridSize: number; // 5x5 = 25 tiles
  mineCount: number; // 3-24 mines
}

const MULTIPLIER_TABLE: Record<number, number[]> = {
  // mineCount -> [multiplier per safe tile revealed]
  3: [1.08, 1.17, 1.29, 1.41, 1.56, 1.74, 1.94, 2.18, 2.47, 2.83, 3.26, 3.79, 4.46, 5.29, 6.35, 7.71, 9.51, 11.94, 15.29, 19.98, 26.64, 37.29],
  5: [1.13, 1.29, 1.48, 1.71, 2.00, 2.35, 2.79, 3.35, 4.06, 5.00, 6.24, 7.90, 10.17, 13.33, 17.88, 24.44, 34.09, 49.41, 74.12, 120.00],
  10: [1.28, 1.71, 2.28, 3.16, 4.50, 6.63, 10.13, 16.21, 27.36, 49.25, 98.50, 230.17, 690.50],
  15: [1.48, 2.28, 3.80, 6.84, 13.68, 30.40, 76.00, 228.00, 912.00],
  20: [2.00, 4.00, 10.00, 30.00, 120.00],
  24: [3.00, 12.00, 120.00],
};

export class MinesGameEngine extends BaseGameEngine {
  private minesState: Map<string, MinesState> = new Map(); // userId -> state

  constructor(gameId: string) {
    const config: GameConfig = {
      minBet: 0.1,
      maxBet: 1000,
      tickRate: 0, // Turn-based, no tick loop
      provablyFair: true,
    };

    super(gameId, 'mines', config);
  }

  /**
   * Create new round (per-player)
   */
  protected async createRound(): Promise<GameRound> {
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.room.currentRound?.nonce || 0) + 1;

    const round: GameRound = {
      id: `mines_${Date.now()}_${nonce}`,
      gameId: this.gameId,
      state: 'waiting',
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
   * Start game for player
   */
  async startGame(userId: string, mineCount: number): Promise<void> {
    const player = this.room.players.get(userId);
    if (!player || !player.bet) {
      throw new Error('No active bet');
    }

    if (mineCount < 3 || mineCount > 24) {
      throw new Error('Mine count must be between 3 and 24');
    }

    const gridSize = 25; // 5x5 grid

    // Generate mine positions using provably fair
    const round = this.room.currentRound || await this.createRound();
    const minePositions = provablyFair.generateMinesPositions(
      round.seed,
      gridSize,
      mineCount
    );

    // Initialize player state
    const state: MinesState = {
      gridSize,
      mineCount,
      minePositions,
      revealedTiles: new Set(),
      currentMultiplier: 1.0,
      isActive: true,
    };

    this.minesState.set(userId, state);

    this.emitEvent('game:started', {
      userId,
      gridSize,
      mineCount,
      serverSeedHash: round.metadata?.serverSeedHash as string,
    });

    logger.info({ userId, mineCount }, 'Mines game started');
  }

  /**
   * Reveal tile
   */
  async revealTile(userId: string, position: number): Promise<void> {
    const state = this.minesState.get(userId);
    if (!state || !state.isActive) {
      throw new Error('No active game');
    }

    if (position < 0 || position >= state.gridSize) {
      throw new Error('Invalid position');
    }

    if (state.revealedTiles.has(position)) {
      throw new Error('Tile already revealed');
    }

    // Check if mine
    const isMine = state.minePositions.includes(position);

    state.revealedTiles.add(position);

    if (isMine) {
      // Hit mine - game over
      state.isActive = false;

      await this.handleLoss(userId);

      this.emitEvent('tile:revealed', {
        userId,
        position,
        isMine: true,
        revealedCount: state.revealedTiles.size,
        gameOver: true,
      });

      this.emitEvent('game:lost', {
        userId,
        minePositions: state.minePositions,
      });

      logger.info({ userId, position }, 'Player hit mine');
    } else {
      // Safe tile - update multiplier
      const safeReveals = state.revealedTiles.size;
      const multiplierTable = MULTIPLIER_TABLE[state.mineCount];
      
      if (multiplierTable && safeReveals <= multiplierTable.length) {
        state.currentMultiplier = multiplierTable[safeReveals - 1];
      }

      this.emitEvent('tile:revealed', {
        userId,
        position,
        isMine: false,
        revealedCount: state.revealedTiles.size,
        currentMultiplier: state.currentMultiplier,
        gameOver: false,
      });

      logger.info(
        { userId, position, multiplier: state.currentMultiplier },
        'Safe tile revealed'
      );
    }
  }

  /**
   * Cashout
   */
  async cashout(userId: string): Promise<void> {
    const state = this.minesState.get(userId);
    if (!state || !state.isActive) {
      throw new Error('No active game');
    }

    const player = this.room.players.get(userId);
    if (!player || !player.bet) {
      throw new Error('No active bet');
    }

    if (state.revealedTiles.size === 0) {
      throw new Error('Must reveal at least one tile');
    }

    state.isActive = false;

    const bet = player.bet;
    const payout = bet.amount * state.currentMultiplier;

    bet.multiplier = state.currentMultiplier;
    bet.payout = payout;

    await bettingPipeline.processPayout(bet, payout, player.demoMode);

    this.emitEvent('game:cashout', {
      userId,
      multiplier: state.currentMultiplier,
      payout,
      revealedCount: state.revealedTiles.size,
      minePositions: state.minePositions,
    });

    this.minesState.delete(userId);

    logger.info(
      { userId, multiplier: state.currentMultiplier, payout },
      'Player cashed out'
    );
  }

  /**
   * Handle loss
   */
  private async handleLoss(userId: string): Promise<void> {
    const player = this.room.players.get(userId);
    if (!player || !player.bet) {
      return;
    }

    await bettingPipeline.processLoss(player.bet);

    this.minesState.delete(userId);
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
    return true; // Always can bet in mines
  }

  /**
   * Get tick state (not used)
   */
  protected getTickState(): any {
    return null;
  }

  /**
   * Resolve bets (not used in mines)
   */
  protected async resolveBets(result: any): Promise<void> {
    // Mines resolves bets individually
  }

  /**
   * Get player state
   */
  getPlayerState(userId: string): MinesState | null {
    return this.minesState.get(userId) || null;
  }
}
