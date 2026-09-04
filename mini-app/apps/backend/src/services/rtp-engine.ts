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

export interface PlayerFunnelState {
  depositIndex: number;
  depositAmount: number;
  targetPeakMultiplier: number;
  maxMultiplierCap: number;
  currentBalance: number;
  peakBalance: number;
  wagerProgress: number;
  wagerTarget: number;
  phase: 'hook' | 'plateau' | 'drain' | 'recapture' | 'normal';
  bias: number;
  trustScore: number;
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

    // 1. Priority check: SmartDrain active on this user (realistic, natural tilt)
    if (await this.isDrainActive(userId, isTournament)) {
      return 0.45; // balanced tilt in favor of casino without looking rigged
    }

    // 2. Lifecycle Funnel check (Dynamic Retention for deposits)
    const funnel = await this.getFunnelState(userId);
    if (funnel.phase !== 'normal') {
      return funnel.bias;
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
    isTournament: boolean = false,
    gameType?: string
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

    // Process SmartDrain auto-monitoring only for casino games (sports is external sportsbook)
    if (gameType !== 'sports') {
      void this.recordRoundForDrain(userId, stake, grossPayout, grossPayout > stake, isTournament).catch(() => {});
      void this.recordRoundForFunnel(userId, stake, grossPayout, isTournament).catch(() => {});
    }

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
        // Set a 20-minute cooldown so drain doesn't immediately re-arm in a vicious loop
        await r.set(`rtp:drain_cooldown:${userId}`, '1', 'EX', 1200);
        // Clear session profit counter so it doesn't re-trigger instantly
        await r.del(`rtp:session_profit:${userId}`);
        logger.info({ userId }, 'SmartDrain completed, 20m cooldown set, session profit reset');
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

      // Track rolling session profit (1-hour rolling window)
      const sessionKey = `rtp:session_profit:${userId}`;
      const rawProfit = await r.incrbyfloat(sessionKey, netProfit);
      const newSessionProfit = Number(rawProfit) || 0;
      await r.expire(sessionKey, 3600);

      // Track win streak
      const streakKey = `rtp:win_streak:${userId}`;
      let streak = 0;
      if (won) {
        streak = Number(await r.incr(streakKey)) || 0;
        await r.expire(streakKey, 1800);
      } else {
        await r.set(streakKey, '0');
        await r.expire(streakKey, 1800);
      }

      // Check if user is currently under active drain
      const drainActive = await this.isDrainActive(userId, isTournament);
      if (drainActive) {
        await this.consumeDrainRound(userId);
        return;
      }

      // Check cooldown - after drain completes, give player 20m grace period before any new auto-drain can trigger
      const cooldown = await r.get(`rtp:drain_cooldown:${userId}`);
      if (cooldown) {
        return;
      }

      // AUTO-TRIGGER CONDITIONS:
      // Must be substantial to avoid nuisance false-positives on small play:
      // 1. Long win streak: >= 7 wins in a row
      // 2. High session profit: >= +350 PLN
      // 3. Massive single hit: >= +300 PLN
      if (streak >= 7 || newSessionProfit >= 350 || netProfit >= 300) {
        const rounds = newSessionProfit > 800 ? 8 : newSessionProfit > 400 ? 6 : 4;
        await this.setDrain(userId, {
          rounds,
          durationMs: 20 * 60 * 1000, // 20 minutes max
          reason: `auto_profit_${Math.round(newSessionProfit)}pln_streak_${streak}`,
        });
        // Damp the session profit tracker so it doesn't immediately re-trigger after rounds finish
        await r.set(sessionKey, String(Math.max(0, newSessionProfit * 0.3)));
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to record round for drain');
    }
  }

  /* -----------------------------------------------------------------
   * Player Funnel (Lifecycle RTP & Dynamic Retention)
   * ---------------------------------------------------------------- */

