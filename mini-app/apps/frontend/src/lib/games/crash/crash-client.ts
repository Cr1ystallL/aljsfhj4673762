import { BaseGameClient } from '../../game-engine/base-game-client';
import type { GameEvent, GameTick, GameRoom } from '../../game-engine/types';

/**
 * Crash Game Client - Production Implementation
 * 
 * FEATURES:
 * - Smooth 60fps interpolation between 100ms server ticks
 * - Latency compensation
 * - Historical graph rendering
 * - Real-time player feed
 * - Auto-bet and auto-cashout
 * - Provably fair verification
 */

interface CrashVisualState {
  displayMultiplier: number;
  targetMultiplier: number;
  graphPoints: Array<{ time: number; multiplier: number }>;
  isCrashed: boolean;
  crashPoint?: number;
  phase: 'waiting' | 'countdown' | 'active' | 'crashed';
  countdownRemaining?: number;
  waitingRemaining?: number;
}

interface CrashPlayer {
  userId: string;
  betAmount: number;
  cashedOut?: boolean;
  cashoutMultiplier?: number;
  payout?: number;
}

export class CrashGameClient extends BaseGameClient {
  private crashVisual: CrashVisualState = {
    displayMultiplier: 1.0,
    targetMultiplier: 1.0,
    graphPoints: [],
    isCrashed: false,
    phase: 'waiting',
  };

  private players: Map<string, CrashPlayer> = new Map();
  private history: Array<{ crashPoint: number; timestamp: number }> = [];
  private roundStartTime: number = 0;

  constructor(roomId: string) {
    super('crash', roomId);
  }

  /**
   * Process game event from server
   */
  protected processEvent(event: GameEvent): void {
    switch (event.type) {
      case 'round:created':
        this.handleRoundCreated(event);
        break;

      case 'phase:waiting':
        this.handleWaitingPhase(event);
        break;

      case 'phase:countdown':
        this.handleCountdownPhase(event);
        break;

      case 'phase:active':
        this.handleActivePhase(event);
        break;

      case 'bet:placed':
        this.handleBetPlaced(event);
        break;

      case 'player:cashout':
        this.handlePlayerCashout(event);
        break;

      case 'player:lost':
        this.handlePlayerLost(event);
        break;

      case 'game:crashed':
        this.handleCrash(event);
        break;

      case 'round:completed':
        this.handleRoundCompleted(event);
        break;
    }
  }

  /**
   * Process game tick (100ms updates)
   */
  protected processTick(tick: GameTick): void {
    const { multiplier, elapsedTime, activePlayers } = tick.state;

    this.crashVisual.targetMultiplier = multiplier;

    // Add point to graph
    this.crashVisual.graphPoints.push({
      time: elapsedTime,
      multiplier,
    });

    // Trim old points (keep last 200 for smooth curve)
    if (this.crashVisual.graphPoints.length > 200) {
      this.crashVisual.graphPoints.shift();
    }

    // Update active players
    if (activePlayers) {
      for (const { userId, betAmount } of activePlayers) {
        if (!this.players.has(userId)) {
          this.players.set(userId, { userId, betAmount });
        }
      }
    }
  }

  /**
   * Animation frame (60fps)
   * Smooth interpolation between server ticks
   */
  protected onAnimationFrame(deltaTime: number): void {
    if (this.crashVisual.phase !== 'active' || this.crashVisual.isCrashed) {
      return;
    }

    // Smooth interpolation
    this.crashVisual.displayMultiplier = this.interpolate(
      this.crashVisual.displayMultiplier,
      this.crashVisual.targetMultiplier,
      deltaTime,
      0.4 // Fast interpolation for responsiveness
    );

    // Client-side prediction for ultra-smooth feel
    const predicted = this.predictState(deltaTime);
    if (predicted && predicted.multiplier > this.crashVisual.displayMultiplier) {
      this.crashVisual.displayMultiplier = predicted.multiplier;
    }

    this.emit('display:update', {
      multiplier: this.crashVisual.displayMultiplier,
      graphPoints: this.crashVisual.graphPoints,
      phase: this.crashVisual.phase,
    });
  }

