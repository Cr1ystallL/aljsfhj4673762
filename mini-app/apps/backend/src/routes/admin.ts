import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  adminOnly,
  isAdminTelegramId,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { balanceService } from '../services/balance-service.js';

/**
 * Admin Routes — covert.
 *
 * Path prefix `/api/_x/` is intentionally obscure, every endpoint
 * 404s for non-admins, and the only authoritative check is the
 * Telegram ID in the verified JWT vs the `ADMIN_TELEGRAM_IDS` env var.
 *
 * All mutating endpoints write to `admin_audit_log` so every action is
 * attributable. The log is append-only — there is no UI to remove rows.
 */

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /* -------------------------------------------------------------- helpers */

  /**
   * Append a row to the audit log. Failures are logged but do not abort
   * the parent operation — losing audit entries is bad, but losing
   * legitimate admin actions because of an audit bug is worse.
   */
  async function audit(params: {
    request: AuthenticatedRequest;
    action: string;
    targetType: string;
    targetId?: string | null;
    payloadBefore?: unknown;
    payloadAfter?: unknown;
    reason?: string;
  }) {
    try {
      await app.prisma.adminAuditLog.create({
        data: {
          adminUserId: params.request.user.userId,
          adminTelegramId: BigInt(params.request.user.telegramId),
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId ?? null,
          payloadBefore:
            params.payloadBefore === undefined
              ? Prisma.JsonNull
              : (params.payloadBefore as Prisma.InputJsonValue),
          payloadAfter:
            params.payloadAfter === undefined
              ? Prisma.JsonNull
              : (params.payloadAfter as Prisma.InputJsonValue),
          reason: params.reason ?? null,
          ipAddress: params.request.ip ?? null,
        },
      });
    } catch (err) {
      logger.error({ err, params }, 'Failed to record admin audit log');
    }
  }

  /* ---------------------------------------------------------------- probe */

  /**
   * GET /api/_x/probe
   *
   * Discoverability check. The frontend hits this once after auth and
   * decides whether to render the "Админ" button. Non-admins get a 404
   * via the middleware.
   */
  app.get('/_x/probe', { preHandler: adminOnly }, async (_req, reply) => {
    return reply.send({ ok: true });
  });

  /* ---------------------------------------------------------------- stats */

  app.get('/_x/stats', { preHandler: adminOnly }, async (_request, reply) => {
    try {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const since24h = new Date(now - day);
      const since7d = new Date(now - 7 * day);
      const since14d = new Date(now - 14 * day);

      const [
        userCount,
        users24h,
        users7d,
        balances,
        betCount,
        wagerAgg,
        payoutAgg,
        perGameRaw,
        topPlayersRaw,
        timelineRaw,
        biggestWin,
      ] = await Promise.all([
        app.prisma.user.count(),
        app.prisma.user.count({ where: { createdAt: { gte: since24h } } }),
        app.prisma.user.count({ where: { createdAt: { gte: since7d } } }),
        app.prisma.balance.findMany({
          select: { amount: true, demoMode: true, currency: true },
        }),
        app.prisma.bet.count(),
        app.prisma.bet.aggregate({ _sum: { amount: true } }),
        app.prisma.bet.aggregate({ _sum: { payout: true } }),
        app.prisma.bet.groupBy({
          by: ['gameType'],
          _count: { _all: true },
          _sum: { amount: true, payout: true },
          _max: { multiplier: true },
        }),
        app.prisma.bet.groupBy({
          by: ['userId'],
          _sum: { amount: true, payout: true },
          _count: { _all: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 10,
        }),
        app.prisma.bet.findMany({
          where: { placedAt: { gte: since14d } },
          select: { placedAt: true, amount: true, payout: true },
        }),
        app.prisma.bet.findFirst({
          where: { payout: { not: null } },
          orderBy: { payout: 'desc' },
          select: {
            payout: true,
            multiplier: true,
            gameType: true,
            placedAt: true,
            user: {
              select: {
                firstName: true,
                username: true,
                telegramId: true,
              },
            },
          },
        }),
      ]);

      const totalLiability = balances
        .filter((b) => !b.demoMode)
        .reduce((acc, b) => acc + Number(b.amount), 0);
      const totalDemo = balances
        .filter((b) => b.demoMode)
        .reduce((acc, b) => acc + Number(b.amount), 0);

      const totalWagered = Number(wagerAgg._sum.amount ?? 0);
      const totalPaidOut = Number(payoutAgg._sum.payout ?? 0);
      const ggr = totalWagered - totalPaidOut;

      const perGame = perGameRaw.map((g) => ({
        gameType: g.gameType,
        count: g._count._all,
        wagered: Number(g._sum.amount ?? 0),
        paidOut: Number(g._sum.payout ?? 0),
        ggr: Number(g._sum.amount ?? 0) - Number(g._sum.payout ?? 0),
        maxMultiplier: Number(g._max.multiplier ?? 0),
      }));

      const topUserIds = topPlayersRaw.map((t) => t.userId);
      const topUsers =
        topUserIds.length > 0
          ? await app.prisma.user.findMany({
              where: { id: { in: topUserIds } },
              select: {
                id: true,
                firstName: true,
                username: true,
                telegramId: true,
                photoUrl: true,
              },
            })
          : [];
      const topUsersById = new Map(topUsers.map((u) => [u.id, u]));
      const topPlayers = topPlayersRaw.map((t) => {
        const u = topUsersById.get(t.userId);
        const wagered = Number(t._sum.amount ?? 0);
        const paid = Number(t._sum.payout ?? 0);
        return {
          userId: t.userId,
          name:
            u?.firstName ||
            u?.username ||
            (u?.telegramId
              ? `id${u.telegramId.toString().slice(-4)}`
              : 'Игрок'),
          photoUrl: u?.photoUrl ?? null,
          telegramId: u?.telegramId ? Number(u.telegramId) : null,
          bets: t._count._all,
          wagered,
          paidOut: paid,
          ggr: wagered - paid,
        };
      });

      const buckets = new Map<
        string,
        { wagered: number; paidOut: number; bets: number }
      >();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * day);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { wagered: 0, paidOut: 0, bets: 0 });
      }
      for (const b of timelineRaw) {
        const key = b.placedAt.toISOString().slice(0, 10);
        const slot = buckets.get(key);
        if (!slot) continue;
        slot.wagered += Number(b.amount);
        slot.paidOut += Number(b.payout ?? 0);
        slot.bets += 1;
      }
      const timeline = Array.from(buckets.entries()).map(([date, v]) => ({
        date,
        ...v,
        ggr: v.wagered - v.paidOut,
      }));

      return reply.send({
        ok: true,
        generatedAt: now,
        users: { total: userCount, new24h: users24h, new7d: users7d },
        balances: {
          totalLiability,
          totalDemo,
          accounts: balances.length,
          demoAccounts: balances.filter((b) => b.demoMode).length,
        },
        bets: {
          count: betCount,
          totalWagered,
          totalPaidOut,
          ggr,
          rtp: totalWagered > 0 ? totalPaidOut / totalWagered : 0,
        },
        perGame,
        topPlayers,
        timeline,
        biggestWin: biggestWin
          ? {
              payout: Number(biggestWin.payout ?? 0),
              multiplier: Number(biggestWin.multiplier ?? 0),
              gameType: biggestWin.gameType,
              placedAt: biggestWin.placedAt.getTime(),
              name:
                biggestWin.user.firstName ||
                biggestWin.user.username ||
                `id${biggestWin.user.telegramId.toString().slice(-4)}`,
            }
          : null,
      });
    } catch (error) {
      logger.error(error, 'Admin stats fetch failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /* ---------------------------------------------------------------- users */

  /**
   * GET /api/_x/users
   * Paged list of all users with their balance, totals, and flags.
   */
  app.get<{
    Querystring: { q?: string; page?: string; limit?: string; flag?: string };
  }>(
    '/_x/users',
    { preHandler: adminOnly },
    async (request, reply) => {
      const q = (request.query.q ?? '').trim();
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(10, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;

      // Build a Prisma `where` filter. Search supports name, username
      // and Telegram ID. Numeric input matches by TG id; text input
      // matches case-insensitive substring on first/last name + username.
      const where: Prisma.UserWhereInput = {};
      if (q) {
        const numeric = /^\d+$/.test(q) ? BigInt(q) : null;
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          ...(numeric ? [{ telegramId: numeric }] : []),
        ];
      }
      if (request.query.flag === 'blocked') where.isBlocked = true;
      if (request.query.flag === 'locked') where.withdrawalLocked = true;

      try {
        const [total, rows] = await Promise.all([
          app.prisma.user.count({ where }),
          app.prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
              isBlocked: true,
              withdrawalLocked: true,
              createdAt: true,
              balance: { select: { amount: true } },
              _count: { select: { bets: true } },
            },
          }),
        ]);

        // Pull aggregates separately — Prisma doesn't expose
        // sum(bet.amount) on relation count, so a small batch query.
        const userIds = rows.map((r) => r.id);
        const aggs = userIds.length
          ? await app.prisma.bet.groupBy({
              by: ['userId'],
              where: { userId: { in: userIds } },
              _sum: { amount: true, payout: true },
            })
          : [];
        const aggsById = new Map(aggs.map((a) => [a.userId, a]));

        const users = rows.map((u) => {
          const a = aggsById.get(u.id);
          const wagered = Number(a?._sum.amount ?? 0);
          const paid = Number(a?._sum.payout ?? 0);
          return {
            id: u.id,
            telegramId: Number(u.telegramId),
            name:
              u.firstName ||
              u.username ||
              `id${u.telegramId.toString().slice(-4)}`,
            username: u.username,
            firstName: u.firstName,
            lastName: u.lastName,
            photoUrl: u.photoUrl,
            isBlocked: u.isBlocked,
            withdrawalLocked: u.withdrawalLocked,
            createdAt: u.createdAt.getTime(),
            balance: Number(u.balance?.amount ?? 0),
            bets: u._count.bets,
            wagered,
            ggr: wagered - paid,
          };
        });

        return reply.send({ ok: true, total, page, limit, users });
      } catch (error) {
        logger.error(error, 'Admin users list failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * GET /api/_x/users/:id
   * Detailed view of a single user, including balance, recent bets,
   * recent transactions, and admin actions taken on this account.
   */
  app.get<{ Params: { id: string } }>(
    '/_x/users/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const user = await app.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
            languageCode: true,
            photoUrl: true,
            isPremium: true,
            isBlocked: true,
            withdrawalLocked: true,
            adminNote: true,
            createdAt: true,
            updatedAt: true,
            balance: {
              select: {
                amount: true,
                currency: true,
                lastSyncedAt: true,
              },
            },
          },
        });
        if (!user) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }

        const [betsAgg, bets, txs, adminLog] = await Promise.all([
          app.prisma.bet.aggregate({
            where: { userId: id },
            _count: { _all: true },
            _sum: { amount: true, payout: true },
            _max: { multiplier: true, amount: true },
          }),
          app.prisma.bet.findMany({
            where: { userId: id },
            orderBy: { placedAt: 'desc' },
            take: 30,
            select: {
              id: true,
              gameType: true,
              amount: true,
              payout: true,
              multiplier: true,
              state: true,
              placedAt: true,
              resolvedAt: true,
            },
          }),
          app.prisma.transaction.findMany({
            where: { userId: id },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: {
              id: true,
              type: true,
              amount: true,
              balanceBefore: true,
              balanceAfter: true,
              gameType: true,
              createdAt: true,
              metadata: true,
            },
          }),
          app.prisma.adminAuditLog.findMany({
            where: { targetType: 'user', targetId: id },
            orderBy: { createdAt: 'desc' },
            take: 30,
          }),
        ]);

        const wagered = Number(betsAgg._sum.amount ?? 0);
        const paidOut = Number(betsAgg._sum.payout ?? 0);

        return reply.send({
          ok: true,
          user: {
            id: user.id,
            telegramId: Number(user.telegramId),
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            languageCode: user.languageCode,
            photoUrl: user.photoUrl,
            isPremium: user.isPremium,
            isBlocked: user.isBlocked,
            withdrawalLocked: user.withdrawalLocked,
            adminNote: user.adminNote,
            createdAt: user.createdAt.getTime(),
            updatedAt: user.updatedAt.getTime(),
            balance: user.balance ? Number(user.balance.amount) : 0,
            currency: user.balance?.currency ?? 'PLN',
          },
          stats: {
            totalBets: betsAgg._count._all,
            wagered,
            paidOut,
            ggr: wagered - paidOut,
            maxMultiplier: Number(betsAgg._max.multiplier ?? 0),
            maxBet: Number(betsAgg._max.amount ?? 0),
          },
          bets: bets.map((b) => ({
            id: b.id,
            gameType: b.gameType,
            amount: Number(b.amount),
            payout: b.payout !== null ? Number(b.payout) : null,
            multiplier: b.multiplier !== null ? Number(b.multiplier) : null,
            state: b.state,
            placedAt: b.placedAt.getTime(),
            resolvedAt: b.resolvedAt?.getTime() ?? null,
          })),
          transactions: txs.map((t) => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            balanceBefore: Number(t.balanceBefore),
            balanceAfter: Number(t.balanceAfter),
            gameType: t.gameType,
            createdAt: t.createdAt.getTime(),
            metadata: t.metadata,
          })),
          adminLog: adminLog.map((a) => ({
            id: a.id,
            action: a.action,
            adminTelegramId: Number(a.adminTelegramId),
            payloadBefore: a.payloadBefore,
            payloadAfter: a.payloadAfter,
            reason: a.reason,
            createdAt: a.createdAt.getTime(),
          })),
        });
      } catch (error) {
        logger.error(error, 'Admin user fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * POST /api/_x/users/:id/balance
   *
   * Adjust a user's balance. The new balance is computed atomically
   * inside a transaction so concurrent bets cannot race the admin.
   * Body:
   *   - delta: +/- amount in PLN
   *   - reason: free-text required for audit
   */
  app.post<{
    Params: { id: string };
    Body: { delta: number; reason: string };
  }>(
    '/_x/users/:id/balance',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const delta = Number(request.body?.delta);
      const reason = (request.body?.reason ?? '').trim();
      if (!Number.isFinite(delta) || delta === 0) {
        return reply.code(400).send({ error: 'Bad amount' });
      }
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      // Cap arbitrary moves at PLN 1,000,000 per call to limit fat-finger risk.
      if (Math.abs(delta) > 1_000_000) {
        return reply.code(400).send({ error: 'Amount too large' });
      }

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const before = await tx.balance.findUnique({
            where: { userId: id },
            select: { amount: true },
          });
          const beforeAmount = Number(before?.amount ?? 0);

          // We allow negative balances only as a deliberate clawback —
          // i.e. the admin can "go below zero" if they explicitly debit
          // more than the user has. Prevent silent corruption otherwise.
          if (delta < 0 && beforeAmount + delta < 0) {
            // Allow but cap to zero unless reason explicitly says clawback.
            if (!/clawback|claw-back|откат/i.test(reason)) {
              throw new Error('Insufficient balance — add "clawback" to reason');
            }
          }

          const updated = await tx.balance.upsert({
            where: { userId: id },
            create: {
              userId: id,
              amount: delta,
              currency: 'PLN',
              demoMode: false,
            },
            update: {
              amount: { increment: delta },
              lastSyncedAt: new Date(),
              version: { increment: 1 },
            },
            select: { amount: true },
          });
          const afterAmount = Number(updated.amount);

          await tx.transaction.create({
            data: {
              userId: id,
              type: delta >= 0 ? 'admin_credit' : 'admin_debit',
              amount: delta,
              balanceBefore: beforeAmount,
              balanceAfter: afterAmount,
              metadata: {
                reason,
                adminTelegramId: (request as AuthenticatedRequest).user.telegramId,
              },
            },
          });

          return { beforeAmount, afterAmount };
        });

        await balanceService.invalidateCache(id);
        await balanceService.notifyBalance(id, result.afterAmount, false);

        await audit({
          request: request as AuthenticatedRequest,
          action: delta >= 0 ? 'balance.credit' : 'balance.debit',
          targetType: 'user',
          targetId: id,
          payloadBefore: { balance: result.beforeAmount },
          payloadAfter: { balance: result.afterAmount, delta },
          reason,
        });

        return reply.send({
          ok: true,
          before: result.beforeAmount,
          after: result.afterAmount,
        });
      } catch (error) {
        const msg = (error as Error).message;
        logger.warn({ err: error, userId: id, delta }, 'Balance adjust failed');
        return reply.code(400).send({ error: 'Bad Request', message: msg });
      }
    }
  );

  /**
   * POST /api/_x/users/:id/flags
   *
   * Toggle moderation flags. Body:
   *   - isBlocked?: boolean
   *   - withdrawalLocked?: boolean
   *   - adminNote?: string
   *   - reason: required string
   */
  app.post<{
    Params: { id: string };
    Body: {
      isBlocked?: boolean;
      withdrawalLocked?: boolean;
      adminNote?: string | null;
      reason: string;
    };
  }>(
    '/_x/users/:id/flags',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const data: Prisma.UserUpdateInput = {};
      if (typeof request.body.isBlocked === 'boolean') {
        data.isBlocked = request.body.isBlocked;
      }
      if (typeof request.body.withdrawalLocked === 'boolean') {
        data.withdrawalLocked = request.body.withdrawalLocked;
      }
      if (request.body.adminNote !== undefined) {
        data.adminNote = request.body.adminNote;
      }
      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: 'Nothing to update' });
      }

      try {
        const before = await app.prisma.user.findUnique({
          where: { id },
          select: {
            isBlocked: true,
            withdrawalLocked: true,
            adminNote: true,
          },
        });
        if (!before) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }

        const after = await app.prisma.user.update({
          where: { id },
          data,
          select: {
            isBlocked: true,
            withdrawalLocked: true,
            adminNote: true,
          },
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'user.flags',
          targetType: 'user',
          targetId: id,
          payloadBefore: before,
          payloadAfter: after,
          reason,
        });

        return reply.send({ ok: true, user: after });
      } catch (error) {
        logger.error(error, 'Admin flag update failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ----------------------------------------------------------- audit log */

  /**
   * GET /api/_x/audit
   * Paged audit-log viewer. Supports filtering by admin, target, action.
   */
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      adminUserId?: string;
      targetId?: string;
      action?: string;
    };
  }>(
    '/_x/audit',
    { preHandler: adminOnly },
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(200, Math.max(10, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;

      const where: Prisma.AdminAuditLogWhereInput = {};
      if (request.query.adminUserId) where.adminUserId = request.query.adminUserId;
      if (request.query.targetId) where.targetId = request.query.targetId;
      if (request.query.action) where.action = request.query.action;

      try {
        const [total, rows] = await Promise.all([
          app.prisma.adminAuditLog.count({ where }),
          app.prisma.adminAuditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        return reply.send({
          ok: true,
          total,
          page,
          limit,
          entries: rows.map((r) => ({
            id: r.id,
            adminUserId: r.adminUserId,
            adminTelegramId: Number(r.adminTelegramId),
            action: r.action,
            targetType: r.targetType,
            targetId: r.targetId,
            payloadBefore: r.payloadBefore,
            payloadAfter: r.payloadAfter,
            reason: r.reason,
            ipAddress: r.ipAddress,
            createdAt: r.createdAt.getTime(),
          })),
        });
      } catch (error) {
        logger.error(error, 'Admin audit fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ------------------------------------------------------------ withdrawals */

  /**
   * GET /api/_x/withdrawals
   *
   * Lists transactions of type `withdrawal` / `withdraw_request`. The
   * mini-app doesn't yet have a withdrawal flow — this endpoint is
   * already wired so the UI can render an empty list, and so the bot
   * (which records withdrawals as transactions) can be reviewed here.
   */
  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/_x/withdrawals',
    { preHandler: adminOnly },
    async (request, reply) => {
      const limit = Math.min(
        200,
        Math.max(10, parseInt(request.query.limit ?? '50', 10))
      );
      try {
        const txs = await app.prisma.transaction.findMany({
          where: {
            type: { in: ['withdrawal', 'withdraw_request', 'withdraw'] },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            userId: true,
            amount: true,
            balanceBefore: true,
            balanceAfter: true,
            createdAt: true,
            metadata: true,
          },
        });

        const userIds = txs.map((t) => t.userId);
        const users = userIds.length
          ? await app.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: {
                id: true,
                firstName: true,
                username: true,
                telegramId: true,
                photoUrl: true,
              },
            })
          : [];
        const usersById = new Map(users.map((u) => [u.id, u]));

        const list = txs.map((t) => {
          const u = usersById.get(t.userId);
          return {
            id: t.id,
            userId: t.userId,
            name:
              u?.firstName ||
              u?.username ||
              (u?.telegramId
                ? `id${u.telegramId.toString().slice(-4)}`
                : 'Игрок'),
            telegramId: u?.telegramId ? Number(u.telegramId) : null,
            photoUrl: u?.photoUrl ?? null,
            amount: Math.abs(Number(t.amount)),
            balanceBefore: Number(t.balanceBefore),
            balanceAfter: Number(t.balanceAfter),
            createdAt: t.createdAt.getTime(),
            metadata: t.metadata,
          };
        });

        return reply.send({ ok: true, withdrawals: list });
      } catch (error) {
        logger.error(error, 'Admin withdrawals fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  void isAdminTelegramId;
}
