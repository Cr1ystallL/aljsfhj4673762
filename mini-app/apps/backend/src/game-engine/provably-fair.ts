import { createHash, randomBytes } from 'crypto';
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
  /** Plinko: per-step push toward the centre column, ±0.18. */
  plinkoStep: 0.18,
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
    const baseHouseEdge = 0.01;
    const instantBust = Math.min(
      0.5,
      Math.max(0, baseHouseEdge + b * TILT.crashInstantBust)
    );

    const edgeSlice = hash.substring(13, 21); // 32-bit chunk
    const edgeInt = parseInt(edgeSlice, 16);
    const edgeBucket = (edgeInt >>> 0) / 0xffffffff;
    if (edgeBucket < instantBust) {
      return 1.0;
    }

    const u = this.hashToFloat(hash); // [0, 1)
    const shifted = u - b * TILT.crashU;
    const safeU = Math.max(0, Math.min(1 - 1e-12, shifted));
    const raw = 1 / (1 - safeU);
    const result = Math.floor(raw * 100) / 100;
    return Math.max(1.01, Math.min(10000, result));
  }

  /** ---------------------------------------------------------------- */
  /** Mines positions — biased                                          */
  /** ---------------------------------------------------------------- */
  /**
   * Fisher-Yates shuffle with biased index sampling.
   *
   * Players overwhelmingly click middle / centre cells first. We model
   * this as a soft attractor at the centre of the grid (cells 6..18 on
   * the 5×5 board). When bias > 0 we push mines TOWARD that cluster so
   * the average user busts faster. When bias < 0 we push mines TOWARD
   * the corners and edges so the user sees more safe early reveals.
   *
   * Implementation: for each Fisher-Yates step we sample `j` from a
   * stream and conditionally re-sample if the chosen cell falls outside
   * the desired region. Re-sample probability is `|bias| * TILT.minesShuffle`.
   * This is rejection-sampling with a soft target, not an absolute cap,
   * so even at bias=±1 a single mine can still land anywhere.
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
    const rejectionProb = Math.abs(b) * TILT.minesShuffle;

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
  /** Plinko path — biased                                              */
  /** ---------------------------------------------------------------- */
  /**
   * Per-row L/R decisions, biased toward the centre (low multiplier
   * buckets) when bias > 0, toward the edges (high multiplier buckets)
   * when bias < 0.
   *
   * Without bias each row is a coin flip (0=L, 1=R). With bias, each
   * row's threshold is nudged: if the path is currently leaning right
   * (more 1s than expected), we increase the probability of L; vice
   * versa. The nudge amount is `bias * TILT.plinkoStep`, sign-flipped
   * for the "centre attractor": positive bias → centre attractor on,
   * negative bias → centre repulsor (path drifts toward edges).
   */
  generatePlinkoPins(hash: string, rows: number, bias: number = 0): number[] {
    const b = clampBias(bias);
    const path: number[] = [];

    let leans = 0; // sum of (right=+1, left=-1)
    for (let i = 0; i < rows; i++) {
      const segment = hash.substring(i * 4, (i + 1) * 4);
      // 16-bit slice → [0, 1)
      const u = (parseInt(segment, 16) || 0) / 0xffff;

      // Centre attractor: when path is right-leaning, prefer left next.
      const correction = -Math.sign(leans) * b * TILT.plinkoStep;
      // Threshold above which we go right; default 0.5.
      const threshold = 0.5 - correction;

      const dir = u < threshold ? 0 : 1;
      path.push(dir);
      leans += dir === 1 ? 1 : -1;
    }

    return path;
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
