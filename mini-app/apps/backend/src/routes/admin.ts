import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  adminOnly,
  isAdminTelegramId,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { balanceService } from '../services/balance-service.js';
import { gameConfig, type GameType } from '../services/game-config.js';

/**
 * Admin Routes — covert.
 *
 * Path prefix `/api/_x/` is intentionally obscure, every endpoint
 * 404s for non-admins, and the only authoritative check is the
 * Telegram ID in the verified JWT vs the `ADMIN_TELEGRAM_IDS` env var.
 *
 * Implementation note: many queries here use `prisma.$queryRaw` /
 * `$executeRaw` for fields that may not exist on the generated client
 * yet (Phase 1 added `users.is_blocked` / `users.withdrawal_locked` /
 * `admin_audit_log` via SQL migration). Once `prisma generate` has
 * caught up everywhere, these can be migrated to typed Prisma calls.
 */

interface RawUserRow {
  id: string;
  telegram_id: bigint;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  photo_url: string | null;
  is_premium: boolean;
  is_blocked: boolean;
  withdrawal_locked: boolean;
  admin_note: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawAuditRow {
  id: string;
  admin_user_id: string;
  admin_telegram_id: bigint;
  action: string;
  target_type: string;
  target_id: string | null;
  payload_before: unknown;
  payload_after: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: Date;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /* -------------------------------------------------------------- helpers */

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
      const id = (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await app.prisma.$executeRaw`
        INSERT INTO admin_audit_log (
          id, admin_user_id, admin_telegram_id, action,
          target_type, target_id, payload_before, payload_after,
          reason, ip_address, created_at
        ) VALUES (
          ${id},
          ${params.request.user.userId},
          ${BigInt(params.request.user.telegramId)},
          ${params.action},
          ${params.targetType},
          ${params.targetId ?? null},
          ${params.payloadBefore !== undefined ? JSON.stringify(params.payloadBefore) : null}::jsonb,
          ${params.payloadAfter !== undefined ? JSON.stringify(params.payloadAfter) : null}::jsonb,
          ${params.reason ?? null},
          ${params.request.ip ?? null},
          NOW()
        )
      `;
    } catch (err) {
      logger.error({ err, params }, 'Failed to record admin audit log');
    }
  }

  /* ---------------------------------------------------------------- probe */

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
      const flag = request.query.flag;

