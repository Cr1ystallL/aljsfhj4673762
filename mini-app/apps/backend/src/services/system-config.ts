import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

export interface SystemConfig {
  autoRtpLossChance: number; // e.g. 0.70 for 70% loss
}

const DEFAULTS: SystemConfig = {
  autoRtpLossChance: 0.70,
};

const KEY = 'system_config';

class SystemConfigService {
  async get(): Promise<SystemConfig> {
    try {
      const raw = await redisClient.getClient().get(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<SystemConfig>;
      return {
        autoRtpLossChance: typeof parsed.autoRtpLossChance === 'number' ? parsed.autoRtpLossChance : DEFAULTS.autoRtpLossChance,
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to read system config; using defaults');
      return { ...DEFAULTS };
    }
  }

  async update(patch: Partial<SystemConfig>): Promise<SystemConfig> {
    const current = await this.get();
    const next: SystemConfig = { ...current, ...patch };

    // Sanity
    if (next.autoRtpLossChance < 0) next.autoRtpLossChance = 0;
    if (next.autoRtpLossChance > 1) next.autoRtpLossChance = 1;

    try {
      await redisClient.getClient().set(KEY, JSON.stringify(next));
    } catch (err) {
      logger.error({ err }, 'Failed to persist system config');
      throw err;
    }
    return next;
  }
}

export const systemConfig = new SystemConfigService();
