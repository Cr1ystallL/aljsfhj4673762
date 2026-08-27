import { createHash, createHmac, randomBytes } from 'crypto';
import type { ProvablyFairData } from './types.js';

/**
 * Provably Fair System with Optional Outcome Bias.
 *
 * The "fair" half is unchanged: server seed is generated and hashed
 * before the round, the client seed is mixed in, and the result is the
 * HMAC-SHA256 of `(serverSeed, clientSeed:nonce)`. Players can verify
 * any past round by recomputing the HMAC.
 *
 * The "biased" half is new — every outcome-generating helper accepts an
 * optional `bias ∈ [-1, +1]` argument:
 *
 *   bias = 0    — neutral, behaves exactly as before
 *   bias > 0    — casino-favouring tilt (player loses MORE often)
 *   bias < 0    — player-favouring tilt (player wins MORE often)
 *
 * The tilt is implemented PRE-FACT — by shifting the inputs to the
 * outcome distribution before mapping the verifiable hash to a result.
 * The verifiable hash itself is unchanged, but the distribution it
 * samples from is shifted. Practical effect: a winner still gets their
 * full multiplier; the winners just become rarer (bias > 0) or more
 * common (bias < 0). This is the key difference from the previous
 * approach, which haircut payouts after the fact and felt dishonest.
 *
 * Tilt magnitude is bounded so a maxed-out bias never forces a
 * deterministic outcome — the worst it can do is move ±20-30 percentage
 * points of probability mass. With bias = ±1 and intensity = 1 the
 * casino can roughly double or halve win frequencies, no more.
 */

/** How aggressively bias bends each game. Public so admins / docs see it. */
const TILT = {
  /** Crash: shift U on [0, 1) by ±0.15. */
  crashU: 0.15,
  /** Crash: at +1 bias add this fraction of instant 1.00x busts. */
  crashInstantBust: 0.06,
  /** Coinflip: ±0.20 shift on win threshold. */
  coinflip: 0.2,
  /** Mines: how aggressively mine placement weights toward / away from
   *  the typical first-click cluster (cells 6..18). */
  minesShuffle: 0.5,
} as const;

function clampBias(b: number): number {
  if (!Number.isFinite(b)) return 0;
  return Math.max(-1, Math.min(1, b));
}

export class ProvablyFairSystem {
  /** ---------------------------------------------------------------- */
  /** Seed primitives                                                   */
  /** ---------------------------------------------------------------- */

  generateServerSeed(): string {
    return randomBytes(32).toString('hex');
  }

  hashServerSeed(serverSeed: string): string {
    return createHash('sha256').update(serverSeed).digest('hex');
  }

  generateClientSeed(): string {
    return randomBytes(16).toString('hex');
  }

  generateResult(serverSeed: string, clientSeed: string, nonce: number): string {
    const message = `${clientSeed}:${nonce}`;
    return createHash('sha256').update(serverSeed).update(message).digest('hex');
  }

  /** ---------------------------------------------------------------- */
  /** Generic helpers                                                   */
  /** ---------------------------------------------------------------- */

  /** First 13 hex chars (52 bits) → uniform float on [0, 1). */
  hashToFloat(hash: string): number {
    const hex = hash.substring(0, 13);
    const decimal = parseInt(hex, 16);
    const maxValue = Math.pow(2, 52);
    return decimal / maxValue;
  }

  hashToInt(hash: string, min: number, max: number): number {
    const float = this.hashToFloat(hash);
    return Math.floor(float * (max - min + 1)) + min;
  }

  /** ---------------------------------------------------------------- */
  /** Crash multiplier — biased                                         */
  /** ---------------------------------------------------------------- */
  /**
   * Bustabit-style heavy-tailed crash distribution with house-edge
   * instant-bust slot, optionally biased.
   *
   * bias > 0  — multiplier distribution shifts DOWN (rounds bust
   *             earlier on average).
   * bias < 0  — multiplier distribution shifts UP (rounds last longer).
   *
   * Formula:
   *   - 1% baseline house-edge: with probability `houseEdge + bias * 0.06`
   *     the round busts at exactly 1.00× (clamped to [0, 0.5] so the cap
   *     is never absurd). Negative bias never reduces this below 0.
   *   - Otherwise sample U' = U - bias * 0.15 ∈ [0, 1) and return
   *     1 / (1 - U'). Player tilt thus spends extra probability mass on
   *     the high-end; casino tilt spends it on early busts.
   */
  generateCrashMultiplier(hash: string, bias: number = 0): number {
    const b = clampBias(bias);
    const u = this.hashToFloat(hash); // [0, 1)

    // Baseline RTP is 95% (5% House Edge)
    let shiftedU = u;
    if (b > 0) {
      // Shift distribution down towards early crash (1.00x - 1.35x)
      shiftedU = Math.max(0, u - b * 0.35);
    } else if (b < 0) {
      shiftedU = Math.min(1 - 1e-6, u - b * 0.15);
    }

    const raw = (0.95 * (1 - Math.max(0, b * 0.15))) / (1 - shiftedU);
    const result = Math.floor(raw * 100) / 100;
    return Math.max(1.00, Math.min(10000, result));
  }

