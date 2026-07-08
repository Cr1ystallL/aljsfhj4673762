import { redisClient } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
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
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SystemConfig>;
        return {
          autoRtpLossChance: typeof parsed.autoRtpLossChance === 'number' ? parsed.autoRtpLossChance : DEFAULTS.autoRtpLossChance,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read system config from Redis');
    }

    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
      if (row && row.value) {
        const parsed = row.value as Partial<SystemConfig>;
        const config = {
          autoRtpLossChance: typeof parsed.autoRtpLossChance === 'number' ? parsed.autoRtpLossChance : DEFAULTS.autoRtpLossChance,
        };
        await redisClient.getClient().set(KEY, JSON.stringify(config)).catch(() => {});
        return config;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to read system config from DB');
    }

    return { ...DEFAULTS };
  }

  async update(patch: Partial<SystemConfig>): Promise<SystemConfig> {
    const current = await this.get();
    const next: SystemConfig = { ...current, ...patch };

    // Sanity
    if (next.autoRtpLossChance < 0) next.autoRtpLossChance = 0;
    if (next.autoRtpLossChance > 1) next.autoRtpLossChance = 1;

    try {
      await prisma.systemConfig.upsert({
        where: { key: KEY },
        update: { value: next as any },
        create: { key: KEY, value: next as any },
      });
      await redisClient.getClient().set(KEY, JSON.stringify(next));
    } catch (err) {
      logger.error({ err }, 'Failed to persist system config');
      throw err;
    }
    return next;
  }
}

export const systemConfig = new SystemConfigService();
