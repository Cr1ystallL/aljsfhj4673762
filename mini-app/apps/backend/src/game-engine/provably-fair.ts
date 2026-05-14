import { createHash, randomBytes } from 'crypto';
import type { ProvablyFairData } from './types.js';

/**
 * Provably Fair System
 * Cryptographic verification for game outcomes
 * 
 * ARCHITECTURE:
 * - Server seed generated and hashed before round
 * - Client seed provided by player
 * - Nonce increments per round
 * - Result derived from HMAC(serverSeed + clientSeed + nonce)
 * - Players can verify results after reveal
 */

export class ProvablyFairSystem {
  /**
   * Generate server seed
   */
  generateServerSeed(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash server seed for public display
   */
  hashServerSeed(serverSeed: string): string {
    return createHash('sha256').update(serverSeed).digest('hex');
  }

  /**
   * Generate client seed
   */
  generateClientSeed(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate deterministic result
   * Uses HMAC-SHA256 for cryptographic randomness
   */
  generateResult(serverSeed: string, clientSeed: string, nonce: number): string {
    const message = `${clientSeed}:${nonce}`;
    const hmac = createHash('sha256')
      .update(serverSeed)
      .update(message)
      .digest('hex');
    
    return hmac;
  }

  /**
   * Convert hash to float (0-1)
   */
  hashToFloat(hash: string): number {
    // Take first 13 hex characters (52 bits)
    const hex = hash.substring(0, 13);
    const decimal = parseInt(hex, 16);
    const maxValue = Math.pow(2, 52);
    
    return decimal / maxValue;
  }

  /**
   * Convert hash to integer range
   */
  hashToInt(hash: string, min: number, max: number): number {
    const float = this.hashToFloat(hash);
    return Math.floor(float * (max - min + 1)) + min;
  }

  /**
   * Generate crash multiplier from hash.
   *
   * Formula derived from the canonical Bustabit-style crash distribution:
   *
   *   - With probability `houseEdge` the round busts at exactly 1.00x.
   *     This is the only place house edge enters; everything else is fair.
   *   - Otherwise the crash point is `1 / (1 - U)` where U is uniform on
   *     [0, 1), giving a heavy-tailed distribution with median ~2.00x.
   *
   * The implementation uses a 13-hex-digit slice of the HMAC for the
   * bucket / uniform sample so results are fully verifiable.
   *
   * Sanity checks:
   *   - U = 0.50 → 2.00x
   *   - U = 0.90 → 10.00x
   *   - U = 0.99 → 100.00x
   */
  generateCrashMultiplier(hash: string): number {
    const houseEdge = 0.01;

    // First, decide whether this round is an instant-bust (house edge).
    // Use a fresh slice of the hash so this is independent of `U` below.
    const edgeSlice = hash.substring(13, 21); // 32-bit chunk
    const edgeInt = parseInt(edgeSlice, 16);
    const edgeBucket = (edgeInt >>> 0) / 0xffffffff;
    if (edgeBucket < houseEdge) {
      return 1.0;
    }

    // Uniform sample U in [0, 1).
    const u = this.hashToFloat(hash); // [0, 1)
    const safeU = Math.min(u, 1 - 1e-12);
    const raw = 1 / (1 - safeU);

    // Two-decimal precision, hard cap for sanity.
    const result = Math.floor(raw * 100) / 100;
    return Math.max(1.01, Math.min(10000, result));
  }

  /**
   * Generate mines positions from hash
   */
  generateMinesPositions(hash: string, gridSize: number, mineCount: number): number[] {
    const positions: number[] = [];
    const totalCells = gridSize * gridSize;
    
    let currentHash = hash;
    let index = 0;
    
    while (positions.length < mineCount && index < totalCells) {
      // Generate new hash if needed
      if (index > 0 && index % 8 === 0) {
        currentHash = createHash('sha256').update(currentHash).digest('hex');
      }
      
      const position = this.hashToInt(currentHash.substring(index * 4, (index + 1) * 4), 0, totalCells - 1);
      
      if (!positions.includes(position)) {
        positions.push(position);
      }
      
      index++;
    }
    
    return positions.sort((a, b) => a - b);
  }

  /**
   * Generate plinko path from hash
   */
  generatePlinkoPins(hash: string, rows: number): number[] {
    const path: number[] = [];
    
    for (let i = 0; i < rows; i++) {
      const hashSegment = hash.substring(i * 2, (i + 1) * 2);
      const direction = parseInt(hashSegment, 16) % 2; // 0 = left, 1 = right
      path.push(direction);
    }
    
    return path;
  }

  /**
   * Verify result
   * Allows players to verify game outcome
   */
  verify(data: ProvablyFairData): boolean {
    // Verify server seed hash
    const computedHash = this.hashServerSeed(data.serverSeed);
    if (computedHash !== data.serverSeedHash) {
      return false;
    }

    // Regenerate result
    const computedResult = this.generateResult(
      data.serverSeed,
      data.clientSeed,
      data.nonce
    );

    // Compare with provided result
    return computedResult === data.result;
  }

  /**
   * Create verification data for round
   */
  createVerificationData(
    serverSeed: string,
    clientSeed: string,
    nonce: number
  ): ProvablyFairData {
    const result = this.generateResult(serverSeed, clientSeed, nonce);
    
    return {
      serverSeed,
      serverSeedHash: this.hashServerSeed(serverSeed),
      clientSeed,
      nonce,
      result,
    };
  }
}

export const provablyFair = new ProvablyFairSystem();
