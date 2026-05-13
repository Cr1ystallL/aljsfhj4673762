import { BaseGameEngine } from '../../game-engine/base-game-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { logger } from '../../utils/logger.js';
import type { GameRound, Bet, GameTick, GameConfig } from '../../game-engine/types.js';

/**
 * Crash Game Engine - Production Implementation
 * High-frequency multiplayer crash game
 * 
 * FEATURES:
 * - 100ms tick rate (10 updates/second)
 * - Exponential multiplier growth
 * - Real-time cashout queue processing
 * - Provably fair crash point
 * - Auto-bet and auto-cashout support
 * - Historical round tracking
 * - Late-join synchronization
 */

interface CrashState {
  currentMultiplier: number;
  crashPoint: number;
  elapsedTime: number;
  startTime: number;
  cashedOutPlayers: Map<string, { multiplier: number; payout: number; timestamp: number }>;
  cashoutQueue: Array<{ userId: string; timestamp: number }>;
  autoCashouts: Map<string, number>; // userId -> target multiplier
}

interface CrashHistory {
  roundId: string;
  crashPoint: number;
  timestamp: number;
  playerCount: number;
  totalWagered: number;
}

export class CrashGameEngine extends BaseGameEngine {
  private crashState: CrashState = {
    currentMultiplier: 1.0,
    crashPoint: 0,
    elapsedTime: 0,
    startTime: 0,
    cashedOutPlayers: new Map(),
    cashoutQueue: [],
    autoCashouts: new Map(),
  };

  private history: CrashHistory[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly WAITING_TIME = 8000; // 8s betting phase
  private readonly COUNTDOWN_TIME = 3000; // 3s countdown
  private readonly MIN_PLAYERS = 0; // Minimum players to start (0 = no minimum)
  private readonly ROOM_CLEANUP_TIMEOUT = 300000; // 5 minutes of inactivity
  private waitingTimeout?: NodeJS.Timeout;
  private countdownTimeout?: NodeJS.Timeout;
  private lastActivityTime: number = Date.now();

  constructor(gameId: string) {
    const config: GameConfig = {
      minBet: 0.1,
      maxBet: 10000,
      maxPlayers: 100,
      tickRate: 100, // 100ms = 10 ticks/second
      autoStartDelay: 3000,
      provablyFair: true,
    };

    super(gameId, 'crash', config);
    
    // Start room cleanup monitor
    this.startCleanupMonitor();
  }

  /**
   * Create new round with provably fair crash point
   */
  protected async createRound(): Promise<GameRound> {
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.room.currentRound?.nonce || 0) + 1;

    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    const crashPoint = provablyFair.generateCrashMultiplier(hash);

    this.crashState = {
      currentMultiplier: 1.0,
      crashPoint,
      elapsedTime: 0,
      startTime: 0,
      cashedOutPlayers: new Map(),
      cashoutQueue: [],
      autoCashouts: new Map(),
    };

    const round: GameRound = {
      id: `crash_${Date.now()}_${nonce}`,
      gameId: this.gameId,
      state: 'waiting',
      startedAt: Date.now(),
      seed: hash,
      serverSeed,
      clientSeed,
      nonce,
      metadata: {
        crashPoint,
        serverSeedHash: provablyFair.hashServerSeed(serverSeed),
      },
    };

    this.emitEvent('round:created', {
      roundId: round.id,
      serverSeedHash: round.metadata?.serverSeedHash as string,
      history: this.history.slice(-10),
    });

    // Auto-start waiting phase
    setTimeout(() => {
      this.startWaitingPhase();
    }, 1000);

    logger.info({ roundId: round.id, crashPoint }, 'Crash round created');

    return round;
  }

  /**
   * Start waiting phase (betting period)
   */
  private startWaitingPhase(): void {
    this.clearTimeouts();
    
    this.emitEvent('phase:waiting', {
      duration: this.WAITING_TIME,
    });

    this.waitingTimeout = setTimeout(() => {
      const activePlayers = Array.from(this.room.players.values()).filter(p => p.bet).length;
      
      if (activePlayers >= this.MIN_PLAYERS) {
        this.startCountdown();
      } else {
        // Not enough players, restart waiting
        logger.debug({ activePlayers, minPlayers: this.MIN_PLAYERS }, 'Not enough players, restarting waiting phase');
        this.startWaitingPhase();
      }
    }, this.WAITING_TIME);
  }