      try {
        // Build conditional where clause via raw SQL fragments — keeps
        // the field reference (`is_blocked`) decoupled from whether the
        // generated Prisma client knows about it yet.
        const conds: Prisma.Sql[] = [];
        if (q) {
          if (/^\d+$/.test(q)) {
            conds.push(Prisma.sql`telegram_id = ${BigInt(q)}`);
          } else {
            const like = `%${q}%`;
            conds.push(
              Prisma.sql`(first_name ILIKE ${like} OR last_name ILIKE ${like} OR username ILIKE ${like})`
            );
          }
        }
        if (flag === 'blocked') conds.push(Prisma.sql`is_blocked = true`);
        if (flag === 'locked') conds.push(Prisma.sql`withdrawal_locked = true`);
        const where =
          conds.length > 0
            ? Prisma.sql` WHERE ${Prisma.join(conds, ' AND ')}`
            : Prisma.empty;

        const totalRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS c FROM users${where}`
        );
        const total = Number(totalRows[0]?.c ?? 0);

        const rows = await app.prisma.$queryRaw<RawUserRow[]>(
          Prisma.sql`
            SELECT id, telegram_id, username, first_name, last_name,
                   language_code, photo_url, is_premium,
                   is_blocked, withdrawal_locked, admin_note,
                   created_at, updated_at
            FROM users${where}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${skip}
          `
        );

        const userIds = rows.map((r) => r.id);
        const balances = userIds.length
          ? await app.prisma.balance.findMany({
              where: { userId: { in: userIds } },
              select: { userId: true, amount: true },
            })
          : [];
        const balById = new Map(
          balances.map((b) => [b.userId, Number(b.amount)])
        );

        const aggs = userIds.length
          ? await app.prisma.bet.groupBy({
              by: ['userId'],
              where: { userId: { in: userIds } },
              _sum: { amount: true, payout: true },
              _count: { _all: true },
            })
          : [];
        const aggsById = new Map(aggs.map((a) => [a.userId, a]));

        const users = rows.map((u) => {
          const a = aggsById.get(u.id);
          const wagered = Number(a?._sum.amount ?? 0);
          const paid = Number(a?._sum.payout ?? 0);
          return {
            id: u.id,
            telegramId: Number(u.telegram_id),
            name:
              u.first_name ||
              u.username ||
              `id${u.telegram_id.toString().slice(-4)}`,
            username: u.username,
            firstName: u.first_name,
            lastName: u.last_name,
            photoUrl: u.photo_url,
            isBlocked: u.is_blocked,
            withdrawalLocked: u.withdrawal_locked,
            createdAt: u.created_at.getTime(),
            balance: balById.get(u.id) ?? 0,
            bets: a?._count._all ?? 0,
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

  app.get<{ Params: { id: string } }>(
    '/_x/users/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const userRows = await app.prisma.$queryRaw<RawUserRow[]>(
          Prisma.sql`
            SELECT id, telegram_id, username, first_name, last_name,
                   language_code, photo_url, is_premium,
                   is_blocked, withdrawal_locked, admin_note,
                   created_at, updated_at
            FROM users WHERE id = ${id} LIMIT 1
          `
        );
        const u = userRows[0];
        if (!u) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }

        const [balance, betsAgg, bets, txs, adminLog] = await Promise.all([
          app.prisma.balance.findUnique({
            where: { userId: id },
            select: { amount: true, currency: true, lastSyncedAt: true },
          }),
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
          app.prisma.$queryRaw<RawAuditRow[]>(Prisma.sql`
            SELECT * FROM admin_audit_log
            WHERE target_type = 'user' AND target_id = ${id}
            ORDER BY created_at DESC
            LIMIT 30
          `),
        ]);

        const wagered = Number(betsAgg._sum.amount ?? 0);
        const paidOut = Number(betsAgg._sum.payout ?? 0);

        return reply.send({
          ok: true,
          user: {
            id: u.id,
            telegramId: Number(u.telegram_id),
            username: u.username,
            firstName: u.first_name,
            lastName: u.last_name,
            languageCode: u.language_code,
            photoUrl: u.photo_url,
            isPremium: u.is_premium,
            isBlocked: u.is_blocked,
            withdrawalLocked: u.withdrawal_locked,
            adminNote: u.admin_note,
            createdAt: u.created_at.getTime(),
            updatedAt: u.updated_at.getTime(),
            balance: balance ? Number(balance.amount) : 0,
            currency: balance?.currency ?? 'PLN',
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
            adminTelegramId: Number(a.admin_telegram_id),
            payloadBefore: a.payload_before,
            payloadAfter: a.payload_after,
            reason: a.reason,
            createdAt: a.created_at.getTime(),
          })),
        });
      } catch (error) {
        logger.error(error, 'Admin user fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ----------------------------------------------------- balance adjust */

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

          if (
            delta < 0 &&
            beforeAmount + delta < 0 &&
            !/clawback|claw-back|откат/i.test(reason)
          ) {
            throw new Error('Insufficient balance — add "clawback" to reason');
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

  /* ------------------------------------------------------------- flags */

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

      try {
        const beforeRows = await app.prisma.$queryRaw<
          Array<{
            is_blocked: boolean;
            withdrawal_locked: boolean;
            admin_note: string | null;
          }>
        >`
          SELECT is_blocked, withdrawal_locked, admin_note
          FROM users WHERE id = ${id} LIMIT 1
        `;
        const before = beforeRows[0];
        if (!before) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }

        const setFragments: Prisma.Sql[] = [];
        if (typeof request.body.isBlocked === 'boolean') {
          setFragments.push(
            Prisma.sql`is_blocked = ${request.body.isBlocked}`
          );
        }
        if (typeof request.body.withdrawalLocked === 'boolean') {
          setFragments.push(
            Prisma.sql`withdrawal_locked = ${request.body.withdrawalLocked}`
          );
        }
        if (request.body.adminNote !== undefined) {
          setFragments.push(
            Prisma.sql`admin_note = ${request.body.adminNote}`
          );
        }
        if (setFragments.length === 0) {
          return reply.code(400).send({ error: 'Nothing to update' });
        }

        await app.prisma.$executeRaw(Prisma.sql`
          UPDATE users
          SET ${Prisma.join(setFragments, ', ')}
          WHERE id = ${id}
        `);

        const afterRows = await app.prisma.$queryRaw<
          Array<{
            is_blocked: boolean;
            withdrawal_locked: boolean;
            admin_note: string | null;
          }>
        >`
          SELECT is_blocked, withdrawal_locked, admin_note
          FROM users WHERE id = ${id} LIMIT 1
        `;
        const after = afterRows[0];

        await audit({
          request: request as AuthenticatedRequest,
          action: 'user.flags',
          targetType: 'user',
          targetId: id,
          payloadBefore: before,
          payloadAfter: after,
          reason,
        });

        return reply.send({
          ok: true,
          user: {
            isBlocked: after.is_blocked,
            withdrawalLocked: after.withdrawal_locked,
            adminNote: after.admin_note,
          },
        });
      } catch (error) {
        logger.error(error, 'Admin flag update failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ----------------------------------------------------------- audit log */

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

      try {
        const conds: Prisma.Sql[] = [];
        if (request.query.adminUserId) {
          conds.push(Prisma.sql`admin_user_id = ${request.query.adminUserId}`);
        }
        if (request.query.targetId) {
          conds.push(Prisma.sql`target_id = ${request.query.targetId}`);
        }
        if (request.query.action) {
          conds.push(Prisma.sql`action = ${request.query.action}`);
        }
        const where =
          conds.length > 0
            ? Prisma.sql` WHERE ${Prisma.join(conds, ' AND ')}`
            : Prisma.empty;

        const totalRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS c FROM admin_audit_log${where}`
        );
        const total = Number(totalRows[0]?.c ?? 0);

