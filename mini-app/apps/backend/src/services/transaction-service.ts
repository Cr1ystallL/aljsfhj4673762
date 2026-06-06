import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Transaction Service - reads from shared PostgreSQL.
 *
 * The `transactions` table is written by:
 *   - Node BettingPipeline (bet, win, cashout, refund) under Prisma transaction.
 *   - Python bot DatabasePostgres adapter (deposits, withdrawals, classic games).
 *
 * Both sides hit the same table, so this service only needs to read.
 */

const prisma = new PrismaClient();

export class TransactionService {
  /**
   * No-op kept for API compatibility.
   * Previously called Python bot HTTP endpoints which don't exist - we
   * instead rely on the bot writing to PostgreSQL directly.
   */
  async syncTransactions(_userId: string, _limit: number = 50) {
    return [];
  }

  /**
   * Get transaction history from shared DB.
   */
  async getTransactions(userId: string, limit: number = 50) {
    const transactions: any[] = await prisma.$queryRaw`
      SELECT id, type, amount, balance_before as "balanceBefore", balance_after as "balanceAfter", game_type as "gameType", game_round_id as "gameRoundId", metadata, created_at as "createdAt"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND (metadata->>'tournamentId' IS NULL)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      balanceBefore: Number(tx.balanceBefore),
      balanceAfter: Number(tx.balanceAfter),
      gameType: tx.gameType,
      gameRoundId: tx.gameRoundId,
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      source: (tx.metadata as Record<string, unknown> | null | undefined)?.source
        ? String((tx.metadata as Record<string, unknown>).source)
        : (tx.metadata as Record<string, unknown> | null | undefined)?.provider
          ? String((tx.metadata as Record<string, unknown>).provider)
          : null,
    }));
  }

  /**
   * Record an out-of-band transaction reference (e.g. for adapters).
   * Pipeline writes its own transaction rows inside its DB transactions,
   * this is for callers outside the pipeline.
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
