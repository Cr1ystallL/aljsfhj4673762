/**
 * Shared Coinflip types between page and components.
 * Mirrors the backend coinflip-engine.ts contract.
 */

export type CoinSide = 'heads' | 'tails';
export type CoinflipMode = 'quick' | 'multiply';

export interface CoinflipQuickResult {
  mode: 'quick';
  roundId: string;
  choice: CoinSide;
  outcome: CoinSide;
  won: boolean;
  multiplier: number;
  payout: number;
  betAmount: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
}

export interface CoinflipMultiplyState {
  mode: 'multiply';
  roundId: string;
  betAmount: number;
  round: number;
  maxRounds: number;
  currentMultiplier: number;
  nextMultiplier: number;
  status: 'awaiting' | 'busted' | 'cashed';
  lastChoice?: CoinSide;
  lastOutcome?: CoinSide;
  payout?: number;
  multipliers: number[];
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed?: string;
}

export interface CoinflipHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  vipLevel?: number;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}
