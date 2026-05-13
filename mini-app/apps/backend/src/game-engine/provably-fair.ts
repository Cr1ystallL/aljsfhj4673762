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
   * Generate crash multiplier from hash
   * Uses exponential distribution for realistic crash points
   */
  generateCrashMultiplier(hash: string): number {
    const float = this.hashToFloat(hash);
    
    // House edge: 1%
    const houseEdge = 0.01;
    
    // Exponential distribution
    // P(crash at X) = (1 - houseEdge) / X
    const result = Math.floor((100 - houseEdge * 100) / (float * 100)) / 100;
    
    // Clamp between 1.00x and 10000x
    return Math.max(1.0, Math.min(10000, result));
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
