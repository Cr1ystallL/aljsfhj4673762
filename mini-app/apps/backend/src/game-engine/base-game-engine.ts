import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import type {
  GameType,
  GameState,
  GameEvent,
  GameRound,
  GameRoom,
  GameConfig,
  PlayerState,
  Bet,
  GameTick,
} from './types.js';

/**
 * Base Game Engine
 * Abstract foundation for all game implementations
 * 
 * ARCHITECTURE:
 * - Event-driven state management
 * - Deterministic round lifecycle
 * - High-frequency tick support
 * - Provably fair ready
 * - Multiplayer synchronization
 */
export abstract class BaseGameEngine extends EventEmitter {
  protected room: GameRoom;
  protected tickInterval?: NodeJS.Timeout;
  protected sequence: number = 0;
  protected lastTickTime: number = 0;

  constructor(
    protected gameId: string,
    protected gameType: GameType,
    protected config: GameConfig
  ) {
    super();
    
    this.room = {
      id: gameId,
      gameType,
      state: 'idle',
      players: new Map(),
      spectators: new Set(),
      config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Start the game engine
   */
  start(): void {
    if (this.room.state !== 'idle') {
      throw new Error('Game already started');
    }

    this.room.state = 'waiting';
    this.room.updatedAt = Date.now();
    
    this.emitEvent('game:started', {
      gameId: this.gameId,
      config: this.config,
    });

    logger.info({ gameId: this.gameId, gameType: this.gameType }, 'Game engine started');
  }

  /**
   * Stop the game engine
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }

    this.room.state = 'idle';
    this.room.updatedAt = Date.now();
    
    this.emitEvent('game:stopped', {
      gameId: this.gameId,
    });

    logger.info({ gameId: this.gameId }, 'Game engine stopped');
  }

  /**
   * Add player to game
   */
  addPlayer(userId: string, demoMode: boolean = false): void {
    if (this.room.players.has(userId)) {
      return;
    }

    const playerState: PlayerState = {
      userId,
      isActive: true,
      joinedAt: Date.now(),
      lastActionAt: Date.now(),
      demoMode,
    };

    this.room.players.set(userId, playerState);
    this.room.updatedAt = Date.now();

    this.emitEvent('player:joined', {
      userId,
      playerCount: this.room.players.size,
    });

    this.onPlayerJoined(userId);
  }

  /**
   * Remove player from game
   */
  removePlayer(userId: string): void {
    const player = this.room.players.get(userId);
    if (!player) {
      return;
    }

    this.room.players.delete(userId);
    this.room.updatedAt = Date.now();

    this.emitEvent('player:left', {
      userId,
      playerCount: this.room.players.size,
    });

    this.onPlayerLeft(userId);
  }

  /**
   * Add spectator
   */
  addSpectator(userId: string): void {
    this.room.spectators.add(userId);
    
    this.emitEvent('spectator:joined', {
      userId,
      spectatorCount: this.room.spectators.size,
    });
  }

  /**
   * Remove spectator
   */
  removeSpectator(userId: string): void {
    this.room.spectators.delete(userId);
    
    this.emitEvent('spectator:left', {
      userId,
      spectatorCount: this.room.spectators.size,
    });
  }

  /**
   * Place bet
   */
  async placeBet(userId: string, amount: number, metadata?: Record<string, any>): Promise<Bet> {
    // Validate bet amount
    if (amount < this.config.minBet || amount > this.config.maxBet) {
      throw new Error(`Bet amount must be between ${this.config.minBet} and ${this.config.maxBet}`);
    }

    // Validate game state
    if (!this.canPlaceBet()) {
      throw new Error('Cannot place bet in current game state');
    }

    // Get or create player
    let player = this.room.players.get(userId);
    if (!player) {
      this.addPlayer(userId, false); // Default to real mode, should be set by route
      player = this.room.players.get(userId)!;
    }

    // Check if player already has active bet
    if (player.bet && player.bet.state === 'active') {
      throw new Error('Player already has active bet');
    }

    // Create bet (UUID prevents id collisions when same user double-clicks within one ms)
    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: this.gameId,
      roundId: this.room.currentRound?.id || '',
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata,
    };

    // Process bet (with player's demo mode)
    await this.processBet(bet, player.demoMode);

    // Update player state
    player.bet = bet;
    player.lastActionAt = Date.now();
    bet.state = 'active';

    this.emitEvent('bet:placed', {
      bet,
      userId,
    });

    this.onBetPlaced(bet);

    return bet;
  }

  /**
   * Start new round
   */
  protected async startRound(): Promise<void> {
    if (this.room.currentRound && this.room.currentRound.state !== 'completed') {
      throw new Error('Cannot start new round while current round is active');
    }

    const round = await this.createRound();
    this.room.currentRound = round;
    this.room.state = 'starting';
    this.room.updatedAt = Date.now();

    this.emitEvent('round:starting', {
      round,
    });

    // Auto-start after delay
    if (this.config.autoStartDelay) {
      setTimeout(() => {
        this.activateRound();
      }, this.config.autoStartDelay);
    }
  }

  /**
   * Activate round (start gameplay)
   */
  protected activateRound(): void {
    if (!this.room.currentRound) {
      throw new Error('No round to activate');
    }

    this.room.currentRound.state = 'active';
    this.room.state = 'active';
    this.room.updatedAt = Date.now();

    this.emitEvent('round:started', {
      round: this.room.currentRound,
    });

    // Start tick loop for high-frequency games
    if (this.config.tickRate > 0) {
      this.startTickLoop();
    }

    this.onRoundStarted(this.room.currentRound);
  }

  /**
   * End current round
   */
  protected async endRound(result: any): Promise<void> {
    if (!this.room.currentRound) {
      throw new Error('No round to end');
    }

    this.stopTickLoop();

    this.room.currentRound.state = 'resolving';
    this.room.state = 'resolving';
    this.room.currentRound.result = result;
    this.room.currentRound.endedAt = Date.now();

    this.emitEvent('round:resolving', {
      round: this.room.currentRound,
      result,
    });

    // Resolve all bets
    await this.resolveBets(result);

    this.room.currentRound.state = 'completed';
    this.room.state = 'completed';

    this.emitEvent('round:completed', {
      round: this.room.currentRound,
      result,
    });

    this.onRoundCompleted(this.room.currentRound, result);

    // Auto-start next round
    setTimeout(() => {
      this.startRound();
    }, 3000);
  }

  /**
   * Start high-frequency tick loop
   */
  protected startTickLoop(): void {
    if (this.tickInterval) {
      return;
    }

    this.lastTickTime = Date.now();

    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = now - this.lastTickTime;
      this.lastTickTime = now;

      const tick: GameTick = {
        roundId: this.room.currentRound?.id || '',
        sequence: this.sequence++,
        timestamp: now,
        deltaTime,
        state: this.getTickState(),
      };

      this.onTick(tick);

      this.emitEvent('game:tick', tick);
    }, this.config.tickRate);
  }

  /**
   * Stop tick loop
   */
  protected stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  /**
   * Emit game event
   */
  protected emitEvent<T = any>(type: string, payload: T): void {
    const event: GameEvent<T> = {
      type,
      gameId: this.gameId,
      roundId: this.room.currentRound?.id || '',
      timestamp: Date.now(),
      sequence: this.sequence++,
      payload,
    };

    this.emit('event', event);
  }

  /**
   * Get current game state snapshot
   */
  getState(): GameRoom {
    return {
      ...this.room,
      players: new Map(this.room.players),
      spectators: new Set(this.room.spectators),
    };
  }

  // Abstract methods to be implemented by specific games

  protected abstract createRound(): Promise<GameRound>;
  protected abstract processBet(bet: Bet, demoMode: boolean): Promise<void>;
  protected abstract resolveBets(result: any): Promise<void>;
  protected abstract canPlaceBet(): boolean;
  protected abstract getTickState(): any;

  // Optional lifecycle hooks
  protected onPlayerJoined(userId: string): void {}
  protected onPlayerLeft(userId: string): void {}
  protected onBetPlaced(bet: Bet): void {}
  protected onRoundStarted(round: GameRound): void {}
  protected onRoundCompleted(round: GameRound, result: any): void {}
  protected onTick(tick: GameTick): void {}
}
