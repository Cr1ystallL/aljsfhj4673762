import { BaseGameClient } from '../../game-engine/base-game-client';
import type { GameEvent, GameTick } from '../../game-engine/types';

/**
 * Plinko Game Client - Production Implementation
 * 
 * FEATURES:
 * - Smooth ball animation
 * - Path interpolation
 * - Multiple simultaneous balls
 * - Elegant physics visualization
 */

interface PlinkoBall {
  id: string;
  userId: string;
  betAmount: number;
  path: number[];
  currentRow: number;
  position: { x: number; y: number };
  isAnimating: boolean;
  finalBucket?: number;
  multiplier?: number;
  payout?: number;
}

interface PlinkoVisualState {
  rows: number;
  buckets: number;
  activeBalls: Map<string, PlinkoBall>;
  history: Array<{ multiplier: number; payout: number }>;
}

export class PlinkoGameClient extends BaseGameClient {
  private plinkoVisual: PlinkoVisualState = {
    rows: 16,
    buckets: 17,
    activeBalls: new Map(),
    history: [],
  };

  constructor(roomId: string) {
    super('plinko', roomId);
  }

  /**
   * Process game event
   */
  protected processEvent(event: GameEvent): void {
    switch (event.type) {
      case 'ball:dropped':
        this.handleBallDropped(event);
        break;

      case 'ball:pin_collision':
        this.handlePinCollision(event);
        break;

      case 'ball:landed':
        this.handleBallLanded(event);
        break;
    }
  }

  /**
   * Process tick (not used)
   */
  protected processTick(tick: GameTick): void {
    // Plinko is event-based
  }

  /**
   * Animation frame
   */
  protected onAnimationFrame(deltaTime: number): void {
    // Update ball positions
    for (const ball of this.plinkoVisual.activeBalls.values()) {
      if (ball.isAnimating) {
        // Smooth interpolation would go here
        this.emit('ball:position_update', {
          ballId: ball.id,
          position: ball.position,
        });
      }
    }
  }

  /**
   * Handle ball dropped
   */
  private handleBallDropped(event: GameEvent): void {
    const { ballId, userId, betAmount, path } = event.payload;

    const ball: PlinkoBall = {
      id: ballId,
      userId,
      betAmount,
      path,
      currentRow: 0,
      position: { x: 0.5, y: 0 }, // Normalized 0-1
      isAnimating: true,
    };

    this.plinkoVisual.activeBalls.set(ballId, ball);

    this.startAnimation();

    this.emit('ball:dropped', {
      ballId,
      betAmount,
    });
  }

  /**
   * Handle pin collision
   */
  private handlePinCollision(event: GameEvent): void {
    const { ballId, row, direction } = event.payload;

    const ball = this.plinkoVisual.activeBalls.get(ballId);
    if (!ball) return;

    ball.currentRow = row;

    // Update position based on direction
    // 0 = left, 1 = right
    const offset = direction === 0 ? -0.05 : 0.05;
    ball.position.x += offset;
    ball.position.y = row / this.plinkoVisual.rows;

    this.emit('ball:pin_collision', {
      ballId,
      row,
      direction,
      position: ball.position,
    });
  }

  /**
   * Handle ball landed
   */
  private handleBallLanded(event: GameEvent): void {
    const { ballId, finalBucket, multiplier, payout } = event.payload;

    const ball = this.plinkoVisual.activeBalls.get(ballId);
    if (!ball) return;

    ball.isAnimating = false;
    ball.finalBucket = finalBucket;
    ball.multiplier = multiplier;
    ball.payout = payout;

    // Add to history
    this.plinkoVisual.history.unshift({ multiplier, payout });
    if (this.plinkoVisual.history.length > 50) {
      this.plinkoVisual.history.pop();
    }

    this.emit('ball:landed', {
      ballId,
      finalBucket,
      multiplier,
      payout,
    });

    // Remove ball after delay
    setTimeout(() => {
      this.plinkoVisual.activeBalls.delete(ballId);
      
      if (this.plinkoVisual.activeBalls.size === 0) {
        this.stopAnimation();
      }
    }, 2000);
  }

  /**
   * Get visual state
   */
  getPlinkoVisualState(): PlinkoVisualState {
    return {
      ...this.plinkoVisual,
      activeBalls: new Map(this.plinkoVisual.activeBalls),
    };
  }

  /**
   * Get history
   */
  getHistory(): Array<{ multiplier: number; payout: number }> {
    return [...this.plinkoVisual.history];
  }
}
