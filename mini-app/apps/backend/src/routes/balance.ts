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
      const { prisma } = await import('../lib/prisma.js');
      
      const activeParticipants = await (prisma as any).tournamentParticipant.findMany({
        where: {
          userId,
          cycle: {
            startsAt: { lte: new Date() },
            endsAt: { gte: new Date() },
            tournament: { active: true }
          }
        },
        include: { cycle: { include: { tournament: true } } }
      });

      const tournamentBalances = activeParticipants.map((p: any) => ({
        gameType: p.cycle.tournament.gameType,
        balance: Number(p.balance)
      }));

      return reply.send({
        balance: {
          amount: balance.amount,
          currency: balance.currency,
          demoMode: false,
        },
        tournamentBalances
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
   * GET /api/balance/payment-history
   *
   * Combined deposit + withdrawal history for the authenticated user.
   * Pulls live MacvPay order rows for deposits (so the player sees
   * their pending / paid / cancelled / expired orders) and withdrawal
   * requests for withdrawals (status + reviewer's rejection reason).
   *
   * Returned shape is one flat list, newest first, each entry tagged
   * with `kind: 'deposit' | 'withdrawal'`. No financial mutations
   * happen here.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/payment-history',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const limit = Math.min(
        100,
        Math.max(5, parseInt(request.query.limit ?? '40', 10))
      );

      try {
        // ---- Deposits via MacvPay -------------------------------
        interface MacvpayRow {
          id: string;
          requested_amount: string;
          unique_amount: string | null;
          currency: string;
          payment_type: string;
          status: string;
          card: string | null;
          recipient: string | null;
          expires_at: Date | null;
          paid_at: Date | null;
          created_at: Date;
        }
        let macvpayRows: MacvpayRow[] = [];
        try {
          const { Prisma } = await import('@prisma/client');
          macvpayRows = await (
            request.server as unknown as { prisma: typeof import('../lib/prisma.js').prisma }
          ).prisma.$queryRaw<MacvpayRow[]>(Prisma.sql`
            SELECT id, requested_amount, unique_amount, currency,
                   payment_type, status, card, recipient,
                   expires_at, paid_at, created_at
              FROM macvpay_orders
             WHERE user_id = ${userId}
             ORDER BY created_at DESC
             LIMIT ${limit}
          `);
        } catch {
          // Table missing on older deployments — silently skip.
          macvpayRows = [];
        }

        // ---- Withdrawals ---------------------------------------
        interface WithdrawalRow {
          id: string;
          amount: string;
          currency: string;
          method: string;
          destination: string;
          status: string;
          rejection_reason: string | null;
          reviewed_at: Date | null;
          metadata: unknown;
          created_at: Date;
          updated_at: Date;
        }
        let withdrawalRows: WithdrawalRow[] = [];
        try {
          const { Prisma } = await import('@prisma/client');
          withdrawalRows = await (
            request.server as unknown as { prisma: typeof import('../lib/prisma.js').prisma }
          ).prisma.$queryRaw<WithdrawalRow[]>(Prisma.sql`
            SELECT id, amount, currency, method, destination, status,
                   rejection_reason, reviewed_at, metadata,
                   created_at, updated_at
              FROM withdrawal_requests
             WHERE user_id = ${userId}
             ORDER BY created_at DESC
             LIMIT ${limit}
          `);
        } catch {
          withdrawalRows = [];
        }

        const now = Date.now();

        const deposits = macvpayRows.map((o) => {
          const expiresAt = o.expires_at?.getTime() ?? null;
          let status = o.status;
          if (status === 'pending' && expiresAt && expiresAt < now) {
            status = 'expired';
          }
          return {
            kind: 'deposit' as const,
            id: o.id,
            amount: Number(o.requested_amount),
            uniqueAmount: o.unique_amount != null ? Number(o.unique_amount) : null,
            currency: o.currency,
            paymentType: o.payment_type,
            status,
            details: o.card,
            recipient: o.recipient,
            expiresAt,
            paidAt: o.paid_at?.getTime() ?? null,
            createdAt: o.created_at.getTime(),
          };
        });

        const withdrawals = withdrawalRows.map((w) => {
          // Pull readable inputs from metadata so the user sees what
          // they typed (phone, bank, holder, card).
          const md = (w.metadata ?? {}) as Record<string, string>;
          return {
            kind: 'withdrawal' as const,
            id: w.id,
            amount: Number(w.amount),
            currency: w.currency,
            method: w.method,
            destination: w.destination,
            status: w.status,
            rejectionReason: w.rejection_reason,
            details: {
              phone: md.phone ?? null,
              bank: md.bank ?? null,
              card: md.card ?? null,
              holder: md.holder ?? null,
            },
            reviewedAt: w.reviewed_at?.getTime() ?? null,
            createdAt: w.created_at.getTime(),
            updatedAt: w.updated_at.getTime(),
          };
        });

        // Merge + sort newest first.
        const combined = [...deposits, ...withdrawals].sort(
          (a, b) => b.createdAt - a.createdAt
        );

        return reply.send({ ok: true, history: combined.slice(0, limit) });
      } catch (error) {
        logger.error(error, 'Failed to read payment history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to read payment history',
          code: 'PAYMENT_HISTORY_FAILED',
        });
      }
    }
  );
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
