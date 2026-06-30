import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Auto-RTP Engine — pre-fact outcome bias controller.
 *
 * Drives a single number — `bias` ∈ [-1, +1] — that game engines apply
 * BEFORE generating an outcome. Engines see this number through
 * `getBiasFor(userId)` right before they hash a seed into a result; they
 * shift the result distribution accordingly. The hash itself is still
 * verifiable; only the distribution it samples from is shifted.
 *
 *   bias > 0  — round is biased toward casino winning (rounds bust
 *               earlier, mines cluster on common picks, etc.)
 *   bias < 0  — round is biased toward player winning (rounds last
 *               longer, mines cluster on the edges, etc.)
 *
 * No payouts are touched after the fact. A winner gets their full
 * computed multiplier — bias affects how often someone wins, not how
 * much they get when they do.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MODES
 * ─────────────────────────────────────────────────────────────────────
 *  off    — bias = 0 always.
 *  earn   — admin sets `target` PLN the casino should earn over `windowMs`.
 *           Engine applies positive bias when actual P&L lags pace,
 *           negative when it overshoots. Once target is hit, controller
 *           releases (bias → 0) for the rest of the window.
 *  give   — admin sets `target` PLN the casino should pay back over
 *           `windowMs`. Negative bias to make wins more frequent. Each
 *           winning round is also CAPPED so a single player can't burn
 *           the whole budget on one ×1000 plinko hit. Once paid out,
 *           releases.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PACING
 * ─────────────────────────────────────────────────────────────────────
 * The window has an "expected" P&L curve linear in time:
 *
 *     expected(t) = target * (t / windowMs)         for earn
 *     expected(t) = -target * (t / windowMs)        for give
 *
 * Error = expected - actual. Bias is proportional to error normalised by
 * `target`, scaled by `intensity`, clamped to [-1, +1]:
 *
 *     bias_raw  = (error / target) * intensity * 1.0
 *     bias      = clamp(bias_raw, -1, +1)
 *
 * If we're already past target (in the favourable direction) we send 0
 * bias — the controller does not "punish" overshoot in earn mode by
 * giving back, nor does it stop giving in give mode if we've already
 * given enough.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PER-USER COOLDOWN
 * ─────────────────────────────────────────────────────────────────────
 * To avoid hammering the same player repeatedly, each user has a
 * "load" counter that decays exponentially with time. Every biased
 * outcome adds to the load. When a user's load is high we damp the
 * bias they personally see — so the global tilt gets distributed across
 * the active player base instead of crushing one unlucky person.
 *
 * Implemented as a Redis hash `rtp:user:<id>` with two fields:
 *   - load          (float): exponentially-decaying biased-rounds count
 *   - load_updated  (ms epoch): last time we updated load
 *
 * Decay constant: half-life 5 minutes. So a user that took heavy bias
 * 5 minutes ago is back to half their previous damping.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PER-BET PAYOUT CAP (give mode)
 * ─────────────────────────────────────────────────────────────────────
 * Engines call `capPayoutForGive(userId, stake, grossPayout)` BEFORE
 * crediting the player. In `give` mode this returns a clamped payout if
 * the natural payout would consume more than a fair share of the
 * remaining give-budget. The clamp is applied by NOT crediting the
 * "spilled" portion — engines should treat the result as the new
 * effective payout and possibly downgrade the multiplier they show.
 *
 * In `earn` and `off` modes this is a no-op pass-through.
 *
 * Storage:
 *   rtp:config           hash with mode/target/windowMs/intensity
 *   rtp:window           hash with windowStart, profit, totalStake
 *   rtp:user:<id>        hash with load, load_updated, profit
 */

export type RtpMode = 'off' | 'earn' | 'give';

export interface RtpConfig {
  mode: RtpMode;
  /** Target (PLN). For earn: how much casino should win. For give:
   *  how much casino should pay back. Always positive. */
  target: number;
  windowMs: number;
  /** 0..1, how strongly bias is applied. */
  intensity: number;
  /** Earn-only: multiplies the computed bias to make the tilt stronger. */
  earnBiasBoost?: number;
}

export interface RtpStatus extends RtpConfig {
  windowStart: number;
  windowEnd: number;
  windowProfit: number;
  windowStake: number;
  /** Pacing error normalised to target ∈ [-1, +1]. */
  signal: number;
  /** True when controller is intentionally idle because target reached. */
  released: boolean;
}

const CONFIG_KEY = 'rtp:config';
const WINDOW_KEY = 'rtp:window';
const USER_CONFIG_KEY = (userId: string) => `rtp:usercfg:${userId}`;
const USER_WINDOW_KEY = (userId: string) => `rtp:userwin:${userId}`;