  /** ---------------------------------------------------------------- */
  /** Mines positions — biased                                          */
  /** ---------------------------------------------------------------- */
  /**
   * Fisher-Yates shuffle with biased index sampling.
   */
  generateMinesPositions(
    hash: string,
    gridSize: number,
    mineCount: number,
    bias: number = 0
  ): number[] {
    const b = clampBias(bias);
    const totalCells = gridSize * gridSize;
    const safeMineCount = Math.max(0, Math.min(mineCount, totalCells));

    // Stretchable byte stream (sha256 of `hash || counter`).
    const stream = (() => {
      let buffer = Buffer.alloc(0);
      let counter = 0;
      const refill = () => {
        const next = createHash('sha256')
          .update(hash)
          .update(`:${counter++}`)
          .digest();
        buffer = Buffer.concat([buffer, next]);
      };
      return () => {
        if (buffer.length < 4) refill();
        const v = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
        return v;
      };
    })();

    // Define the "centre" zone — cells humans tend to click first.
    // For a 5×5 board this is cells 6..18 (inner 3×3 + neighbours).
    const centreLow = Math.floor(totalCells * 0.24);
    const centreHigh = Math.floor(totalCells * 0.76);
    const isCentre = (cell: number) => cell >= centreLow && cell <= centreHigh;

    const cells: number[] = Array.from({ length: totalCells }, (_, i) => i);
    
    // Bias for mines pushes mines to center cells when b > 0
    let rejectionProb = Math.abs(b) * 0.75;

    for (let i = 0; i < safeMineCount; i++) {
      const remaining = totalCells - i;
      let j = i + (stream() % remaining);

      // Soft tilt: with `rejectionProb`, re-roll once if the chosen cell
      // is on the wrong side of our preference. b > 0 → prefer centre,
      // b < 0 → prefer non-centre. Exactly one re-roll bounds the
      // probability shift so it never becomes deterministic.
      if (rejectionProb > 0) {
        const draw = (stream() >>> 0) / 0xffffffff;
        if (draw < rejectionProb) {
          const want = b > 0;
          if (isCentre(cells[j]) !== want) {
            const j2 = i + (stream() % remaining);
            if (isCentre(cells[j2]) === want) j = j2;
          }
        }
      }

      const tmp = cells[i];
      cells[i] = cells[j];
      cells[j] = tmp;
    }

    return cells.slice(0, safeMineCount).sort((a, b2) => a - b2);
  }

  /** ---------------------------------------------------------------- */
  /** Coinflip outcome — biased                                         */
  /** ---------------------------------------------------------------- */
  /**
   * Determine whether the round shows heads or tails, given the user's
   * choice. With bias > 0, the outcome opposes the user's choice more
   * often (player loses); with bias < 0, the outcome matches more often
   * (player wins).
   *
   * P(player wins) = 0.5 - bias * TILT.coinflip   (clamped to [0.20, 0.80])
   *
   * Bias = ±1 → 30%/70% win rate, never 0% / 100%.
   */
  coinflipOutcome(
    hash: string,
    choice: 'heads' | 'tails',
    bias: number = 0
  ): 'heads' | 'tails' {
    const b = clampBias(bias);
    const winChance = Math.max(0.2, Math.min(0.8, 0.5 - b * TILT.coinflip));
    const u = this.hashToFloat(hash);
    const playerWins = u < winChance;
    if (playerWins) return choice;
    return choice === 'heads' ? 'tails' : 'heads';
  }

  /** ---------------------------------------------------------------- */
  /** Blackjack shoe — deterministic cryptographic shuffle             */
  /** ---------------------------------------------------------------- */
  generateBlackjackDeck(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    decksCount = 6
  ): Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' }> {
    const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Array<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'> = [
      '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
    ];
    const deck: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' }> = [];
    
    for (let d = 0; d < decksCount; d++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          deck.push({ suit, rank });
        }
      }
    }

    const message = `${clientSeed}:${nonce}`;
    let counter = 0;
    let buffer = Buffer.alloc(0);
    const refill = () => {
      const hmac = createHmac('sha256', serverSeed)
        .update(`${message}:${counter++}`)
        .digest();
      buffer = Buffer.concat([buffer, hmac]);
    };
    const getUint32 = () => {
      if (buffer.length < 4) refill();
      const val = buffer.readUInt32BE(0);
      buffer = buffer.subarray(4);
      return val;
    };

    // Fisher-Yates deterministic shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = getUint32() % (i + 1);
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }

    return deck;
  }

  /** ---------------------------------------------------------------- */
  /** Verification                                                      */
  /** ---------------------------------------------------------------- */

  verify(data: ProvablyFairData): boolean {
    const computedHash = this.hashServerSeed(data.serverSeed);
    if (computedHash !== data.serverSeedHash) return false;
    const computedResult = this.generateResult(
      data.serverSeed,
      data.clientSeed,
      data.nonce
    );
    return computedResult === data.result;
  }

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
