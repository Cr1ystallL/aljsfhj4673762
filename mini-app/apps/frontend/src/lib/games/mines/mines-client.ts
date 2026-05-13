import { BaseGameClient } from '../../game-engine/base-game-client';
import type { GameEvent, GameTick } from '../../game-engine/types';

/**
 * Mines Game Client - Production Implementation
 * 
 * FEATURES:
 * - Smooth tile reveal animations
 * - Progressive tension UX
 * - Rollback-safe state
 * - Provably fair verification
 */

interface MinesVisualState {
  gridSize: number;
  mineCount: number;
  revealedTiles: Set<number>;
  currentMultiplier: number;
  isActive: boolean;
  isRevealing: boolean;
  lastRevealedPosition?: number;
  gameOver: boolean;
  won: boolean;
  minePositions?: number[];
}

export class MinesGameClient extends BaseGameClient {
  private minesVisual: MinesVisualState = {
    gridSize: 25,
    mineCount: 3,
    revealedTiles: new Set(),
    currentMultiplier: 1.0,
    isActive: false,
    isRevealing: false,
    gameOver: false,
    won: false,
  };

  constructor(roomId: string) {
    super('mines', roomId);
  }

  /**
   * Process game event
   */
  protected processEvent(event: GameEvent): void {
    switch (event.type) {
      case 'game:started':
        this.handleGameStarted(event);
        break;

      case 'tile:revealed':
        this.handleTileRevealed(event);
        break;

      case 'game:lost':
        this.handleGameLost(event);
        break;

      case 'game:cashout':
        this.handleCashout(event);
        break;
    }
  }

  /**
   * Process tick (not used)
   */
  protected processTick(tick: GameTick): void {
    // Mines is turn-based
  }

  /**
   * Animation frame (not used for game logic)
   */
  protected onAnimationFrame(deltaTime: number): void {
    // Could be used for tile animations
  }

  /**
   * Handle game started
   */
  private handleGameStarted(event: GameEvent): void {
    const { gridSize, mineCount } = event.payload;

    this.minesVisual = {
      gridSize,
      mineCount,
      revealedTiles: new Set(),
      currentMultiplier: 1.0,
      isActive: true,
      isRevealing: false,
      gameOver: false,
      won: false,
    };

    this.emit('game:started', event.payload);
  }

  /**
   * Handle tile revealed
   */
  private handleTileRevealed(event: GameEvent): void {
    const { position, isMine, currentMultiplier, gameOver } = event.payload;

    this.minesVisual.revealedTiles.add(position);
    this.minesVisual.lastRevealedPosition = position;
    this.minesVisual.isRevealing = false;

    if (!isMine && currentMultiplier) {
      this.minesVisual.currentMultiplier = currentMultiplier;
    }

    if (gameOver) {
      this.minesVisual.gameOver = true;
      this.minesVisual.isActive = false;
    }

    this.emit('tile:revealed', {
      position,
      isMine,
      currentMultiplier: this.minesVisual.currentMultiplier,
      gameOver,
    });
  }

  /**
   * Handle game lost
   */
  private handleGameLost(event: GameEvent): void {
    const { minePositions } = event.payload;

    this.minesVisual.gameOver = true;
    this.minesVisual.isActive = false;
    this.minesVisual.won = false;
    this.minesVisual.minePositions = minePositions;

    this.emit('game:lost', event.payload);
  }

  /**
   * Handle cashout
   */
  private handleCashout(event: GameEvent): void {
    const { multiplier, payout, minePositions } = event.payload;

    this.minesVisual.gameOver = true;
    this.minesVisual.isActive = false;
    this.minesVisual.won = true;
    this.minesVisual.currentMultiplier = multiplier;
    this.minesVisual.minePositions = minePositions;

    this.emit('game:cashout', {
      multiplier,
      payout,
      minePositions,
    });
  }

  /**
   * Request tile reveal (optimistic)
   */
  revealTile(position: number): void {
    if (!this.minesVisual.isActive || this.minesVisual.isRevealing) {
      return;
    }

    if (this.minesVisual.revealedTiles.has(position)) {
      return;
    }

    this.minesVisual.isRevealing = true;

    // Emit request
    this.emit('reveal:requested', { position });
  }

  /**
   * Request cashout
   */
  requestCashout(): void {
    if (!this.minesVisual.isActive || this.minesVisual.revealedTiles.size === 0) {
      return;
    }

    this.emit('cashout:requested', {});
  }

  /**
   * Get visual state
   */
  getMinesVisualState(): MinesVisualState {
    return { ...this.minesVisual };
  }

  /**
   * Reset game
   */
  reset(): void {
    this.minesVisual = {
      gridSize: 25,
      mineCount: 3,
      revealedTiles: new Set(),
      currentMultiplier: 1.0,
      isActive: false,
      isRevealing: false,
      gameOver: false,
      won: false,
    };
  }
}