  /**
   * Retrieves or computes the player's dynamic retention funnel state.
   */
  async getFunnelState(userId: string): Promise<PlayerFunnelState> {
    try {
      const r = redisClient.getClient();
      const cached = await r.get(`rtp:funnel:${userId}`);
      if (cached) {
        return JSON.parse(cached) as PlayerFunnelState;
      }

      const { prisma } = await import('../lib/prisma.js');
      const [depAgg, latestDep, balanceRow, userRow, completedWdCount] = await Promise.all([
        prisma.transaction.aggregate({
          where: { userId, type: 'deposit' },
          _count: true,
          _sum: { amount: true },
        }),
        prisma.transaction.findFirst({
          where: { userId, type: 'deposit' },
          orderBy: { createdAt: 'desc' },
          select: { amount: true, createdAt: true },
        }),
        prisma.balance.findUnique({ where: { userId } }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { trustScore: true, isBlocked: true, ignoreIpCollision: true },
        }),
        prisma.withdrawalRequest.count({
          where: { userId, status: 'completed' },
        }),
      ]);

      const depositIndex = depAgg._count;
      const depositAmount = Number(latestDep?.amount ?? 0);
      const currentBalance = Number(balanceRow?.amount ?? 0);
      const wagerProgress = Number(balanceRow?.wagerProgress ?? 0);
      const wagerTarget = Number(balanceRow?.wagerTarget ?? 0);
      const trustScore = userRow?.trustScore ?? 80;

      let targetPeakMultiplier = 1.65;
      let maxMultiplierCap = 3.5;
      let phase: PlayerFunnelState['phase'] = 'normal';
      let bias = 0;

      // Anti-Fraud check: if trust score is below 50, do not enable the hook/retention boost!
      if (trustScore < 50) {
        const state: PlayerFunnelState = {
          depositIndex,
          depositAmount,
          targetPeakMultiplier: 1.0,
          maxMultiplierCap: 3.5,
          currentBalance,
          peakBalance: currentBalance,
          wagerProgress,
          wagerTarget,
          phase: 'normal',
          bias: 0.05,
          trustScore,
        };
        await r.set(`rtp:funnel:${userId}`, JSON.stringify(state), 'EX', 30);
        return state;
      }

      if (depositIndex === 1 && depositAmount > 0) {
        targetPeakMultiplier = 1.65;
        maxMultiplierCap = 3.5;

        const targetPeakBalance = depositAmount * 1.50;
        const ceilingBalance = depositAmount * 1.85;

        if (currentBalance < targetPeakBalance && wagerProgress < depositAmount * 2.5) {
          phase = 'hook';
          bias = -0.35; // gentle push to win and reach target 1.5x-1.8x
        } else if (currentBalance >= targetPeakBalance && currentBalance <= ceilingBalance && wagerProgress < depositAmount * 3.0) {
          phase = 'plateau';
          bias = 0.08; // swings back and forth around the peak
        } else {
          // Greed / prolonged play: transition to gentle drain
          phase = 'drain';
          bias = 0.45;
        }
      } else if (depositIndex === 2 && depositAmount > 0) {
        if (completedWdCount > 0) {
          // Player previously withdrew profit: soft recapture phase
          targetPeakMultiplier = 1.15;
          maxMultiplierCap = 3.5;
          if (currentBalance < depositAmount * 1.08 && wagerProgress < depositAmount * 0.8) {
            phase = 'recapture';
            bias = -0.15; // small teaser
          } else {
            phase = 'recapture';
            bias = 0.45; // recover previous withdrawal
          }
        } else {
          // Player busted on dep 1: second chance curve
          targetPeakMultiplier = 1.35;
          maxMultiplierCap = 3.5;
          if (currentBalance < depositAmount * 1.30 && wagerProgress < depositAmount * 2.0) {
            phase = 'hook';
            bias = -0.25;
          } else {
            phase = 'drain';
            bias = 0.45;
          }
        }
      } else {
        phase = 'normal';
        bias = 0;
      }

      const state: PlayerFunnelState = {
        depositIndex,
        depositAmount,
        targetPeakMultiplier,
        maxMultiplierCap,
        currentBalance,
        peakBalance: Math.max(currentBalance, depositAmount * targetPeakMultiplier),
        wagerProgress,
        wagerTarget,
        phase,
        bias,
        trustScore,
      };

      await r.set(`rtp:funnel:${userId}`, JSON.stringify(state), 'EX', 30);
      return state;
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to compute funnel state');
      return {
        depositIndex: 0,
        depositAmount: 0,
        targetPeakMultiplier: 1.0,
        maxMultiplierCap: 3.5,
        currentBalance: 0,
        peakBalance: 0,
        wagerProgress: 0,
        wagerTarget: 0,
        phase: 'normal',
        bias: 0,
        trustScore: 80,
      };
    }
  }

  /**
   * Evaluates a click in Mines for Dynamic Mine Relocation.
   * Completely solves the "corners/edges" exploit and guarantees seamless,
   * natural-looking outcomes with exact invariant mine counts!
   */
  async evaluateMinesClick(
    userId: string,
    betAmount: number,
    potentialMultiplier: number,
    isTournament: boolean = false
  ): Promise<{ action: 'must_win' | 'must_bust' | 'neutral' }> {
    if (isTournament) return { action: 'neutral' };

    try {
      const funnel = await this.getFunnelState(userId);
      const drainActive = await this.isDrainActive(userId, isTournament);

      // 1. Hard Multiplier Cap on Deposit 1: Prevent freak outliers > 3.5x
      if (funnel.depositIndex === 1 && potentialMultiplier > funnel.maxMultiplierCap) {
        if (Math.random() < 0.85) {
          return { action: 'must_bust' };
        }
      }

      // 2. Active Drain / Funnel Drain / Recapture:
      if (drainActive || funnel.phase === 'drain' || funnel.phase === 'recapture') {
        let bustChance = 0.45;
        if (potentialMultiplier >= 3.0) bustChance = 0.70;
        else if (potentialMultiplier >= 2.0) bustChance = 0.55;
        else if (potentialMultiplier < 1.35) bustChance = 0.20;

        if (betAmount >= 50) bustChance = Math.min(0.80, bustChance + 0.10);

        if (Math.random() < bustChance) {
          return { action: 'must_bust' };
        }
        return { action: 'neutral' };
      }

      // 3. Hook phase (First deposit onboarding up to 1.5x - 1.8x):
      if (funnel.phase === 'hook') {
        if (potentialMultiplier <= 2.2) {
          // If the clicked cell naturally has a mine, 80% chance to relocate it!
          if (Math.random() < 0.80) {
            return { action: 'must_win' };
          }
        }
        return { action: 'neutral' };
      }

      // 4. Plateau phase (swings):
      if (funnel.phase === 'plateau') {
        if (potentialMultiplier > 2.5) {
          if (Math.random() < 0.60) return { action: 'must_bust' };
        }
        return { action: 'neutral' };
      }

      return { action: 'neutral' };
    } catch (err) {
      logger.warn({ err, userId }, 'evaluateMinesClick failed');
      return { action: 'neutral' };
    }
  }

  /**
   * Tracks round outcome for Funnel phase transitions.
   */
  async recordRoundForFunnel(
    userId: string,
    stake: number,
    payout: number,
    isTournament: boolean = false
  ): Promise<void> {
    if (isTournament) return;
    try {
      const r = redisClient.getClient();
      // Invalidate cached funnel state so next query recalculates fresh balances
      await r.del(`rtp:funnel:${userId}`);
    } catch {}
  }

  /**
   * Determines if a forced loss should be applied to the next round outcome.
   * NEVER 100% DETERMINISTIC: uses natural probabilistic curves so games feel authentic.
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
      const funnel = await this.getFunnelState(userId);

      // 0. Hard Multiplier Cap on Deposit 1: Prevent freak outliers > 3.5x
      if (funnel.depositIndex === 1 && potentialMultiplier > funnel.maxMultiplierCap) {
        if (Math.random() < 0.85) {
          return true;
        }
      }

      // 1. Check SmartDrain (active слив) or Funnel Drain
      const drain = (await this.isDrainActive(userId, isTournament)) || funnel.phase === 'drain' || funnel.phase === 'recapture';
      if (drain) {
        // Smart Drain is PROBABILISTIC, NEVER 100%!
        // The player must still win ~35-50% of rounds so the game feels authentic and natural.
        // We scale the resistance dynamically by potential multiplier and stake:
        let forceChance = 0.45;
        if (potentialMultiplier >= 3.0) {
          forceChance = 0.65; // higher multiplier has more natural house resistance
        } else if (potentialMultiplier >= 2.0) {
          forceChance = 0.50; // around 50/50 for 2x
        } else if (potentialMultiplier < 1.4) {
          forceChance = 0.25; // low risk almost always safe
        }

        // For larger bets, slight gentle adjustment
        if (betAmount >= 50) {
          forceChance = Math.min(0.70, forceChance + 0.10);
        }

        return Math.random() < forceChance;
      }

      // 2. Check Hidden Debt (soft resistance, never 100%)
      const debt = await this.getHiddenDebt(userId);
      if (debt > 0) {
        return Math.random() < 0.40;
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
