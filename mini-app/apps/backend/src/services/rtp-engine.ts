import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Auto-RTP Engine
 *
 * Closed-loop controller that nudges per-player house edge so the
 * casino's net profit / loss tracks an admin-configured target over a
 * window of time.
 *
 * Inputs:
 *   - `target` — desired casino net profit over the window (positive
 *     to take from players, negative to give back).
 *   - `windowMs` — duration of the window. After it expires the
 *     controller resets and starts a new window with the same target.
 *
 * Loop:
 *   1. Every settled bet calls `recordOutcome(stake, payout)`. The
 *      delta `stake - payout` is what the casino actually took.
 *   2. The accumulator stores per-window totals in Redis under
 *      `rtp:window` (single hash, atomic via HINCRBYFLOAT).
 *   3. When a bet is about to be paid out, `getEdgeBias(userId)`
 *      returns a number in [-0.45, 0.45] that is *added* to the
 *      configured house edge before computing the credit. Bias is
 *      smoothly weighted by:
 *        a) Global error  → casino is below target → bias positive
 *           (more edge for everyone)
 *           casino is above target → bias negative (relax)
 *        b) Per-user net  → players who are deep in profit get a
 *           harder edge, players who are deep in loss get relief.
 *           This is cumulative since the window opened.
 *
 *   4. The bias is bounded so a single tilt can never make a game
 *      pay 0% RTP — the cap is 0.45, leaving at minimum 5% of the
 *      computed profit going to the player.
 *
 * The mechanism is deliberately simple. It is NOT a "rigging" system —
 * each game still produces a provably-fair outcome from the random
 * seed. The bias only changes the *amount paid out on a win*, so the
 * stream of wins/losses remains random. From the player's perspective
 * it looks like a slightly tighter or looser slot machine for the
 * duration of the window.
 *
 * Storage:
 *   - `rtp:config`           hash with mode/target/windowMs.
 *   - `rtp:window`           hash with windowStart, profit, totalStake.
 *   - `rtp:user:<id>`        hash with profit (net since window open).
 */

export type RtpMode = 'off' | 'earn' | 'give';

export interface RtpConfig {
  /** off = engine inactive (only flat houseEdge applies).
   *  earn = engine pushes the casino toward `target` profit.
   *  give = engine pushes the casino toward `target` loss (rewards).
   */
  mode: RtpMode;
  /** Target profit (earn) or pay-out (give) over the window, in PLN. */
  target: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Strength of the bias adjustment (0..1). Higher = more aggressive. */
  intensity: number;
}

export interface RtpStatus extends RtpConfig {
  windowStart: number;
  windowEnd: number;
  windowProfit: number;
  windowStake: number;
  /** -1..+1, error vs target (>0 means casino is behind target). */
  signal: number;
}

const CONFIG_KEY = 'rtp:config';
const WINDOW_KEY = 'rtp:window';

const DEFAULT_CONFIG: RtpConfig = {
  mode: 'off',
  target: 0,
  windowMs: 24 * 60 * 60 * 1000, // 24h
  intensity: 0.5,
};

const MAX_BIAS = 0.45;

class RtpEngine {
  /** Read current config from Redis (or defaults). */
  async getConfig(): Promise<RtpConfig> {
    try {
      const r = redisClient.getClient();
      const raw = await r.hgetall(CONFIG_KEY);
      if (!raw || Object.keys(raw).length === 0) return { ...DEFAULT_CONFIG };
      return {
        mode:
          raw.mode === 'earn' || raw.mode === 'give' ? raw.mode : 'off',
        target: numOr(raw.target, 0),
        windowMs: numOr(raw.windowMs, DEFAULT_CONFIG.windowMs),
        intensity: clamp(numOr(raw.intensity, 0.5), 0, 1),
      };
    } catch (err) {
      logger.warn({ err }, 'rtp.getConfig failed');
      return { ...DEFAULT_CONFIG };
    }
  }

  /** Read current operating window. Resets if expired. */
  async getStatus(): Promise<RtpStatus> {
    const cfg = await this.getConfig();
    const r = redisClient.getClient();
    let raw = await r.hgetall(WINDOW_KEY);
    let windowStart = Number(raw?.windowStart ?? 0);
    const now = Date.now();
    if (!windowStart || now - windowStart > cfg.windowMs) {
      // Reset
      windowStart = now;
      await r.del(WINDOW_KEY);
      await r.hset(WINDOW_KEY, {
        windowStart: String(windowStart),
        profit: '0',
        stake: '0',
      });
      // Also wipe all per-user accumulators to keep memory bounded.
      await this.clearUserAccumulators();
      raw = await r.hgetall(WINDOW_KEY);
    }

    const profit = numOr(raw?.profit, 0);
    const stake = numOr(raw?.stake, 0);

    // Signal in [-1, +1]: +1 = far below target, -1 = far above.
    let signal = 0;
    if (cfg.mode === 'earn') {
      const expected = cfg.target * elapsedFraction(windowStart, cfg.windowMs);
      signal = clamp((expected - profit) / Math.max(1, cfg.target), -1, 1);
    } else if (cfg.mode === 'give') {
      // Target here is "amount we want to give back" — positive number.
      const expectedLoss = cfg.target * elapsedFraction(windowStart, cfg.windowMs);
      // We are "behind" if profit is *higher* than -expectedLoss.
      signal = clamp(((-expectedLoss) - profit) / Math.max(1, cfg.target), -1, 1);
    }

    return {
      ...cfg,
      windowStart,
      windowEnd: windowStart + cfg.windowMs,
      windowProfit: profit,
      windowStake: stake,
      signal,
    };
  }

