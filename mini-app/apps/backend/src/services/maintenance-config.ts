import { redisClient } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Global maintenance (tech) mode flag.
 *
 * Stored in Redis under `maintenance_config`.
 * When enabled, both the mini-app and the Telegram bot
 * should surface a friendly message and block normal usage.
 */
export interface MaintenanceConfig {
  enabled: boolean;
  /** Optional custom message shown to users. */
  message?: string;
}

const DEFAULTS: MaintenanceConfig = {
  enabled: false,
  message: undefined,
};

const KEY = 'maintenance_config';

class MaintenanceConfigService {
  async get(): Promise<MaintenanceConfig> {
    try {
      const raw = await redisClient.getClient().get(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MaintenanceConfig>;
        return {
          enabled: Boolean(parsed.enabled ?? DEFAULTS.enabled),
          message: parsed.message ?? DEFAULTS.message,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read maintenance config from Redis');
    }

    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
      if (row && row.value) {
        const parsed = row.value as Partial<MaintenanceConfig>;
        const config = {
          enabled: Boolean(parsed.enabled ?? DEFAULTS.enabled),
          message: parsed.message ?? DEFAULTS.message,
        };
        await redisClient.getClient().set(KEY, JSON.stringify(config)).catch(() => {});
        return config;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to read maintenance config from DB');
    }

    return { ...DEFAULTS };
  }

  async update(patch: Partial<MaintenanceConfig>): Promise<MaintenanceConfig> {
    const current = await this.get();
    const next: MaintenanceConfig = { ...current, ...patch };

    try {
      await prisma.systemConfig.upsert({
        where: { key: KEY },
        update: { value: next as any },
        create: { key: KEY, value: next as any },
      });
      await redisClient.getClient().set(KEY, JSON.stringify(next));
    } catch (err) {
      logger.error({ err }, 'Failed to persist maintenance config');
      throw err;
    }
    return next;
  }
}

export const maintenanceConfig = new MaintenanceConfigService();