const DEFAULT_CONFIG: RtpConfig = {
  mode: 'off',
  target: 0,
  windowMs: 24 * 60 * 60 * 1000,
  intensity: 0.5,
  earnBiasBoost: 1,
};

const DEFAULT_USER_CONFIG: RtpConfig = {
  mode: 'off',
  target: 0,
  windowMs: 60 * 60 * 1000,
  intensity: 0.6,
};

const MAX_BIAS = 1.0;
/** Per-user load half-life: 5 min. */
const LOAD_HALF_LIFE_MS = 5 * 60 * 1000;
/** Above this load value we start damping a user's personal bias. */
const LOAD_DAMP_THRESHOLD = 6;

class RtpEngine {
  /* -----------------------------------------------------------------
   * Config + window state
   * ---------------------------------------------------------------- */

  async getConfig(): Promise<RtpConfig> {
    try {
      const { prisma } = await import('../lib/prisma.js');
      const sysConfig = await prisma.systemConfig.findUnique({
        where: { key: 'rtp_global' }
      });
      
      if (sysConfig && sysConfig.value) {
        const raw = sysConfig.value as any;
        return {
          mode: raw.mode === 'earn' || raw.mode === 'give' ? raw.mode : 'off',
          target: numOr(raw.target, 0),
          windowMs: numOr(raw.windowMs, DEFAULT_CONFIG.windowMs),
          intensity: clamp(numOr(raw.intensity, 0.5), 0, 1),
          earnBiasBoost: numOr(raw.earnBiasBoost, DEFAULT_CONFIG.earnBiasBoost ?? 1),
        };
      }
      
      return { ...DEFAULT_CONFIG };
    } catch (err) {
      logger.warn({ err }, 'rtp.getConfig failed');
      return { ...DEFAULT_CONFIG };
    }
  }

  async setConfig(
    patch: Partial<RtpConfig>,
    opts: { reset?: boolean } = {}
  ): Promise<RtpConfig> {
    const current = await this.getConfig();
    const next: RtpConfig = {
      mode:
        patch.mode === 'earn' || patch.mode === 'give' || patch.mode === 'off'
          ? patch.mode
          : current.mode,
      target: numOr(patch.target, current.target),
      windowMs: Math.max(60_000, numOr(patch.windowMs, current.windowMs)),
      intensity: clamp(numOr(patch.intensity, current.intensity), 0, 1),
      earnBiasBoost: numOr(patch.earnBiasBoost, current.earnBiasBoost ?? 1),
    };
    
    try {
      const { prisma } = await import('../lib/prisma.js');
      await prisma.systemConfig.upsert({
        where: { key: 'rtp_global' },
        update: { value: next as any },
        create: { key: 'rtp_global', value: next as any }
      });
      
      // Also update Redis for quick access by other parts if needed
      const r = redisClient.getClient();
      await r.hset(CONFIG_KEY, {
        mode: next.mode,
        target: String(next.target),
        windowMs: String(next.windowMs),
        intensity: String(next.intensity),
        earnBiasBoost: String(next.earnBiasBoost ?? 1),
      });

      if (opts.reset) {
        await r.del(WINDOW_KEY);
        await this.clearUserAccumulators();
      }
    } catch (err) {
      logger.error({ err }, 'Failed to set global RTP config');
    }
    return next;
  }

  private buildUserDefaults(globalCfg: RtpConfig): RtpConfig {
    return {
      mode: 'off',
      target: 0,
      windowMs: Math.max(60_000, globalCfg.windowMs),
      intensity: globalCfg.intensity,
    };
  }

  async getUserConfig(userId: string): Promise<RtpConfig> {
    try {
      const { prisma } = await import('../lib/prisma.js');
      const dbConfig = await prisma.userRtpConfig.findUnique({
        where: { userId }
      });

      if (!dbConfig) {
        return { ...this.buildUserDefaults(await this.getConfig()) };
      }
      const base = await this.getConfig();
      return {
        mode:
          dbConfig.mode === 'earn' || dbConfig.mode === 'give' || dbConfig.mode === 'off'
            ? (dbConfig.mode as RtpMode)
            : 'off',
        target: numOr(dbConfig.target, 0),
        windowMs: Math.max(60_000, numOr(dbConfig.windowMs, base.windowMs)),
        intensity: clamp(numOr(dbConfig.intensity, base.intensity), 0, 1),
      };
    } catch (err) {
      logger.warn({ err, userId }, 'rtp.getUserConfig failed');
      const base = await this.getConfig();
      return { ...this.buildUserDefaults(base) };
    }
  }

