import { PrismaClient } from '@prisma/client';
import { pythonBotAdapter } from '../adapters/python-bot-adapter.js';
import { logger } from '../utils/logger.js';

/**
 * Transaction Service - Synchronization Layer
 * 
 * CRITICAL: Python bot owns transaction processing
 * This service only:
 * - Syncs transaction history for display
 * - Caches recent transactions
 * - Does NOT process transactions independently
 */

const prisma = new PrismaClient();

export class TransactionService {
  /**
   * Sync transactions from Python bot
   */
  async syncTransactions(userId: string, limit: number = 50) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return [];

      // Fetch from Python bot (source of truth)
      const pythonTransactions = await pythonBotAdapter.getTransactions(
        Number(user.telegramId),
        limit
      );

      // Store in local database for quick reads
      for (const tx of pythonTransactions) {
        await prisma.transaction.upsert({
          where: { id: tx.id },
          update: {
            type: tx.type,
            amount: tx.amount,
            createdAt: new Date(tx.timestamp),
          },
          create: {
            id: tx.id,
            userId: user.id,
            type: tx.type,
            amount: tx.amount,
            balanceBefore: 0, // Python bot doesn't provide this
            balanceAfter: 0,
            createdAt: new Date(tx.timestamp),
          },
        });
      }

      logger.info({ userId, count: pythonTransactions.length }, 'Transactions synced');

      return pythonTransactions;
    } catch (error) {
      logger.error(error, 'Failed to sync transactions');
      return [];
    }
  }

  /**
   * Get transaction history (from local cache)
   */
  async getTransactions(userId: string, limit: number = 50) {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      createdAt: tx.createdAt,
      gameType: tx.gameType,
    }));
  }

  /**
   * Record transaction reference (for tracking only)
   * Actual transaction processed by Python bot
   */
  async recordTransactionReference(
    userId: string,
    type: string,
    amount: number,
    metadata?: any
  ) {
    try {
      const tx = await prisma.transaction.create({
        data: {
          userId,
          type,
          amount,
          balanceBefore: 0,
          balanceAfter: 0,
          metadata,
        },
      });

      logger.info({ userId, type, amount }, 'Transaction reference recorded');

      return tx;
    } catch (error) {
      logger.error(error, 'Failed to record transaction reference');
      throw error;
    }
  }
}

export const transactionService = new TransactionService();
