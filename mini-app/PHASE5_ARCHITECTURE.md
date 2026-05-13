# Phase 5: Core Game Framework Architecture

## Overview

Phase 5 establishes the **reusable, event-driven game engine** foundation for all casino games. This architecture separates game logic from visuals, supports high-frequency updates, handles multiplayer synchronization, and prepares for provably fair gaming.

## Architecture Principles

### 1. Event-Driven Design
- All game state changes emit events
- Frontend subscribes to relevant events only
- Enables replay, debugging, and audit trails
- Supports spectator mode and late-join sync

### 2. Server-Authoritative
- Server owns all game logic and RNG
- Client is a "cinematic renderer" of server state
- No client-side game logic or validation
- Prevents cheating and ensures fairness

### 3. Visual/Logic Separation
- Game state ≠ Visual state
- Animations never control game outcomes
- Smooth interpolation between server updates
- Rollback-safe rendering

### 4. High-Frequency Optimization
- Tick-based updates for fast games (Crash: 100ms)
- Event batching to prevent WebSocket flooding
- Selective subscriptions to minimize rerenders
- Latency compensation for smooth UX

### 5. Multiplayer-Ready
- Room-based architecture
- Player and spectator management
- State synchronization for late joins
- Historical round reconstruction

## Backend Architecture

### Core Components

#### 1. BaseGameEngine (`base-game-engine.ts`)
Abstract foundation for all games:
- Round lifecycle management
- Player/spectator handling
- Bet processing pipeline
- High-frequency tick loop
- Event emission system

**Key Methods:**
- `start()` - Initialize game engine
- `startRound()` - Begin new round
- `placeBet()` - Process player bet
- `endRound()` - Resolve round and payouts
- `startTickLoop()` - High-frequency updates

#### 2. BettingPipeline (`betting-pipeline.ts`)
Unified bet processing:
- Balance deduction (transactional)
- Payout distribution
- Cashout handling
- Rollback support
- Demo mode isolation

**Key Methods:**
- `processBet()` - Deduct balance, create bet
- `processPayout()` - Credit winnings
- `processCashout()` - Partial cashout
- `rollbackBet()` - Refund on error

#### 3. ProvablyFairSystem (`provably-fair.ts`)
Cryptographic game verification:
- Server seed generation and hashing
- Client seed integration
- Deterministic result generation
- Post-game verification

**Key Methods:**
- `generateResult()` - HMAC-SHA256 based RNG
- `generateCrashMultiplier()` - Crash-specific
- `generateMinesPositions()` - Mines-specific
- `verify()` - Player verification

#### 4. GameRoomManager (`game-room-manager.ts`)
Multiplayer coordination:
- Room creation/destruction
- Player routing
- Event broadcasting
- Late-join synchronization
- Spectator management

**Key Methods:**
- `createRoom()` - New game instance
- `joinRoom()` - Player joins
- `spectateRoom()` - Spectator mode
- `broadcastToRoom()` - Event distribution

### Game-Specific Implementation

Each game extends `BaseGameEngine`:

```typescript
class CrashGameEngine extends BaseGameEngine {
  protected async createRound(): Promise<GameRound> {
    // Generate provably fair crash point
  }
  
  protected async processBet(bet: Bet): Promise<void> {
    // Crash-specific bet validation
  }
  
  protected onTick(tick: GameTick): void {
    // Update multiplier every 100ms
  }
}
```

## Frontend Architecture

### Core Components

#### 1. BaseGameClient (`base-game-client.ts`)
Frontend game engine:
- Receives server events
- Maintains visual state
- Latency compensation
- Animation orchestration
- Client-side prediction

**Key Methods:**
- `handleEvent()` - Process server event
- `handleTick()` - High-frequency update
- `startAnimation()` - Begin render loop
- `predictState()` - Latency compensation
- `reconcileState()` - Rollback handling

#### 2. Game Store (`game-store.ts`)
Global state management:
- Current game session
- Player bet state
- Event history
- Selective subscriptions
- Optimized rerenders

**Selectors:**
- `useCurrentGame()` - Current game type
- `useGameState()` - Full game state
- `useCurrentBet()` - Player's bet
- `useIsAnimating()` - Animation state

#### 3. Sound Manager (`sound-manager.ts`)
Audio system:
- Preloaded sounds
- Category-based volume
- Mobile-optimized
- Telegram WebApp compatible