  async setUserConfig(
    userId: string,
    patch: Partial<RtpConfig>,
    opts: { reset?: boolean } = {}
  ): Promise<RtpConfig> {
    const base = await this.getConfig();
    const current = await this.getUserConfig(userId);
    const next: RtpConfig = {
      mode:
        patch.mode === 'earn' || patch.mode === 'give' || patch.mode === 'off'
          ? patch.mode
          : current.mode,
      target: numOr(patch.target, current.target),
      windowMs: Math.max(60_000, numOr(patch.windowMs, current.windowMs ?? base.windowMs)),
      intensity: clamp(numOr(patch.intensity, current.intensity ?? base.intensity), 0, 1),
    };
    try {
      const { prisma } = await import('../lib/prisma.js');
      await prisma.userRtpConfig.upsert({
        where: { userId },
        update: {
          mode: next.mode,
          target: next.target,
          windowMs: next.windowMs,
          intensity: next.intensity,
        },
        create: {
          userId,
          mode: next.mode,
          target: next.target,
          windowMs: next.windowMs,
          intensity: next.intensity,
        }
      });
      
      const r = redisClient.getClient();
      await r.hset(USER_CONFIG_KEY(userId), {
        mode: next.mode,
        target: String(next.target),
        windowMs: String(next.windowMs),
        intensity: String(next.intensity),
      });

      if (opts.reset) {
        await r.del(USER_WINDOW_KEY(userId));
        await this.clearUserAccumulator(userId);
      }
    } catch (err) {
      logger.warn({ err, userId }, 'rtp.setUserConfig failed');
    }
    return next;
  }


  private async ensureUserWindow(userId: string, cfg: RtpConfig): Promise<{ profit: number; stake: number; windowStart: number }> {
    const r = redisClient.getClient();
    let raw = await r.hgetall(USER_WINDOW_KEY(userId));
    let windowStart = Number(raw?.windowStart ?? 0);
    const now = Date.now();
    if (!windowStart || now - windowStart > cfg.windowMs) {
      windowStart = now;
      await r.del(USER_WINDOW_KEY(userId));
      await r.hset(USER_WINDOW_KEY(userId), {
        windowStart: String(windowStart),
        profit: '0',
        stake: '0',
      });
      raw = await r.hgetall(USER_WINDOW_KEY(userId));
    }
    return {
      profit: numOr(raw?.profit, 0),
      stake: numOr(raw?.stake, 0),
      windowStart,
    };
  }

  async getUserStatus(userId: string): Promise<RtpStatus> {
    const cfg = await this.getUserConfig(userId);
    const { profit, stake, windowStart } = await this.ensureUserWindow(userId, cfg);
    const now = Date.now();
    const t = cfg.windowMs > 0 ? (now - windowStart) / cfg.windowMs : 0;
    const elapsed = clamp(t, 0, 1);

    let signal = 0;
    let released = false;
    if (cfg.mode === 'earn') {
      const expected = cfg.target * elapsed;
      if (profit >= cfg.target) {
        released = true;
      } else if (cfg.target > 0) {
        signal = clamp((expected - profit) / cfg.target, -1, 1);
      }
    } else if (cfg.mode === 'give') {
      const expected = -cfg.target * elapsed;
      if (-profit >= cfg.target) {
        released = true;
      } else if (cfg.target > 0) {
        signal = clamp((expected - profit) / cfg.target, -1, 1);
      }
    }

    return {
      ...cfg,
      windowStart,
      windowEnd: windowStart + cfg.windowMs,
      windowProfit: profit,
      windowStake: stake,
      signal,
      released,
      earnBiasBoost: cfg.earnBiasBoost,
    };
  }

