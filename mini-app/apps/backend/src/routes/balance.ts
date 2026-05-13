import type { FastifyInstance } from 'fastify';
import { balanceService } from '../services/balance-service.js';
import { transactionService } from '../services/transaction-service.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Balance Routes
 * 
 * CRITICAL: All balance operations sync with Python bot
 * No independent balance modifications
 */
export async function balanceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/balance
   * Get current balance (real or demo)
   */
  app.get<{
    Querystring: {
      demo?: string;
    };
  }>(
    '/',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const demoMode = request.query.demo === 'true';

      try {
        const balance = await balanceService.getBalance(userId, demoMode);

        return reply.send({
          balance: {
            amount: balance.amount,
            currency: balance.currency,
            demoMode: balance.demoMode,
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
    }
  );

  /**
   * POST /api/balance/sync
   * Force sync balance from Python bot
   */
  app.post(
    '/sync',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      try {
        await balanceService.syncBalance(userId);
        const balance = await balanceService.getBalance(userId, false);

        return reply.send({
          success: true,
          balance: {
            amount: balance.amount,
            currency: balance.currency,
            demoMode: balance.demoMode,
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
    }
  );

  /**
   * POST /api/balance/mode
   * Switch between demo and real mode
   */
  app.post<{
    Body: {
      demoMode: boolean;
    };
  }>(
    '/mode',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['demoMode'],
          properties: {
            demoMode: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { demoMode } = request.body;

      try {
        const balance = await balanceService.switchMode(userId, demoMode);

        return reply.send({
          success: true,
          balance: {
            amount: balance.amount,
            currency: balance.currency,
            demoMode: balance.demoMode,
          },
        });
      } catch (error) {
        logger.error(error, 'Failed to switch mode');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to switch mode',
          code: 'SWITCH_MODE_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/balance/transactions
   * Get transaction history
   */
  app.get(
    '/transactions',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const limit = parseInt((request.query as any).limit || '50', 10);

      try {
        // Sync from Python bot first
        await transactionService.syncTransactions(userId, limit);

        // Get from local cache
        const transactions = await transactionService.getTransactions(userId, limit);

        return reply.send({
          transactions,
        });
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
   * Webhook from Python bot for balance updates
   * Called when Python bot processes transaction
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

      // Verify API key
      if (apiKey !== process.env.PYTHON_BOT_API_KEY) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key',
          code: 'INVALID_API_KEY',
        });
      }

      try {
        await balanceService.handleBalanceUpdate(telegramId, amount, reason, transactionId);

        return reply.send({
          success: true,
        });
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
