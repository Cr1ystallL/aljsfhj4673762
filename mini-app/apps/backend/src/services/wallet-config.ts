import { redisClient } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Wallet / payments configuration.
 *
 * Persisted in Redis under the `wallet_config` key. Only operational
 * knobs the operator actually needs to tune live in here:
 *
 *   - Deposit / withdrawal limits.
 *   - Wager (turnover) multiplier — required play-through before a
 *     withdrawal request is honoured.
 *
 * Crypto addresses, provider API keys and per-method commissions are
 * not stored here — they were dropped from the admin UI on the user's
 * request because they leaked credentials and confused operators. If
 * a future provider integration needs a key, it goes into the .env
 * file (or an HSM) — not the live config.
 */
export interface WalletConfig {
  /** If false, deposits are globally disabled */
  depositsEnabled: boolean;
  /** Minimum deposit per request. */
  minDeposit: number;
  /** Maximum deposit per request. */
  maxDeposit: number;
  /** Minimum withdrawal per request. */
  minWithdrawal: number;
  /** Maximum withdrawal per request. */
  maxWithdrawal: number;
  /** Required wager multiplier vs deposit before withdrawal. */
  wagerMultiplier: number;
}

const DEFAULTS: WalletConfig = {
  depositsEnabled: true,
  minDeposit: 10,
  maxDeposit: 100000,
  minWithdrawal: 50,
  maxWithdrawal: 100000,
  wagerMultiplier: 1,
};

const KEY = 'wallet_config';

class WalletConfigService {
  async get(): Promise<WalletConfig> {
    try {
      const raw = await redisClient.getClient().get(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WalletConfig>;
        return {
          minDeposit: numOr(parsed.minDeposit, DEFAULTS.minDeposit),
          maxDeposit: numOr(parsed.maxDeposit, DEFAULTS.maxDeposit),
          minWithdrawal: numOr(parsed.minWithdrawal, DEFAULTS.minWithdrawal),
          maxWithdrawal: numOr(parsed.maxWithdrawal, DEFAULTS.maxWithdrawal),
          wagerMultiplier: numOr(parsed.wagerMultiplier, DEFAULTS.wagerMultiplier),
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read wallet config from Redis');
    }

    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
      if (row && row.value) {
        const parsed = row.value as Partial<WalletConfig>;
        const config = {
          minDeposit: numOr(parsed.minDeposit, DEFAULTS.minDeposit),
          maxDeposit: numOr(parsed.maxDeposit, DEFAULTS.maxDeposit),
          minWithdrawal: numOr(parsed.minWithdrawal, DEFAULTS.minWithdrawal),
          maxWithdrawal: numOr(parsed.maxWithdrawal, DEFAULTS.maxWithdrawal),
          wagerMultiplier: numOr(parsed.wagerMultiplier, DEFAULTS.wagerMultiplier),
        };
        await redisClient.getClient().set(KEY, JSON.stringify(config)).catch(() => {});
        return config;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to read wallet config from DB');
    }

    return { ...DEFAULTS };
  }

  /**
   * Backwards-compatible alias for the masked-read entry point. There
   * are no longer any secret-flavoured fields, so this returns the
   * plain config — kept on the surface so the admin route stays
   * unchanged.
   */
  async getMasked(): Promise<WalletConfig> {
    return this.get();
  }

  async update(patch: Partial<WalletConfig>): Promise<WalletConfig> {
    const current = await this.get();
    const next: WalletConfig = { ...current, ...patch };

    // Sanity checks
    if (next.minDeposit < 0) next.minDeposit = 0;
    if (next.maxDeposit < next.minDeposit) next.maxDeposit = next.minDeposit;
    if (next.minWithdrawal < 0) next.minWithdrawal = 0;
    if (next.maxWithdrawal < next.minWithdrawal) {
      next.maxWithdrawal = next.minWithdrawal;
    }
    if (next.wagerMultiplier < 0) next.wagerMultiplier = 0;
    if (next.wagerMultiplier > 100) next.wagerMultiplier = 100;

    try {
      await prisma.systemConfig.upsert({
        where: { key: KEY },
        update: { value: next as any },
        create: { key: KEY, value: next as any },
      });
      await redisClient.getClient().set(KEY, JSON.stringify(next));
    } catch (err) {
      logger.error({ err }, 'Failed to persist wallet config');
      throw new Error('Failed to persist wallet config');
    }
    return next;
  }

  defaults(): WalletConfig {
    return { ...DEFAULTS };
  }
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const walletConfig = new WalletConfigService();
