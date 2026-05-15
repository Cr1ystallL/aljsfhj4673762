/**
 * Shared Plinko types between page and components.
 *
 * Mirrors the backend's plinko-engine.ts contract.
 */

export type PlinkoRisk = 'low' | 'medium' | 'high';

export interface PlinkoConfig {
  rows: number;
  buckets: number;
  risks: PlinkoRisk[];
  multipliers: Record<PlinkoRisk, number[]>;
}

export interface PlinkoDropResult {
  roundId: string;
  bucket: number;
  path: number[];
  multiplier: number;
  betAmount: number;
  payout: number;
  risk: PlinkoRisk;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface PlinkoHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}
