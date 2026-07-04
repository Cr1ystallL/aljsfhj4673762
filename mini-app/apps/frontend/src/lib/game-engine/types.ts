/**
 * Frontend Game Engine Types
 * Mirrors backend types for type safety
 */

export type GameType = 'crash' | 'mines' | 'plinko' | 'keno' | 'coinflip' | 'wheel' | 'bridges' | 'blackjack' | 'hilo';

export type GameState = 
  | 'idle'
  | 'waiting'
  | 'starting'
  | 'active'
  | 'resolving'
  | 'completed'
  | 'cancelled';

export type BetState = 
  | 'pending'
  | 'active'
  | 'won'
  | 'lost'
  | 'cancelled'
  | 'cashed_out';

export interface GameEvent<T = any> {
  type: string;
  gameId: string;
  roundId: string;
  timestamp: number;
  sequence: number;
  payload: T;
}

export interface Bet {
  id: string;
  userId: string;
  gameId: string;
  roundId: string;
  amount: number;
  state: BetState;
  placedAt: number;
  resolvedAt?: number;
  payout?: number;
  multiplier?: number;
  metadata?: Record<string, any>;
}

export interface GameRound {
  id: string;
  gameId: string;
  state: GameState;
  startedAt: number;
  endedAt?: number;
  seed: string;
  serverSeed: string;
  clientSeed?: string;
  nonce: number;
  result?: any;
  metadata?: Record<string, any>;
}

export interface PlayerState {
  userId: string;
  bet?: Bet;
  isActive: boolean;
  joinedAt: number;
  lastActionAt: number;
  metadata?: Record<string, any>;
}

export interface GameRoom {
  id: string;
  gameType: GameType;
  state: GameState;
  currentRound?: GameRound;
  players: Map<string, PlayerState>;
  spectators: Set<string>;
  config: GameConfig;
  createdAt: number;
  updatedAt: number;
}

export interface GameConfig {
  minBet: number;
  maxBet: number;
  maxPlayers?: number;
  tickRate: number;
  autoStartDelay?: number;
  provablyFair: boolean;
  metadata?: Record<string, any>;
}

export interface GameTick {
  roundId: string;
  sequence: number;
  timestamp: number;
  deltaTime: number;
  state: any;
}

/**
 * Visual state (separate from game state)
 * Used for animations and rendering
 */
export interface VisualState {
  isAnimating: boolean;
  animationProgress: number;
  interpolatedValue?: number;
  lastServerUpdate: number;
  predictedState?: any;
}

/**
 * Latency compensation data
 */
export interface LatencyData {
  clientTime: number;
  serverTime: number;
  rtt: number; // Round-trip time
  offset: number; // Client-server time offset
}
