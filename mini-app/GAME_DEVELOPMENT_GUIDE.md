# Game Development Guide

Quick reference for implementing new games using the Phase 5 framework.

## Creating a New Game

### 1. Backend: Extend BaseGameEngine

```typescript
// apps/backend/src/games/[game-name]/[game-name]-engine.ts

import { BaseGameEngine } from '../../game-engine/base-game-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { provablyFair } from '../../game-engine/provably-fair.js';

export class MyGameEngine extends BaseGameEngine {
  constructor(gameId: string) {
    const config = {
      minBet: 1,
      maxBet: 1000,
      tickRate: 0, // 0 = no tick loop, >0 = milliseconds
      provablyFair: true,
    };
    
    super(gameId, 'my-game', config);
  }

  // Required: Create new round
  protected async createRound(): Promise<GameRound> {
    const serverSeed = provablyFair.generateServerSeed();
    const clientSeed = provablyFair.generateClientSeed();
    const nonce = (this.room.currentRound?.nonce || 0) + 1;
    
    // Generate provably fair result
    const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);
    
    return {
      id: `my-game_${Date.now()}`,
      gameId: this.gameId,
      state: 'waiting',
      startedAt: Date.now(),
      seed: hash,
      serverSeed,
      clientSeed,
      nonce,
    };
  }

  // Required: Process bet
  protected async processBet(bet: Bet): Promise<void> {
    await bettingPipeline.processBet(bet, false);
  }

  // Required: Can place bet?
  protected canPlaceBet(): boolean {
    return this.room.state === 'waiting';
  }

  // Required: Get tick state (if using tick loop)
  protected getTickState(): any {
    return { /* current game state */ };
  }

  // Required: Resolve bets
  protected async resolveBets(result: any): Promise<void> {
    for (const [userId, player] of this.room.players.entries()) {
      if (!player.bet) continue;
      
      if (/* player won */) {
        const payout = player.bet.amount * multiplier;
        await bettingPipeline.processPayout(player.bet, payout, false);
      } else {
        await bettingPipeline.processLoss(player.bet);
      }
    }
  }

  // Optional: Tick handler (for high-frequency games)
  protected onTick(tick: GameTick): void {
    // Update game state every tick
  }
}
```

### 2. Frontend: Extend BaseGameClient

```typescript
// apps/frontend/src/lib/games/[game-name]/[game-name]-client.ts

import { BaseGameClient } from '../../game-engine/base-game-client';

export class MyGameClient extends BaseGameClient {
  constructor(roomId: string) {
    super('my-game', roomId);
  }

  // Required: Process events
  protected processEvent(event: GameEvent): void {
    switch (event.type) {
      case 'round:started':
        this.startAnimation();
        break;
      case 'round:completed':
        this.stopAnimation();
        break;
    }
  }

  // Required: Process ticks (if game uses tick loop)
  protected processTick(tick: GameTick): void {
    // Update visual state from server tick
  }

  // Required: Animation frame
  protected onAnimationFrame(deltaTime: number): void {
    // Smooth interpolation between server updates
    this.emit('display:update', { /* visual state */ });
  }
}
```

### 3. Create Game Page

```typescript
// apps/frontend/src/app/game/[game-name]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useGameConnection } from '@/hooks/use-game-connection';
import { GameHeader } from '@/components/game/game-header';
import { BetControls } from '@/components/game/bet-controls';
import { MyGameClient } from '@/lib/games/my-game/my-game-client';

export default function MyGamePage() {
  const [client] = useState(() => new MyGameClient('room_1'));
  const { isConnected, sendAction } = useGameConnection({
    gameType: 'my-game',
    roomId: 'room_1',
    onEvent: (event) => client.handleEvent(event),
  });

  const handleBet = async (amount: number) => {
    await sendAction('place_bet', { amount });
  };

  return (
    <div className="min-h-screen pb-32 pt-safe px-safe">
      <GameHeader title="My Game" />
      
      {/* Game visualization */}
      <div className="my-6">
        {/* Render game state */}
      </div>

      {/* Bet controls */}
      <BetControls
        minBet={1}
        maxBet={1000}
        balance={1000}
        onBet={handleBet}
      />
    </div>
  );
}
```

