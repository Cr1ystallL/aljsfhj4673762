import { EventEmitter } from 'events';
import type {
  GameType,
  GameState,
  GameEvent,
  GameRoom,
  GameTick,
  VisualState,
  LatencyData,
} from './types';

/**
 * Base Game Client
 * Frontend game engine foundation
 * 
 * ARCHITECTURE:
 * - Receives server events via WebSocket
 * - Maintains visual state separate from game state
 * - Handles latency compensation
 * - Manages animation orchestration
 * - Provides rollback-safe rendering
 * - Optimizes for minimal rerenders
 */

export abstract class BaseGameClient extends EventEmitter {
  protected gameState: GameRoom | null = null;
  protected visualState: VisualState = {
    isAnimating: false,
    animationProgress: 0,
    lastServerUpdate: 0,
  };
  protected latency: LatencyData = {
    clientTime: 0,
    serverTime: 0,
    rtt: 0,
    offset: 0,
  };
  protected animationFrame?: number;
  protected lastFrameTime: number = 0;

  constructor(
    protected gameType: GameType,
    protected roomId: string
  ) {
    super();
  }

  /**
   * Initialize game client
   */
  initialize(initialState: GameRoom): void {
    this.gameState = initialState;
    this.visualState.lastServerUpdate = Date.now();
    
    this.emit('initialized', initialState);
    this.onInitialized(initialState);
  }

  /**
   * Handle game event from server
   */
  handleEvent(event: GameEvent): void {
    if (!this.gameState) {
      return;
    }

    // Update latency data
    this.updateLatency(event.timestamp);

    // Process event
    this.processEvent(event);

    // Emit to subscribers
    this.emit('event', event);
  }

  /**
   * Handle game tick (high-frequency updates)
   */
  handleTick(tick: GameTick): void {
    if (!this.gameState) {
      return;
    }

    this.updateLatency(tick.timestamp);
    this.processTick(tick);
    
    this.emit('tick', tick);
  }

  /**
   * Start animation loop
   */
  startAnimation(): void {
    if (this.animationFrame) {
      return;
    }

    this.visualState.isAnimating = true;
    this.lastFrameTime = performance.now();
    
    const animate = (time: number) => {
      const deltaTime = time - this.lastFrameTime;
      this.lastFrameTime = time;

      this.onAnimationFrame(deltaTime);

      if (this.visualState.isAnimating) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Stop animation loop
   */
  stopAnimation(): void {
    this.visualState.isAnimating = false;
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  /**
   * Update latency compensation data
   */
  protected updateLatency(serverTimestamp: number): void {
    const clientTime = Date.now();
    const rtt = clientTime - this.latency.clientTime;
    
    this.latency = {
      clientTime,
      serverTime: serverTimestamp,
      rtt: rtt > 0 ? rtt : this.latency.rtt,
      offset: clientTime - serverTimestamp,
    };
  }

  /**
   * Get server time adjusted for latency
   */
  protected getServerTime(): number {
    return Date.now() - this.latency.offset;
  }

  /**
   * Interpolate value for smooth animation
   */
  protected interpolate(
    current: number,
    target: number,
    deltaTime: number,
    speed: number = 0.1
  ): number {
    const diff = target - current;
    const step = diff * speed * (deltaTime / 16.67); // Normalize to 60fps
    
    return current + step;
  }

  /**
   * Predict future state (client-side prediction)
   * Used for latency compensation
   */
  protected predictState(deltaTime: number): any {
    // Override in specific game implementations
    return null;
  }

  /**
   * Reconcile predicted state with server state
   * Handles rollback if prediction was wrong
   */
  protected reconcileState(serverState: any): void {
    // Override in specific game implementations
  }

  /**
   * Get current game state
   */
  getGameState(): GameRoom | null {
    return this.gameState;
  }

  /**
   * Get current visual state
   */
  getVisualState(): VisualState {
    return { ...this.visualState };
  }

  /**
   * Get latency data
   */
  getLatency(): LatencyData {
    return { ...this.latency };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAnimation();
    this.removeAllListeners();
    this.gameState = null;
  }

  // Abstract methods to be implemented by specific games

  protected abstract processEvent(event: GameEvent): void;
  protected abstract processTick(tick: GameTick): void;
  protected abstract onAnimationFrame(deltaTime: number): void;

  // Optional lifecycle hooks
  protected onInitialized(state: GameRoom): void {}
}