  async getStatus(): Promise<RtpStatus> {
    const cfg = await this.getConfig();
    const r = redisClient.getClient();
    let raw = await r.hgetall(WINDOW_KEY);
    let windowStart = Number(raw?.windowStart ?? 0);
    const now = Date.now();
    if (!windowStart || now - windowStart > cfg.windowMs) {
      // Window expired — open a fresh one.
      windowStart = now;
      await r.del(WINDOW_KEY);
      await r.hset(WINDOW_KEY, {
        windowStart: String(windowStart),
        profit: '0',
        stake: '0',
      });
      await this.clearUserAccumulators();
      raw = await r.hgetall(WINDOW_KEY);
    }
    const profit = numOr(raw?.profit, 0);
    const stake = numOr(raw?.stake, 0);

    const t = cfg.windowMs > 0 ? (now - windowStart) / cfg.windowMs : 0;
    const elapsed = clamp(t, 0, 1);

    let signal = 0;
    let released = false;
    if (cfg.mode === 'earn') {
      const expected = cfg.target * elapsed;
      // Released once we've reached or exceeded the goal.
      if (profit >= cfg.target) {
        released = true;
      } else if (cfg.target > 0) {
        signal = clamp((expected - profit) / cfg.target, -1, 1);
      }
    } else if (cfg.mode === 'give') {
      const expected = -cfg.target * elapsed;
      if (-profit >= cfg.target) {
        // Already given the budget away.
        released = true;
      } else if (cfg.target > 0) {
        signal = clamp((expected - profit) / cfg.target, -1, 1);
      }
    }

    return {
      ...cfg,
      windowStart,
      windowEnd: windowStart + cfg.windowMs,
      windowProfit: profit,
      windowStake: stake,
      signal,
      released,
    };
  }

  /* -----------------------------------------------------------------
   * Bias resolution
   * ---------------------------------------------------------------- */

  /**
   * Compute the per-user pre-fact bias to apply to the NEXT outcome.
   * Engines call this right before generating their result.
   *
   * Bias direction:
   *   earn mode + casino lagging  → +bias (casino-favouring)
   *   give mode + budget lagging  → -bias (player-favouring)
   *
   * The bias is dampened by:
   *   - intensity (admin slider)
   *   - per-user load (cooldown)
   * and clamped to [-1, +1].
   */
  async getBiasFor(userId: string): Promise<number> {
    // 1. New requirement: Enforce AutoRTP Loss Chance if wager is active
    try {
      const { systemConfig } = await import('./system-config.js');
      const { prisma } = await import('../lib/prisma.js');
      const b = await prisma.balance.findUnique({
        where: { userId },
        select: { autoRtpTarget: true, autoRtpProgress: true }
      });
      if (b && Number(b.autoRtpProgress) < Number(b.autoRtpTarget)) {
        // If we are actively wagering an AutoRTP target, apply a high bias to force losses.
        const sysCfg = await systemConfig.get();
        return sysCfg.autoRtpLossChance;
      }
    } catch (err) {
      logger.error({ err, userId }, 'Failed to check AutoRTP progress for bias');
    }

    // 2. Check user-specific config first
    const userCfg = await this.getUserConfig(userId);
    const globalCfg = await this.getConfig();
    if (userCfg.mode !== 'off' && userCfg.intensity > 0) {
      const status = await this.getUserStatus(userId);
      if (!status.released) {
        const boost = userCfg.mode === 'earn' ? (globalCfg.earnBiasBoost ?? 1) : 1;
        const rawUser = status.signal * userCfg.intensity * MAX_BIAS * boost;
        const load = await this.peekLoad(userId);
        let damp = 1;
        if (userCfg.intensity < 0.9) {
          damp = load > LOAD_DAMP_THRESHOLD ? LOAD_DAMP_THRESHOLD / load : 1;
        }
        return clamp(rawUser * damp, -MAX_BIAS, MAX_BIAS);
      }
    }

    // Fallback to global controller
    const cfg = globalCfg;
    if (cfg.mode === 'off' || cfg.intensity <= 0) return 0;

    const status = await this.getStatus();
    if (status.released) return 0;

    const boost = cfg.mode === 'earn' ? (cfg.earnBiasBoost ?? 1) : 1;
    const raw = status.signal * cfg.intensity * MAX_BIAS * boost;
    const load = await this.peekLoad(userId);
    const damp = load > LOAD_DAMP_THRESHOLD ? LOAD_DAMP_THRESHOLD / load : 1;
    return clamp(raw * damp, -MAX_BIAS, MAX_BIAS);
  }

  /**
   * Like `getBiasFor` but with no per-user component. Used by
   * multiplayer rounds (e.g. crash) where the round-level outcome
   * applies to every player in the round and therefore can't be
   * personalised.
   */
  async getGlobalBias(): Promise<number> {
    const cfg = await this.getConfig();
    if (cfg.mode === 'off' || cfg.intensity <= 0) return 0;
    const status = await this.getStatus();
    if (status.released) return 0;
    const boost = cfg.mode === 'earn' ? (cfg.earnBiasBoost ?? 1) : 1;
    return clamp(
      status.signal * cfg.intensity * MAX_BIAS * boost,
      -MAX_BIAS,
      MAX_BIAS
    );
  }

