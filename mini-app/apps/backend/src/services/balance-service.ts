import { PrismaClient } from '@prisma/client';
import { pythonBotAdapter } from '../adapters/python-bot-adapter.js';
import { redisClient } from '../lib/redis.js';
import { wsManager } from '../lib/websocket-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Balance Service - Synchronization Layer
 * 
 * CRITICAL: Python bot is the source of truth
 * This service only:
 * - Caches balance for performance
 * - Synchronizes with Python bot
 * - Broadcasts updates via WebSocket
 * - Handles demo mode (isolated)
 * 
 * Does NOT:
 * - Own balance logic
 * - Process transactions independently
 * - Create separate accounting
 */

const prisma = new PrismaClient();

export class BalanceService {
  private readonly CACHE_PREFIX = 'balance:';
  private readonly CACHE_TTL = 60; // 1 minute

  /**
   * Get balance (real or demo)
   * Real: Fetch from Python bot, cache in Redis
   * Demo: Fetch from local database
   */
  async getBalance(userId: string, demoMode: boolean = false) {
    if (demoMode) {
      return this.getDemoBalance(userId);
    }

    try {
      // Check cache first
      const cached = await this.getCachedBalance(userId);
      if (cached) {
        return cached;
      }

      // Fetch from Python bot (source of truth)
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const pythonBalance = await pythonBotAdapter.getBalance(Number(user.telegramId));
      
      if (!pythonBalance) {
        throw new Error('Failed to fetch balance from Python bot');
      }

      // Cache in Redis
      await this.cacheBalance(userId, {
        amount: Number(pythonBalance.amount),
        currency: pythonBalance.currency,
        demoMode: false,
      });

      // Update local cache (for quick reads)
      await prisma.balance.upsert({
        where: { userId },
        update: {
          amount: pythonBalance.amount,
          currency: pythonBalance.currency,
          demoMode: false,
          lastSyncedAt: new Date(),
        },
        create: {
          userId,
          amount: pythonBalance.amount,
          currency: pythonBalance.currency,
          demoMode: false,
        },
      });

      return {
        amount: Number(pythonBalance.amount),
        currency: pythonBalance.currency,
        demoMode: false,
      };
    } catch (error) {
      logger.error(error, 'Failed to get balance');
      throw error;
    }
  }

  /**
   * Sync balance from Python bot
   * Called periodically or after transactions
   */
  async syncBalance(userId: string) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return;

      const pythonBalance = await pythonBotAdapter.getBalance(Number(user.telegramId));
      if (!pythonBalance) return;

      const amount = Number(pythonBalance.amount);

      // Update cache
      await this.cacheBalance(userId, {
        amount,
        currency: pythonBalance.currency,
        demoMode: false,
      });

      // Update database
      await prisma.balance.upsert({
        where: { userId },
        update: {
          amount: pythonBalance.amount,
          lastSyncedAt: new Date(),
        },
        create: {
          userId,
          amount: pythonBalance.amount,
          currency: pythonBalance.currency,
          demoMode: false,
        },
      });

      // Broadcast to user's WebSocket connections
      await this.broadcastBalanceUpdate(userId, amount, pythonBalance.currency, false);

      logger.info({ userId, amount }, 'Balance synced from Python bot');
    } catch (error) {
      logger.error(error, 'Failed to sync balance');
    }
  }

  /**
   * Handle balance update from Python bot webhook
   * Called when Python bot processes transaction
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

      // Update cache
      await this.cacheBalance(user.id, {
        amount: newAmount,
        currency: 'USD',
        demoMode: false,
      });

      // Update database
      const balance = await prisma.balance.upsert({
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

      // Broadcast to user
      await this.broadcastBalanceUpdate(user.id, newAmount, 'USD', false);

      logger.info(
        { userId: user.id, newAmount, reason, transactionId },
        'Balance updated from Python bot'
      );
    } catch (error) {
      logger.error(error, 'Failed to handle balance update');
    }
  }

  /**
   * Demo mode balance (isolated, local only)
   */
  private async getDemoBalance(userId: string) {
    const balance = await prisma.balance.findUnique({
      where: { userId },
    });

    if (!balance || !balance.demoMode) {
      // Create demo balance
      const demoBalance = await prisma.balance.upsert({
        where: { userId },
        update: {
          demoMode: true,
          amount: 10000, // Demo starting balance
        },
        create: {
          userId,
          amount: 10000,
          currency: 'USD',
          demoMode: true,
        },
      });

      return {
        amount: Number(demoBalance.amount),
        currency: demoBalance.currency,
        demoMode: true,
      };
    }

    return {
      amount: Number(balance.amount),
      currency: balance.currency,
      demoMode: true,
    };
  }

  /**
   * Update demo balance (local only, no Python bot sync)
   */
  async updateDemoBalance(userId: string, newAmount: number) {
    const balance = await prisma.balance.update({
      where: { userId },
      data: {
        amount: newAmount,
        demoMode: true,
      },
    });

    // Broadcast to user
    await this.broadcastBalanceUpdate(userId, newAmount, balance.currency, true);

    return {
      amount: Number(balance.amount),
      currency: balance.currency,
      demoMode: true,
    };
  }

  /**
   * Switch between demo and real mode
   */
  async switchMode(userId: string, demoMode: boolean) {
    if (demoMode) {
      // Switch to demo
      await prisma.balance.update({
        where: { userId },
        data: { demoMode: true },
      });
    } else {
      // Switch to real - sync from Python bot
      await this.syncBalance(userId);
    }

    const balance = await this.getBalance(userId, demoMode);
    return balance;
  }

  /**
   * Cache balance in Redis
   */
  private async cacheBalance(
    userId: string,
    balance: { amount: number; currency: string; demoMode: boolean }
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

  /**
   * Get cached balance from Redis
   */
  private async getCachedBalance(userId: string) {
    try {
      const redis = redisClient.getClient();
      const cached = await redis.get(`${this.CACHE_PREFIX}${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error(error, 'Failed to get cached balance');
    }
    return null;
  }

  /**
   * Broadcast balance update via WebSocket
   */
  private async broadcastBalanceUpdate(
    userId: string,
    amount: number,
    currency: string,
    demoMode: boolean
  ) {
    await wsManager.publishBroadcast({
      userId,
      message: {
        type: 'balance_update',
        payload: {
          amount,
          currency,
          demoMode,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Invalidate balance cache
   * Called after transactions to force refresh
   */
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
