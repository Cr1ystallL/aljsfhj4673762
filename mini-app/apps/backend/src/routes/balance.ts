import type { FastifyInstance } from 'fastify';
import { balanceService } from '../services/balance-service.js';
import { transactionService } from '../services/transaction-service.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Balance Routes — single shared real-money balance.
 *
 * The same row is read/written by the Python Telegram bot and by the
 * Node backend. Demo mode has been retired everywhere; the legacy
 * `?demo=true` query param is silently ignored for source compat.
 */
export async function balanceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/balance
   * Get the user's current real-money balance.
   */
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    try {
      const balance = await balanceService.getBalance(userId);
      return reply.send({
        balance: {
          amount: balance.amount,
          currency: balance.currency,
          demoMode: false,
        },
      });
    } catch (error) {
      logger.error(error, 'Failed to get balance');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get balance',
        code: 'GET_BALANCE_FAILED',
      });
    }
  });

  /**
   * POST /api/balance/sync
   * Force-refresh balance from the shared DB.
   */
  app.post('/sync', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    try {
      await balanceService.syncBalance(userId);
      const balance = await balanceService.getBalance(userId);

      return reply.send({
        success: true,
        balance: {
          amount: balance.amount,
          currency: balance.currency,
          demoMode: false,
        },
      });
    } catch (error) {
      logger.error(error, 'Failed to sync balance');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to sync balance',
        code: 'SYNC_BALANCE_FAILED',
      });
    }
  });

  /**
   * GET /api/balance/transactions
   * Get transaction history.
   */
  app.get(
    '/transactions',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const limit = parseInt((request.query as { limit?: string }).limit || '50', 10);

      try {
        await transactionService.syncTransactions(userId, limit);
        const transactions = await transactionService.getTransactions(userId, limit);
        return reply.send({ transactions });
      } catch (error) {
        logger.error(error, 'Failed to get transactions');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get transactions',
          code: 'GET_TRANSACTIONS_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/balance/webhook
   * Webhook from the Python bot for balance updates.
   */
  app.post<{
    Body: {
      telegramId: number;
      amount: number;
      reason: string;
      transactionId?: string;
      apiKey: string;
    };
  }>(
    '/webhook',
    {
      schema: {
        body: {
          type: 'object',
          required: ['telegramId', 'amount', 'reason', 'apiKey'],
          properties: {
            telegramId: { type: 'number' },
            amount: { type: 'number' },
            reason: { type: 'string' },
            transactionId: { type: 'string' },
            apiKey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { telegramId, amount, reason, transactionId, apiKey } = request.body;

      if (apiKey !== process.env.PYTHON_BOT_API_KEY) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key',
          code: 'INVALID_API_KEY',
        });
      }

      try {
        await balanceService.handleBalanceUpdate(
          telegramId,
          amount,
          reason,
          transactionId
        );
        return reply.send({ success: true });
      } catch (error) {
        logger.error(error, 'Failed to handle balance webhook');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process webhook',
          code: 'WEBHOOK_FAILED',
        });
      }
    }
  );
}