  /** Update the config (admin action). */
  async setConfig(patch: Partial<RtpConfig>, opts: { reset?: boolean } = {}): Promise<RtpConfig> {
    const current = await this.getConfig();
    const next: RtpConfig = {
      mode:
        patch.mode === 'earn' || patch.mode === 'give' || patch.mode === 'off'
          ? patch.mode
          : current.mode,
      target: numOr(patch.target, current.target),
      windowMs: Math.max(60_000, numOr(patch.windowMs, current.windowMs)),
      intensity: clamp(numOr(patch.intensity, current.intensity), 0, 1),
    };
    const r = redisClient.getClient();
    await r.hset(CONFIG_KEY, {
      mode: next.mode,
      target: String(next.target),
      windowMs: String(next.windowMs),
      intensity: String(next.intensity),
    });
    if (opts.reset) {
      await r.del(WINDOW_KEY);
      await this.clearUserAccumulators();
    }
    return next;
  }

  /**
   * Compute the per-user edge bias to apply on the *next* payout.
   * Returns a number in [-MAX_BIAS, MAX_BIAS] that callers add to the
   * configured house edge before paying out.
   */
  async getEdgeBias(userId: string): Promise<number> {
    const cfg = await this.getConfig();
    if (cfg.mode === 'off' || cfg.intensity <= 0) return 0;

    const status = await this.getStatus();
    const userProfit = await this.getUserProfit(userId);

    // Two-component bias.
    // Component A — global signal: when the casino is behind on its
    // target we tilt towards higher edge (positive); when ahead we
    // tilt down. `signal` is already in [-1, +1].
    const globalA = status.signal;

    // Component B — per-user: a player whose net is far in the green
    // gets a harder edge; one in the red gets relief. Normalise by a
    // soft scale of 200 PLN so no single bet flip fires the cap.
    const userB = clamp(userProfit / 200, -1, 1);

    const combined = clamp(
      cfg.intensity * (0.6 * globalA + 0.4 * userB),
      -MAX_BIAS,
      MAX_BIAS
    );

    return combined;
  }

  /**
   * Record a settled bet outcome. Casino profit = stake - grossPayout.
   * Called from BettingPipeline.processPayout / processCashout.
   */
  async recordOutcome(userId: string, stake: number, grossPayout: number): Promise<void> {
    const profitDelta = stake - grossPayout;
    try {
      const r = redisClient.getClient();
      // Make sure window is current; getStatus rotates it.
      await this.getStatus();
      const tx = r.multi();
      tx.hincrbyfloat(WINDOW_KEY, 'profit', String(profitDelta));
      tx.hincrbyfloat(WINDOW_KEY, 'stake', String(stake));
      tx.hincrbyfloat(`rtp:user:${userId}`, 'profit', String(-profitDelta));
      tx.expire(`rtp:user:${userId}`, Math.ceil((await this.getConfig()).windowMs / 1000) + 60);
      await tx.exec();
    } catch (err) {
      logger.warn({ err }, 'rtp.recordOutcome failed');
    }
  }

  private async getUserProfit(userId: string): Promise<number> {
    try {
      const r = redisClient.getClient();
      const v = await r.hget(`rtp:user:${userId}`, 'profit');
      return numOr(v, 0);
    } catch {
      return 0;
    }
  }

  private async clearUserAccumulators(): Promise<void> {
    try {
      const r = redisClient.getClient();
      // SCAN — KEYS is fine here because the cardinality is bounded by
      // active players in the last window. For very large casinos we'd
      // switch to a separate list of dirty userIds.
      const keys = await r.keys('rtp:user:*');
      if (keys.length > 0) {
        await r.del(...keys);
      }
    } catch (err) {
      logger.warn({ err }, 'rtp.clearUserAccumulators failed');
    }
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function elapsedFraction(start: number, duration: number): number {
  const f = (Date.now() - start) / duration;
  return clamp(f, 0, 1);
}

export const rtpEngine = new RtpEngine();
