import { PrismaClient } from '@prisma/client';
import { redisClient } from '../lib/redis.js';
import { wsManager } from '../lib/websocket-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Balance Service — Single Source of Truth via shared PostgreSQL.
 *
 * The Python bot (DatabasePostgres) and the Node backend (Prisma) write to
 * the SAME `balances` row for each user. The mini-app shows whatever the
 * row holds — no demo balance, no parallel ledger. All mutations go
 * through BettingPipeline (atomic SQL with conditional WHERE) so the bot
 * and the API can't race each other into a negative balance.
 */

const prisma = new PrismaClient();

export class BalanceService {
  private readonly CACHE_PREFIX = 'balance:';
  private readonly CACHE_TTL = 60; // seconds

  /**
   * Get the user's real-money balance from the shared DB.
   */
  async getBalance(userId: string) {
    try {
      const cached = await this.getCachedBalance(userId);
      if (cached) return cached;

      let balance = await prisma.balance.findFirst({
        where: { userId, demoMode: false },
      });

      if (!balance) {
        balance = await prisma.balance.create({
          data: {
            userId,
            amount: 0,
            currency: 'USD',
            demoMode: false,
          },
        });
      }

      const result = {
        amount: Number(balance.amount),
        currency: balance.currency,
      };

      await this.cacheBalance(userId, result);
      return result;
    } catch (error) {
      logger.error(error, 'Failed to get balance');
      throw error;
    }
  }

  /**
   * Force-refresh balance from DB and notify subscribers. Useful after
   * the bot processes a deposit / withdrawal.
   */
  async syncBalance(userId: string) {
    try {
      await this.invalidateCache(userId);
      const b = await this.getBalance(userId);
      await this.broadcastBalanceUpdate(userId, b.amount, b.currency);
      logger.info({ userId, amount: b.amount }, 'Balance synced');
    } catch (error) {
      logger.error(error, 'Failed to sync balance');
    }
  }

  /**
   * Notify clients of a fresh balance value (called after pipeline mutations).
   * Refreshes the Redis cache so subsequent reads see the new amount.
   *
   * The 3rd argument is preserved for source-compat with callers that
   * still pass a flag — we ignore demo mode entirely.
   */
  async notifyBalance(userId: string, amount: number, _legacyDemoFlag?: unknown) {
    void _legacyDemoFlag;
    const payload = { amount, currency: 'USD' };
    await this.cacheBalance(userId, payload);
    await this.broadcastBalanceUpdate(userId, amount, 'USD');
  }

  /**
   * External hook: Python bot reports a balance change.
   * Resolves the user by telegram_id and rebroadcasts.
   */
  async handleBalanceUpdate(
    telegramId: number,
    newAmount: number,
    reason: string,
    transactionId?: string
  ) {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
      });

      if (!user) {
        logger.warn({ telegramId }, 'User not found for balance update');
        return;
      }

      // Upsert by composite of (userId, demoMode). Prisma's `Balance.userId`
      // is unique on its own, so a plain upsert is enough here.
      await prisma.balance.upsert({
        where: { userId: user.id },
        update: {
          amount: newAmount,
          lastSyncedAt: new Date(),
        },
        create: {
          userId: user.id,
          amount: newAmount,
          currency: 'USD',
          demoMode: false,
        },
      });

      await this.invalidateCache(user.id);
      await this.broadcastBalanceUpdate(user.id, newAmount, 'USD');

      logger.info(
        { userId: user.id, newAmount, reason, transactionId },
        'Balance updated externally'
      );
    } catch (error) {
      logger.error(error, 'Failed to handle balance update');
    }
  }

  // ---------- Redis cache helpers ----------

  private async cacheBalance(
    userId: string,
    balance: { amount: number; currency: string }
  ) {
    try {
      const redis = redisClient.getClient();
      await redis.setex(
        `${this.CACHE_PREFIX}${userId}`,
        this.CACHE_TTL,
        JSON.stringify(balance)
      );
    } catch (error) {
      logger.error(error, 'Failed to cache balance');
    }
  }

  private async getCachedBalance(userId: string) {
    try {
      const redis = redisClient.getClient();
      const cached = await redis.get(`${this.CACHE_PREFIX}${userId}`);
      if (cached) {
        return JSON.parse(cached) as { amount: number; currency: string };
      }
    } catch (error) {
      logger.error(error, 'Failed to get cached balance');
    }
    return null;
  }

  private async broadcastBalanceUpdate(
    userId: string,
    amount: number,
    currency: string
  ) {
    await wsManager.publishBroadcast({
      userId,
      message: {
        type: 'balance_update',
        payload: {
          amount,
          currency,
          demoMode: false,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      },
    });
  }

  async invalidateCache(userId: string) {
    try {
      const redis = redisClient.getClient();
      await redis.del(`${this.CACHE_PREFIX}${userId}`);
    } catch (error) {
      logger.error(error, 'Failed to invalidate cache');
    }
  }
}

export const balanceService = new BalanceService();
