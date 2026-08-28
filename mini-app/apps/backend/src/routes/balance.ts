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
          freeCases: (balance as any).freeCases ?? 0,
          freeCasesJson: (balance as any).freeCasesJson ?? {},
          demoMode: false,
          wagerTarget: balance.wagerTarget,
          wagerProgress: balance.wagerProgress,
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
        success: true,
        balance: {
          amount: balance.amount,
          currency: balance.currency,
          freeCases: (balance as any).freeCases ?? 0,
          freeCasesJson: (balance as any).freeCasesJson ?? {},
          demoMode: false,
          wagerTarget: balance.wagerTarget,
          wagerProgress: balance.wagerProgress,
        },
        tournamentBalances,
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
   * GET /api/balance/catch-up
   * Personal return hooks for the home lobby: max win in the last 24h,
   * unopened free cases, and the live win streak. No invented numbers.
   */
  app.get('/catch-up', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [wins, balance, user] = await Promise.all([
        app.prisma.transaction.findMany({
          where: {
            userId,
            type: { in: ['win', 'cashout'] },
            createdAt: { gte: since },
          },
          select: { amount: true, metadata: true, gameType: true },
          orderBy: { createdAt: 'desc' },
          take: 250,
        }),
        balanceService.getBalance(userId),
        app.prisma.user.findUnique({
          where: { id: userId },
          select: { currentWinStreak: true },
        }),
      ]);

      let maxWin24h = 0;
      let maxMultiplier24h = 0;
      let maxWinGame: string | null = null;
      for (const row of wins) {
        const amt = Math.abs(Number(row.amount));
        if (Number.isFinite(amt) && amt > maxWin24h) {
          maxWin24h = amt;
          maxWinGame = row.gameType ?? null;
        }
        const meta = (row.metadata ?? {}) as { multiplier?: unknown; gameType?: unknown };
        const mult = Number(meta.multiplier);
        if (Number.isFinite(mult) && mult > maxMultiplier24h) {
          maxMultiplier24h = mult;
        }
        if (!maxWinGame && typeof meta.gameType === 'string') {
          maxWinGame = meta.gameType;
        }
      }

      const json = ((balance as { freeCasesJson?: Record<string, { count?: number }> })
        .freeCasesJson ?? {}) as Record<string, { count?: number }>;
      const legacy = Number((balance as { freeCases?: number }).freeCases ?? 0);
      const ids = new Set<string>(['case_1', ...Object.keys(json)]);
      let freeCases = 0;
      for (const id of ids) {
        const n = Number(json[id]?.count ?? 0);
        if (id === 'case_1') freeCases += Math.max(legacy, Number.isFinite(n) ? n : 0);
        else if (Number.isFinite(n) && n > 0) freeCases += n;
      }

      return reply.send({
        ok: true,
        maxWin24h: Math.round(maxWin24h * 100) / 100,
        maxMultiplier24h: Math.round(maxMultiplier24h * 100) / 100,
        maxWinGame,
        freeCases,
        winStreak: Math.max(0, user?.currentWinStreak ?? 0),
      });
    } catch (error) {
      logger.error(error, 'Failed to load catch-up');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to load catch-up',
        code: 'CATCH_UP_FAILED',
      });
    }
  });

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

        // ---- Direct Crypto Deposits -----------------------------
        interface DirectCryptoRow {
          id: string;
          network: string;
          requested_pln: string;
          unique_usdt: string;
          deposit_address: string;
          status: string;
          expires_at: Date;
          paid_at: Date | null;
          created_at: Date;
        }
        let directCryptoRows: DirectCryptoRow[] = [];
        try {
          const { Prisma } = await import('@prisma/client');
          directCryptoRows = await (
            request.server as unknown as { prisma: typeof import('../lib/prisma.js').prisma }
          ).prisma.$queryRaw<DirectCryptoRow[]>(Prisma.sql`
            SELECT id, network, requested_pln, unique_usdt, deposit_address, status,
                   expires_at, paid_at, created_at
              FROM direct_crypto_deposits
             WHERE user_id = ${userId}
             ORDER BY created_at DESC
             LIMIT ${limit}
          `);
        } catch {
          directCryptoRows = [];
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

        const foluxDeposits = macvpayRows.map((o) => {
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

        const cryptoDeposits = directCryptoRows.map((d) => {
          const expiresAt = d.expires_at?.getTime() ?? null;
          let status = d.status;
          if (status === 'pending' && expiresAt && expiresAt < now) {
            status = 'expired';
          }
          return {
            kind: 'deposit' as const,
            id: d.id,
            amount: Number(d.requested_pln),
            uniqueAmount: Number(d.unique_usdt),
            currency: 'PLN',
            paymentType: `crypto_${d.network.toLowerCase()}`,
            status,
            details: d.deposit_address,
            recipient: null,
            expiresAt,
            paidAt: d.paid_at?.getTime() ?? null,
            createdAt: d.created_at.getTime(),
          };
        });

        const deposits = [...foluxDeposits, ...cryptoDeposits];

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