  /**
   * Per-bet payout cap for `give` mode.
   *
   * Returns a possibly-reduced gross payout. Engines should use the
   * return value as the actual credit, and may downgrade the displayed
   * multiplier accordingly. In `off` and `earn` modes this is a pass-
   * through.
   *
   * Cap formula (give mode):
   *   remaining = target - alreadyGiven
   *   maxPayout = max(stake, remaining / expectedPlayers)
   *
   * Where `expectedPlayers` is a soft estimate: the number of distinct
   * users seen in the current window so far, floored at 5 so a quiet
   * window doesn't let the first big winner take everything. This is a
   * conservative cap that limits a single payout to at most 1/5 of the
   * remaining budget while still letting the player walk with at least
   * their stake back (so they don't see a "win" turn into a loss).
   */
  async capPayoutForGive(
    userId: string,
    stake: number,
    grossPayout: number
  ): Promise<number> {
    // According to new requirements, RTP should ONLY affect win chance,
    // and MUST NOT alter the actual payout amount.
    return grossPayout;
  }

  /* -----------------------------------------------------------------
   * Outcome reporting (called from BettingPipeline)
   * ---------------------------------------------------------------- */

  /**
   * Record the casino-side P&L of one settled bet. Called from
   * `BettingPipeline.processPayout/processCashout/processLoss`.
   *
   *   profit = stake - grossPayout
   *
   * Positive profit means the casino kept money; negative means it paid
   * out more than the stake. Per-user load is incremented based on the
   * absolute movement scaled to stake — large bets contribute more.
   */
  async recordOutcome(
    userId: string,
    stake: number,
    grossPayout: number
  ): Promise<void> {
    const profitDelta = stake - grossPayout;
    try {
      const r = redisClient.getClient();
      // Ensure global and user windows are current.
      await this.getStatus();
      const userCfg = await this.getUserConfig(userId);
      await this.ensureUserWindow(userId, userCfg);

      const tx = r.multi();
      // Global window
      tx.hincrbyfloat(WINDOW_KEY, 'profit', String(profitDelta));
      tx.hincrbyfloat(WINDOW_KEY, 'stake', String(stake));

      // Per-user window
      tx.hincrbyfloat(USER_WINDOW_KEY(userId), 'profit', String(profitDelta));
      tx.hincrbyfloat(USER_WINDOW_KEY(userId), 'stake', String(stake));

      // Bump the user's load proportional to bet size, but bounded.
      const loadInc = Math.min(2, 0.4 + Math.log10(Math.max(1, stake)) * 0.4);
      tx.hincrbyfloat(`rtp:user:${userId}`, 'load', String(loadInc));
      tx.hset(`rtp:user:${userId}`, 'load_updated', String(Date.now()));
      tx.hincrbyfloat(`rtp:user:${userId}`, 'profit', String(-profitDelta));
      const cfg = await this.getConfig();
      const ttlGlobal = Math.ceil(cfg.windowMs / 1000) + 60;
      const ttlUser = Math.ceil(userCfg.windowMs / 1000) + 60;
      tx.expire(`rtp:user:${userId}`, ttlGlobal);
      tx.expire(USER_WINDOW_KEY(userId), ttlUser);
      await tx.exec();
    } catch (err) {
      logger.warn({ err }, 'rtp.recordOutcome failed');
    }
  }

  /* -----------------------------------------------------------------
   * Internals
   * ---------------------------------------------------------------- */

  /** Return the user's *decayed* load value without writing it back. */
  private async peekLoad(userId: string): Promise<number> {
    try {
      const r = redisClient.getClient();
      const raw = await r.hmget(
        `rtp:user:${userId}`,
        'load',
        'load_updated'
      );
      const load = numOr(raw[0], 0);
      const updated = numOr(raw[1], Date.now());
      const dt = Math.max(0, Date.now() - updated);
      const decay = Math.pow(0.5, dt / LOAD_HALF_LIFE_MS);
      return load * decay;
    } catch {
      return 0;
    }
  }

  private async clearUserAccumulators(): Promise<void> {
    try {
      const r = redisClient.getClient();
      const keys = await r.keys('rtp:user:*');
      if (keys.length > 0) await r.del(...keys);
    } catch (err) {
      logger.warn({ err }, 'rtp.clearUserAccumulators failed');
    }
  }

  private async clearUserAccumulator(userId: string): Promise<void> {
    try {
      const r = redisClient.getClient();
      const keys = await r.keys(`rtp:user:${userId}`);
      if (keys.length > 0) await r.del(...keys);
    } catch (err) {
      logger.warn({ err, userId }, 'rtp.clearUserAccumulator failed');
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

export const rtpEngine = new RtpEngine();