## Game Types Reference

### High-Frequency Games (Crash)
- Use `tickRate: 100` (or faster)
- Implement `onTick()` for state updates
- Use `startAnimation()` for smooth rendering
- Implement latency compensation

### Turn-Based Games (Mines)
- Use `tickRate: 0` (no tick loop)
- Process events only
- Validate each action server-side
- Use optimistic UI updates

### Physics Games (Plinko)
- Use deterministic physics
- Replay from seed
- Emit collision events
- Interpolate visual position

## Betting Pipeline Usage

```typescript
// Place bet
await bettingPipeline.processBet(bet, demoMode);

// Process win
await bettingPipeline.processPayout(bet, payout, demoMode);

// Process loss
await bettingPipeline.processLoss(bet);

// Cashout
await bettingPipeline.processCashout(bet, amount, multiplier, demoMode);

// Rollback (on error)
await bettingPipeline.rollbackBet(bet, demoMode);
```

## Provably Fair Usage

```typescript
// Generate seeds
const serverSeed = provablyFair.generateServerSeed();
const clientSeed = provablyFair.generateClientSeed();

// Generate result
const hash = provablyFair.generateResult(serverSeed, clientSeed, nonce);

// Game-specific results
const crashPoint = provablyFair.generateCrashMultiplier(hash);
const minePositions = provablyFair.generateMinesPositions(hash, 5, 3);
const plinkoPath = provablyFair.generatePlinkoPins(hash, 16);

// Verify
const isValid = provablyFair.verify({
  serverSeed,
  serverSeedHash: provablyFair.hashServerSeed(serverSeed),
  clientSeed,
  nonce,
  result: hash,
});
```

## Event System

### Emit Events (Backend)
```typescript
this.emitEvent('custom:event', {
  data: 'value',
});
```

### Listen to Events (Frontend)
```typescript
client.on('event', (event: GameEvent) => {
  if (event.type === 'custom:event') {
    // Handle event
  }
});
```

## Sound Integration

```typescript
import { soundManager, COMMON_SOUNDS } from '@/lib/sound/sound-manager';

// Initialize (after user interaction)
await soundManager.initialize();

// Register game sounds
soundManager.register('my-game.win', {
  src: '/sounds/my-game/win.mp3',
  category: 'sfx',
  volume: 0.8,
  preload: true,
});

// Play sound
soundManager.play('my-game.win');
soundManager.play('game.bet_placed'); // Common sound
```

## State Management

```typescript
import { useGameStore } from '@/store/game-store';

// Set current game
const { setCurrentGame, updateGameState } = useGameStore();
setCurrentGame('my-game', 'room_1');

// Update state
updateGameState(newState);

// Subscribe to specific state
const currentBet = useGameStore((state) => state.currentBet);
```

## Performance Tips

1. **Batch Events**: Queue events, process at 60fps
2. **Selective Subscriptions**: Only subscribe to needed state
3. **Memoize Calculations**: Cache expensive computations
4. **Optimize Animations**: Use GPU-accelerated transforms
5. **Lazy Load**: Load game assets on demand

## Testing

```typescript
// Test game engine
const engine = new MyGameEngine('test_game');
engine.start();
await engine.placeBet('user_1', 10);
// ... test game flow

// Test provably fair
const result = provablyFair.generateResult(serverSeed, clientSeed, 1);
const isValid = provablyFair.verify({ /* data */ });
expect(isValid).toBe(true);
```

## Common Patterns

### Multiplayer Synchronization
```typescript
// Late join: Send full state
this.emitEvent('state:sync', {
  gameState: this.getState(),
});

// Regular updates: Send deltas only
this.emitEvent('state:update', {
  changedFields: { multiplier: 2.5 },
});
```

### Cashout Queue
```typescript
// Process cashouts in order
const cashoutQueue: Array<{ userId: string; timestamp: number }> = [];

protected onTick() {
  while (cashoutQueue.length > 0) {
    const { userId } = cashoutQueue.shift()!;
    await this.processCashout(userId);
  }
}
```

### Animation Interpolation
```typescript
// Smooth transition between server values
const current = this.interpolate(
  currentValue,
  targetValue,
  deltaTime,
  0.2 // Speed (0-1)
);
```
