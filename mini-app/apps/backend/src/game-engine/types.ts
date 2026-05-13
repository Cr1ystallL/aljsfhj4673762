/**
 * Core Game Engine Types
 * Shared type definitions for all games
 */

export type GameType = 'crash' | 'mines' | 'plinko' | 'keno' | 'coinflip' | 'cookies' | 'nuts';

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

/**
 * Base game event structure
 */
export interface GameEvent<T = any> {
  type: string;
  gameId: string;
  roundId: string;
  timestamp: number;
  sequence: number;
  payload: T;
}

/**
 * Base bet structure
 */
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

/**
 * Base round structure
 */
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

/**
 * Player state in a game
 */
export interface PlayerState {
  userId: string;
  bet?: Bet;
  isActive: boolean;
  joinedAt: number;
  lastActionAt: number;
  demoMode: boolean; // Track if player is in demo mode
  metadata?: Record<string, any>;
}

/**
 * Game room state
 */
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

/**
 * Game configuration
 */
export interface GameConfig {
  minBet: number;
  maxBet: number;
  maxPlayers?: number;
  tickRate: number; // milliseconds
  autoStartDelay?: number;
  provablyFair: boolean;
  metadata?: Record<string, any>;
}

/**
 * Game tick for high-frequency updates
 */
export interface GameTick {
  roundId: string;
  sequence: number;
  timestamp: number;
  deltaTime: number;
  state: any;
}

/**
 * Provably fair verification data
 */
export interface ProvablyFairData {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  result: any;
}
