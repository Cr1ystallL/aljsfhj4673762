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

      let tournamentBalances: Array<{ gameType: string; balance: number }> = [];
      try {
        const activeParticipants = await (prisma as any).tournamentParticipant.findMany({
          where: {
            userId,
            cycle: {
              startsAt: { lte: new Date() },
              endsAt: { gte: new Date() },
              tournament: { active: true },
            },
          },
          include: { cycle: { include: { tournament: true } } },
        });
        tournamentBalances = activeParticipants.map((p: any) => ({
          gameType: p.cycle.tournament.gameType,
          balance: Number(p.balance),
        }));
      } catch {}

      const result = {
        amount: Number(balance.amount),
        currency: balance.currency,
        freeCases: Number(balance.freeCases ?? 0),
        freeCasesJson: (balance.freeCasesJson as Record<string, any>) || {},
        wagerTarget: Number(balance.wagerTarget),
        wagerProgress: Number(balance.wagerProgress),
        autoRtpTarget: Number(balance.autoRtpTarget),
        autoRtpProgress: Number(balance.autoRtpProgress),
        tournamentBalances,
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
      await this.broadcastBalanceUpdate(userId, b);
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
  async notifyBalance(
    userId: string,
    amount: number,
    wagerTarget = 0,
    wagerProgress = 0,
    autoRtpTarget = 0,
    autoRtpProgress = 0
  ) {
    const payload = { 
      amount, currency: 'PLN', 
      wagerTarget, wagerProgress, 
      autoRtpTarget, autoRtpProgress 
    };
    await this.cacheBalance(userId, payload);
    await this.broadcastBalanceUpdate(userId, payload);
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

      const oldBalance = await prisma.balance.findUnique({
        where: { userId: user.id },
      });
      const oldAmount = Number(oldBalance?.amount ?? 0);
      const delta = newAmount - oldAmount;

      const updatedBalance = await prisma.balance.upsert({
        where: { userId: user.id },
        update: {
          amount: newAmount,
          lastSyncedAt: new Date(),
          ...(delta > 0 ? {
            wagerTarget: { increment: delta * 2 },
            autoRtpTarget: { increment: delta * 2 },
          } : {}),
        },
        create: {
          userId: user.id,
          amount: newAmount,
          currency: 'PLN',
          demoMode: false,
          wagerTarget: delta > 0 ? delta * 2 : 0,
          autoRtpTarget: delta > 0 ? delta * 2 : 0,
        },
      });

      await this.invalidateCache(user.id);
      await this.broadcastBalanceUpdate(user.id, {
        amount: Number(updatedBalance.amount),
        currency: 'PLN',
        wagerTarget: Number(updatedBalance.wagerTarget),
        wagerProgress: Number(updatedBalance.wagerProgress),
        autoRtpTarget: Number(updatedBalance.autoRtpTarget),
        autoRtpProgress: Number(updatedBalance.autoRtpProgress),
        freeCases: Number(updatedBalance.freeCases)
      });

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
    balance: { 
      amount: number; currency: string;
      wagerTarget?: number; wagerProgress?: number;
      autoRtpTarget?: number; autoRtpProgress?: number;
      freeCases?: number;
    }
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
        return JSON.parse(cached) as { 
          amount: number; currency: string;
          wagerTarget: number; wagerProgress: number;
          autoRtpTarget: number; autoRtpProgress: number;
          freeCases: number;
        };
      }
    } catch (error) {
      logger.error(error, 'Failed to get cached balance');
    }
    return null;
  }

  private async broadcastBalanceUpdate(
    userId: string,
    payload: { 
      amount: number; currency: string;
      wagerTarget?: number; wagerProgress?: number;
      autoRtpTarget?: number; autoRtpProgress?: number;
      freeCases?: number;
      tournamentBalances?: Array<{ gameType: string; balance: number }>;
    }
  ) {
    await wsManager.publishBroadcast({
      userId,
      message: {
        type: 'balance_update',
        payload: {
          ...payload,
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