  /**
   * Handle round created
   */
  private handleRoundCreated(event: GameEvent): void {
    const { history } = event.payload;

    if (history) {
      this.history = history;
    }

    this.emit('round:created', event.payload);
  }

  /**
   * Handle waiting phase
   */
  private handleWaitingPhase(event: GameEvent): void {
    this.crashVisual.phase = 'waiting';
    this.crashVisual.waitingRemaining = event.payload.duration;

    this.emit('phase:waiting', event.payload);
  }

  /**
   * Handle countdown phase
   */
  private handleCountdownPhase(event: GameEvent): void {
    this.crashVisual.phase = 'countdown';
    this.crashVisual.countdownRemaining = event.payload.duration;

    this.emit('phase:countdown', event.payload);
  }

  /**
   * Handle active phase
   */
  private handleActivePhase(event: GameEvent): void {
    this.crashVisual = {
      displayMultiplier: 1.0,
      targetMultiplier: 1.0,
      graphPoints: [{ time: 0, multiplier: 1.0 }],
      isCrashed: false,
      phase: 'active',
    };

    this.roundStartTime = event.payload.startTime;
    this.players.clear();

    this.startAnimation();

    this.emit('phase:active', event.payload);
  }

  /**
   * Handle bet placed
   */
  private handleBetPlaced(event: GameEvent): void {
    const { userId, bet } = event.payload;

    this.players.set(userId, {
      userId,
      betAmount: bet.amount,
    });

    this.emit('bet:placed', event.payload);
  }

  /**
   * Handle player cashout
   */
  private handlePlayerCashout(event: GameEvent): void {
    const { userId, multiplier, payout } = event.payload;

    const player = this.players.get(userId);
    if (player) {
      player.cashedOut = true;
      player.cashoutMultiplier = multiplier;
      player.payout = payout;
    }

    this.emit('player:cashout', event.payload);
  }

  /**
   * Handle player lost
   */
  private handlePlayerLost(event: GameEvent): void {
    this.emit('player:lost', event.payload);
  }

  /**
   * Handle crash event
   */
  private handleCrash(event: GameEvent): void {
    const { crashPoint, finalMultiplier } = event.payload;

    this.crashVisual.isCrashed = true;
    this.crashVisual.crashPoint = crashPoint;
    this.crashVisual.displayMultiplier = crashPoint;
    this.crashVisual.phase = 'crashed';

    this.stopAnimation();

    this.emit('game:crashed', {
      crashPoint,
      finalMultiplier,
      graphPoints: this.crashVisual.graphPoints,
    });
  }

  /**
   * Handle round completed
   */
  private handleRoundCompleted(event: GameEvent): void {
    const { crashPoint } = event.payload;

    // Add to history
    this.history.unshift({
      crashPoint,
      timestamp: Date.now(),
    });

    if (this.history.length > 50) {
      this.history.pop();
    }

    this.emit('round:completed', event.payload);
  }

  /**
   * Predict future multiplier (latency compensation)
   */
  protected predictState(deltaTime: number): any {
    if (this.crashVisual.isCrashed || this.crashVisual.phase !== 'active') {
      return null;
    }

    const lastPoint = this.crashVisual.graphPoints[this.crashVisual.graphPoints.length - 1];
    if (!lastPoint) {
      return null;
    }

    // Predict based on exponential growth
    const growthRate = 0.00006;
    const predictedTime = lastPoint.time + deltaTime;
    const predictedMultiplier = Math.pow(Math.E, growthRate * predictedTime);

    return {
      multiplier: predictedMultiplier,
      time: predictedTime,
    };
  }

  /**
   * Get current visual state
   */
  getCrashVisualState(): CrashVisualState {
    return { ...this.crashVisual };
  }

  /**
   * Get players
   */
  getPlayers(): CrashPlayer[] {
    return Array.from(this.players.values());
  }

  /**
   * Get history
   */
  getHistory(): Array<{ crashPoint: number; timestamp: number }> {
    return [...this.history];
  }
}