  /**
   * Start countdown phase
   */
  private startCountdown(): void {
    this.clearTimeouts();
    this.room.state = 'starting';
    
    this.emitEvent('phase:countdown', {
      duration: this.COUNTDOWN_TIME,
    });

    this.countdownTimeout = setTimeout(() => {
      this.activateRound();
    }, this.COUNTDOWN_TIME);
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.waitingTimeout) {
      clearTimeout(this.waitingTimeout);
      this.waitingTimeout = undefined;
    }
    if (this.countdownTimeout) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = undefined;
    }
  }

  /**
   * Start room cleanup monitor
   */
  private startCleanupMonitor(): void {
    setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      
      if (inactiveTime > this.ROOM_CLEANUP_TIMEOUT && this.room.players.size === 0) {
        logger.info({ gameId: this.gameId, inactiveTime }, 'Room inactive, stopping engine');
        this.stop();
      }
    }, 60000); // Check every minute
  }

  /**
   * Update activity timestamp
   */
  private updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Process bet placement
   */
  protected async processBet(bet: Bet, demoMode: boolean): Promise<void> {
    this.updateActivity();
    // Use unified betting pipeline
    await bettingPipeline.processBet(bet, demoMode);
  }

  /**
   * Check if bets can be placed
   */
  protected canPlaceBet(): boolean {
    return this.room.state === 'waiting' || this.room.state === 'starting';
  }

  /**
   * Get current tick state
   */
  protected getTickState(): any {
    return {
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
    };
  }

  /**
   * Handle round start
   */
  protected onRoundStarted(round: GameRound): void {
    this.crashState.startTime = Date.now();
    
    this.emitEvent('phase:active', {
      startTime: this.crashState.startTime,
    });

    logger.info({ roundId: round.id }, 'Crash round started');
  }

  /**
   * Handle game tick (100ms intervals)
   */
  protected onTick(tick: GameTick): void {
    if (this.room.state !== 'active') {
      return;
    }

    this.crashState.elapsedTime += tick.deltaTime;

    // Exponential growth: multiplier = e^(0.00006 * time)
    const growthRate = 0.00006;
    this.crashState.currentMultiplier = Math.pow(
      Math.E,
      growthRate * this.crashState.elapsedTime
    );

    // Process cashout queue
    this.processCashoutQueue();

    // Check auto-cashouts
    this.checkAutoCashouts();

    // Check if crashed
    if (this.crashState.currentMultiplier >= this.crashState.crashPoint) {
      this.crash();
      return;
    }

    // Emit tick update
    this.emitEvent('multiplier:update', {
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
      activePlayers: this.getActivePlayers(),
    });
  }

  /**
   * Process cashout queue
   */
  private processCashoutQueue(): void {
    while (this.crashState.cashoutQueue.length > 0) {
      const { userId, timestamp } = this.crashState.cashoutQueue.shift()!;
      
      try {
        this.executeCashout(userId, timestamp);
      } catch (error) {
        logger.error(error, 'Failed to process cashout');
      }
    }
  }

  /**
   * Check and execute auto-cashouts
   */
  private checkAutoCashouts(): void {
    for (const [userId, targetMultiplier] of this.crashState.autoCashouts.entries()) {
      if (this.crashState.currentMultiplier >= targetMultiplier) {
        this.queueCashout(userId);
        this.crashState.autoCashouts.delete(userId);
      }
    }
  }

  /**
   * Queue cashout request
   */
  queueCashout(userId: string): void {
    this.updateActivity();
    
    const player = this.room.players.get(userId);
    if (!player || !player.bet || player.bet.state !== 'active') {
      return;
    }

    if (this.crashState.cashedOutPlayers.has(userId)) {
      return;
    }

    this.crashState.cashoutQueue.push({
      userId,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute cashout
   */
  private async executeCashout(userId: string, timestamp: number): Promise<void> {
    const player = this.room.players.get(userId);
    if (!player || !player.bet) {
      return;
    }

    const bet = player.bet;
    const multiplier = this.crashState.currentMultiplier;
    const cashoutAmount = bet.amount * multiplier;

    this.crashState.cashedOutPlayers.set(userId, {
      multiplier,
      payout: cashoutAmount,
      timestamp,
    });

    bet.multiplier = multiplier;
    bet.payout = cashoutAmount;

    await bettingPipeline.processCashout(bet, cashoutAmount, multiplier, player.demoMode);

    this.emitEvent('player:cashout', {
      userId,
      multiplier: parseFloat(multiplier.toFixed(2)),
      payout: parseFloat(cashoutAmount.toFixed(2)),
      timestamp,
    });

    logger.info({ userId, multiplier, payout: cashoutAmount }, 'Player cashed out');
  }

  /**
   * Set auto-cashout for player
   */
  setAutoCashout(userId: string, targetMultiplier: number): void {
    if (targetMultiplier < 1.01) {
      throw new Error('Auto-cashout must be at least 1.01x');
    }

    this.crashState.autoCashouts.set(userId, targetMultiplier);

    this.emitEvent('player:auto_cashout_set', {
      userId,
      targetMultiplier,
    });
  }

  /**
   * Get active players (not cashed out)
   */
  private getActivePlayers(): Array<{ userId: string; betAmount: number }> {
    const active: Array<{ userId: string; betAmount: number }> = [];

    for (const [userId, player] of this.room.players.entries()) {
      if (player.bet && player.bet.state === 'active' && !this.crashState.cashedOutPlayers.has(userId)) {
        active.push({
          userId,
          betAmount: player.bet.amount,
        });
      }
    }

    return active;
  }

  /**
   * Handle crash event
   */
  private async crash(): Promise<void> {
    const crashPoint = this.crashState.crashPoint;

    this.emitEvent('game:crashed', {
      crashPoint: parseFloat(crashPoint.toFixed(2)),
      finalMultiplier: parseFloat(this.crashState.currentMultiplier.toFixed(2)),
      cashedOutCount: this.crashState.cashedOutPlayers.size,
      totalPlayers: this.room.players.size,
    });

    // Calculate stats
    const totalWagered = Array.from(this.room.players.values())
      .reduce((sum, p) => sum + (p.bet?.amount || 0), 0);

    // Add to history
    this.history.push({
      roundId: this.room.currentRound!.id,
      crashPoint,
      timestamp: Date.now(),
      playerCount: this.room.players.size,
      totalWagered,
    });

    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    await this.endRound({
      crashPoint,
      finalMultiplier: this.crashState.currentMultiplier,
      cashedOutPlayers: Array.from(this.crashState.cashedOutPlayers.entries()).map(([userId, data]) => ({
        userId,
        ...data,
      })),
      totalWagered,
    });

    logger.info({ crashPoint, players: this.room.players.size }, 'Crash occurred');
  }

  /**
   * Resolve all bets after crash
   */
  protected async resolveBets(result: any): Promise<void> {
    const { crashPoint } = result;

    for (const [userId, player] of this.room.players.entries()) {
      if (!player.bet || player.bet.state !== 'active') {
        continue;
      }

      // Skip cashed out players
      if (this.crashState.cashedOutPlayers.has(userId)) {
        continue;
      }

      // Player lost
      await bettingPipeline.processLoss(player.bet);

      this.emitEvent('player:lost', {
        userId,
        betAmount: player.bet.amount,
        crashPoint: parseFloat(crashPoint.toFixed(2)),
      });
    }
  }

  /**
   * Handle round completion
   */
  protected onRoundCompleted(round: GameRound, result: any): void {
    // Reveal server seed for verification
    this.emitEvent('round:completed', {
      roundId: round.id,
      crashPoint: result.crashPoint,
      serverSeed: round.serverSeed,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      cashedOutPlayers: result.cashedOutPlayers,
    });

    // Clear player bets
    for (const player of this.room.players.values()) {
      player.bet = undefined;
    }

    logger.info({ roundId: round.id, crashPoint: result.crashPoint }, 'Crash round completed');
  }

  /**
   * Get crash history
   */
  getHistory(): CrashHistory[] {
    return [...this.history];
  }

  /**
   * Get current crash state (for late join)
   */
  getCurrentState(): any {
    return {
      phase: this.room.state,
      multiplier: this.crashState.currentMultiplier,
      elapsedTime: this.crashState.elapsedTime,
      activePlayers: this.getActivePlayers(),
      cashedOutPlayers: Array.from(this.crashState.cashedOutPlayers.entries()).map(([userId, data]) => ({
        userId,
        ...data,
      })),
      history: this.history.slice(-10),
    };
  }
}