        const rows = await app.prisma.$queryRaw<RawAuditRow[]>(Prisma.sql`
          SELECT * FROM admin_audit_log${where}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${skip}
        `);

        return reply.send({
          ok: true,
          total,
          page,
          limit,
          entries: rows.map((r) => ({
            id: r.id,
            adminUserId: r.admin_user_id,
            adminTelegramId: Number(r.admin_telegram_id),
            action: r.action,
            targetType: r.target_type,
            targetId: r.target_id,
            payloadBefore: r.payload_before,
            payloadAfter: r.payload_after,
            reason: r.reason,
            ipAddress: r.ip_address,
            createdAt: r.created_at.getTime(),
          })),
        });
      } catch (error) {
        logger.error(error, 'Admin audit fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ------------------------------------------------------------ withdrawals */

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

  /* ============================================================== Phase 2 */
  /* ------------------------------------------------------------ game configs */

  /**
   * GET /api/_x/games
   * Read all game configs in a single round-trip — keeps the admin UI
   * snappy.
   */
  app.get('/_x/games', { preHandler: adminOnly }, async (_req, reply) => {
    const types: GameType[] = ['crash', 'mines', 'plinko', 'coinflip'];
    const configs = await Promise.all(
      types.map(async (t) => ({ gameType: t, config: await gameConfig.get(t) }))
    );
    return reply.send({
      ok: true,
      games: configs,
      defaults: gameConfig.defaults(),
    });
  });

  /**
   * GET /api/_x/games/:type
   */
  app.get<{ Params: { type: string } }>(
    '/_x/games/:type',
    { preHandler: adminOnly },
    async (request, reply) => {
      const t = request.params.type as GameType;
      if (!['crash', 'mines', 'plinko', 'coinflip'].includes(t)) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
      const config = await gameConfig.get(t);
      return reply.send({ ok: true, gameType: t, config });
    }
  );

  /**
   * PATCH /api/_x/games/:type
   * Body — partial GameConfig. Required: `reason`.
   */
  app.patch<{
    Params: { type: string };
    Body: {
      paused?: boolean;
      minBet?: number;
      maxBet?: number;
      houseEdge?: number;
      extras?: Record<string, unknown>;
      reason: string;
    };
  }>(
    '/_x/games/:type',
    { preHandler: adminOnly },
    async (request, reply) => {
      const t = request.params.type as GameType;
      if (!['crash', 'mines', 'plinko', 'coinflip'].includes(t)) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      const before = await gameConfig.get(t);
      const patch: Partial<typeof before> = {};
      if (typeof request.body.paused === 'boolean') patch.paused = request.body.paused;
      if (typeof request.body.minBet === 'number') patch.minBet = request.body.minBet;
      if (typeof request.body.maxBet === 'number') patch.maxBet = request.body.maxBet;
      if (typeof request.body.houseEdge === 'number') {
        patch.houseEdge = request.body.houseEdge;
      }
      if (request.body.extras && typeof request.body.extras === 'object') {
        patch.extras = request.body.extras;
      }

      try {
        const after = await gameConfig.update(t, patch);
        await audit({
          request: request as AuthenticatedRequest,
          action: 'game.config',
          targetType: 'game',
          targetId: t,
          payloadBefore: before,
          payloadAfter: after,
          reason,
        });
        return reply.send({ ok: true, gameType: t, config: after });
      } catch (err) {
        logger.error({ err, gameType: t }, 'Game config update failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  void isAdminTelegramId;
}