**Categories:**
- `sfx` - Game sound effects
- `ui` - Interface sounds
- `music` - Background music
- `ambient` - Atmospheric audio

### Reusable UI Components

#### 1. BetControls (`bet-controls.tsx`)
Universal betting interface:
- Amount input with presets
- Min/max enforcement
- Balance validation
- Optimistic updates

#### 2. GameHeader (`game-header.tsx`)
Standard game header:
- Back navigation
- Round ID display
- Sound toggle
- Provably fair info

#### 3. PlayerList (`player-list.tsx`)
Multiplayer player display:
- Real-time updates
- Bet amounts
- Win/loss states
- Smooth animations

### Game Connection Hook

`useGameConnection()` - WebSocket integration:
- Event subscription
- State synchronization
- Reconnection handling
- Event batching (60fps)

## Game-Specific Preparations

### Crash
**Architecture:**
- 100ms tick rate (10 updates/second)
- Exponential multiplier growth
- Real-time cashout
- Late-join with current multiplier
- Historical graph reconstruction

**Key Features:**
- High-frequency multiplier updates
- Spectator synchronization
- Cashout queue processing
- Provably fair crash point

### Mines
**Architecture:**
- Turn-based state machine
- Server-side mine validation
- Incremental reveal system
- Rollback-safe UI updates

**Key Features:**
- Grid state management
- Mine position verification
- Multiplier progression
- Cashout at any point

### Plinko
**Architecture:**
- Physics event synchronization
- Deterministic ball path
- Path reconstruction from seed
- Visual interpolation

**Key Features:**
- Pin collision events
- Smooth ball animation
- Multiple simultaneous balls
- Result verification

### Keno
**Architecture:**
- Number selection validation
- Draw animation sequence
- Match calculation
- Batch betting support

### Coinflip
**Architecture:**
- Binary outcome
- Flip animation sync
- Instant resolution
- Multiplayer rooms

### Cookies/Nuts
**Architecture:**
- Click-based mechanics
- Progressive multipliers
- Burst timing
- Risk/reward balance

## Performance Optimizations

### 1. Event Batching
```typescript
// Queue events, process at 60fps
const queueEvent = (event) => {
  eventQueue.push(event);
  setTimeout(processQueue, 16); // ~60fps
};
```

### 2. Selective Subscriptions
```typescript
// Only rerender when specific state changes
const multiplier = useGameStore((state) => state.gameState?.currentMultiplier);
```

### 3. WebSocket Optimization
- Batch high-frequency updates
- Compress repeated data
- Selective broadcasting
- Connection pooling

### 4. Animation Optimization
- RequestAnimationFrame loop
- Interpolation between server ticks
- GPU-accelerated transforms
- Minimal DOM updates

## Database Schema

### GameRound
```prisma
model GameRound {
  id             String
  gameType       String
  state          String
  serverSeedHash String
  serverSeed     String?
  clientSeed     String?
  nonce          Int
  result         Json?
  metadata       Json?
  startedAt      DateTime?
  endedAt        DateTime?
}
```

### Bet
```prisma
model Bet {
  id         String
  userId     String
  roundId    String
  gameType   String
  amount     Decimal
  state      String
  payout     Decimal?
  multiplier Decimal?
  metadata   Json?
  placedAt   DateTime
  resolvedAt DateTime?
}
```

## Next Steps (Phase 6)

With the framework complete, Phase 6 will implement actual games:

1. **Crash Game** - Full implementation with high-frequency updates
2. **Mines Game** - Turn-based with server validation
3. **Plinko Game** - Physics-based with deterministic paths
4. **Additional Games** - Keno, Coinflip, Cookies, Nuts

Each game will:
- Extend BaseGameEngine (backend)
- Extend BaseGameClient (frontend)
- Use shared betting pipeline
- Implement provably fair
- Use reusable UI components
- Follow cinematic design direction

## Testing Checklist

- [ ] BaseGameEngine lifecycle
- [ ] Betting pipeline transactions
- [ ] Provably fair verification
- [ ] Room manager multiplayer
- [ ] Event batching performance
- [ ] WebSocket reconnection
- [ ] Latency compensation
- [ ] Animation smoothness
- [ ] Sound system
- [ ] UI component reusability
