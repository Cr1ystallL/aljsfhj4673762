import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Wallet / payments configuration.
 *
 * Stored in Redis. The actual provider keys aren't sent to the
 * frontend wholesale — we mask them on read (`••••${last4}`) and only
 * the `reveal=true` flag (admin-only) returns the full string.
 */

export interface WalletConfig {
  // Crypto receive addresses
  cryptoUsdtTrc20: string;
  cryptoBtc: string;
  cryptoEth: string;

  // Provider API keys (encrypted at rest is a future enhancement —
  // for now they sit in Redis behind the admin gate).
  piastrixApiKey: string;
  freekassaApiKey: string;
  fkWalletApiKey: string;

  // Limits
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;

  // Wager requirement multiplier — withdrawals refuse if turnover
  // since last deposit < deposit × wagerMultiplier.
  wagerMultiplier: number;

  // Comissions (percent, 0..1).
  cryptoFee: number;
  cardFee: number;
}

const DEFAULTS: WalletConfig = {
  cryptoUsdtTrc20: '',
  cryptoBtc: '',
  cryptoEth: '',
  piastrixApiKey: '',
  freekassaApiKey: '',
  fkWalletApiKey: '',
  minDeposit: 10,
  maxDeposit: 100000,
  minWithdrawal: 50,
  maxWithdrawal: 100000,
  wagerMultiplier: 1,
  cryptoFee: 0,
  cardFee: 0.025,
};

const KEY = 'wallet_config';

/** Mask helpers — show only the last 4 chars of secrets. */
function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

class WalletConfigService {
  async get(): Promise<WalletConfig> {
    try {
      const raw = await redisClient.getClient().get(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<WalletConfig>;
      return { ...DEFAULTS, ...parsed };
    } catch (err) {
      logger.warn({ err }, 'Failed to read wallet config; using defaults');
      return { ...DEFAULTS };
    }
  }

  /**
   * Returns the config with all secret-flavoured fields masked. Use
   * this for the "view" UI — `getRaw()` is reserved for the explicit
   * "Раскрыть" admin action that pops a confirmation.
   */
  async getMasked(): Promise<WalletConfig> {
    const cfg = await this.get();
    return {
      ...cfg,
      piastrixApiKey: mask(cfg.piastrixApiKey),
      freekassaApiKey: mask(cfg.freekassaApiKey),
      fkWalletApiKey: mask(cfg.fkWalletApiKey),
    };
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
    if (next.cryptoFee < 0) next.cryptoFee = 0;
    if (next.cryptoFee > 0.5) next.cryptoFee = 0.5;
    if (next.cardFee < 0) next.cardFee = 0;
    if (next.cardFee > 0.5) next.cardFee = 0.5;

    try {
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

export const walletConfig = new WalletConfigService();
