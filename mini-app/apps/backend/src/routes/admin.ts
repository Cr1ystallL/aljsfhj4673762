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
import { walletConfig } from '../services/wallet-config.js';
import { systemMonitor } from '../services/system-monitor.js';
import { restartCrashEngine } from '../game-engine/crash-room-singleton.js';
import { redisClient } from '../lib/redis.js';
import { sessionManager } from '../lib/session-manager.js';

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

  /* ============================================================== Phase 3 */
  /* --------------------------------------------------------------- alerts */

  /**
   * GET /api/_x/alerts
   *
   * Heuristic anti-fraud alerts. We don't store these; we compute on
   * read by scanning recent activity. Patterns:
   *   - "first_deposit_then_withdraw": user with first transaction
   *     within 24h is already requesting withdrawal.
   *   - "huge_win": single payout > 50× the user's last deposit.
   *   - "multi_account_ip": several user_ids share recent activity
   *     from a similar IP (Phase 5 — stub for now).
   *   - "rapid_bets": more than 200 bets in the last hour for a single
   *     user.
   */
  app.get('/_x/alerts', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      // 1) Large single payouts in the last 7 days vs. their deposit.
      const largePayouts = await app.prisma.bet.findMany({
        where: {
          payout: { not: null, gte: 1000 },
          placedAt: { gte: new Date(now - 7 * day) },
        },
        orderBy: { payout: 'desc' },
        take: 20,
        select: {
          id: true,
          userId: true,
          payout: true,
          multiplier: true,
          gameType: true,
          placedAt: true,
        },
      });

      // 2) Rapid bets — bets in the last hour grouped by user.
      const rapidRows = await app.prisma.bet.groupBy({
        by: ['userId'],
        where: { placedAt: { gte: new Date(now - 60 * 60 * 1000) } },
        _count: { _all: true },
        having: { id: { _count: { gt: 200 } } },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      });

      // Hydrate user info in bulk.
      const userIds = Array.from(
        new Set([
          ...largePayouts.map((p) => p.userId),
          ...rapidRows.map((r) => r.userId),
        ])
      );
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

      const alerts: Array<{
        id: string;
        type: string;
        severity: 'info' | 'warn' | 'critical';
        userId: string;
        name: string;
        photoUrl: string | null;
        telegramId: number | null;
        message: string;
        at: number;
      }> = [];

      for (const p of largePayouts) {
        const u = usersById.get(p.userId);
        if (!u) continue;
        // Compare against the user's last deposit (if any).
        const lastDeposit = await app.prisma.transaction.findFirst({
          where: { userId: p.userId, type: 'deposit' },
          orderBy: { createdAt: 'desc' },
          select: { amount: true },
        });
        const dep = Number(lastDeposit?.amount ?? 0);
        const ratio = dep > 0 ? Number(p.payout) / dep : Number(p.payout) / 1;
        const severity: 'info' | 'warn' | 'critical' =
          ratio > 100 ? 'critical' : ratio > 30 ? 'warn' : 'info';
        if (ratio < 10) continue;
        alerts.push({
          id: `payout:${p.id}`,
          type: 'huge_win',
          severity,
          userId: p.userId,
          name:
            u.firstName ||
            u.username ||
            `id${u.telegramId.toString().slice(-4)}`,
          photoUrl: u.photoUrl ?? null,
          telegramId: Number(u.telegramId),
          message: `Выигрыш ${Number(p.payout).toLocaleString('ru-RU', {
            maximumFractionDigits: 0,
          })} zł в ${p.gameType} при последнем депозите ${dep.toLocaleString(
            'ru-RU'
          )} zł (×${ratio.toFixed(1)})`,
          at: p.placedAt.getTime(),
        });
      }

      for (const r of rapidRows) {
        const u = usersById.get(r.userId);
        if (!u) continue;
        alerts.push({
          id: `rapid:${r.userId}`,
          type: 'rapid_bets',
          severity: 'warn',
          userId: r.userId,
          name:
            u.firstName ||
            u.username ||
            `id${u.telegramId.toString().slice(-4)}`,
          photoUrl: u.photoUrl ?? null,
          telegramId: Number(u.telegramId),
          message: `${r._count._all} ставок за последний час`,
          at: now,
        });
      }

      // Sort newest first, severity-aware.
      alerts.sort((a, b) => {
        const order = { critical: 0, warn: 1, info: 2 };
        if (order[a.severity] !== order[b.severity]) {
          return order[a.severity] - order[b.severity];
        }
        return b.at - a.at;
      });

      return reply.send({ ok: true, alerts });
    } catch (error) {
      logger.error(error, 'Admin alerts fetch failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /* ------------------------------------------------------------ sessions */

  /**
   * GET /api/_x/sessions
   *
   * Lists all active sessions across the casino. Sessions live in
   * Redis under `session:<id>`. We SCAN the keyspace (cursor-based,
   * non-blocking) and parse each session JSON.
   */
  app.get('/_x/sessions', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const redis = redisClient.getClient();
      const sessions: Array<{
        sessionId: string;
        userId: string;
        telegramId: number;
        createdAt: number;
        lastActivity: number;
        expiresAt: number;
        ipAddress: string | null;
        userAgent: string | null;
      }> = [];

      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          'session:*',
          'COUNT',
          200
        );
        cursor = next;
        if (keys.length > 0) {
          const values = await redis.mget(...keys);
          for (const v of values) {
            if (!v) continue;
            try {
              const s = JSON.parse(v) as {
                sessionId: string;
                userId: string;
                telegramId: number;
                createdAt: number;
                lastActivity: number;
                expiresAt: number;
                ipAddress?: string;
                userAgent?: string;
              };
              sessions.push({
                sessionId: s.sessionId,
                userId: s.userId,
                telegramId: s.telegramId,
                createdAt: s.createdAt,
                lastActivity: s.lastActivity,
                expiresAt: s.expiresAt,
                ipAddress: s.ipAddress ?? null,
                userAgent: s.userAgent ?? null,
              });
            } catch {
              // skip malformed entries
            }
          }
        }
      } while (cursor !== '0');

      // Hydrate user names.
      const ids = Array.from(new Set(sessions.map((s) => s.userId)));
      const users = ids.length
        ? await app.prisma.user.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              firstName: true,
              username: true,
              telegramId: true,
              photoUrl: true,
            },
          })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));

      const enriched = sessions
        .map((s) => {
          const u = byId.get(s.userId);
          return {
            ...s,
            name:
              u?.firstName ||
              u?.username ||
              `id${u?.telegramId.toString().slice(-4) ?? ''}`,
            photoUrl: u?.photoUrl ?? null,
          };
        })
        .sort((a, b) => b.lastActivity - a.lastActivity);

      return reply.send({ ok: true, sessions: enriched });
    } catch (error) {
      logger.error(error, 'Admin sessions fetch failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /**
   * POST /api/_x/sessions/:id/revoke
   * Force-terminate a session. Body: `reason`.
   */
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/_x/sessions/:id/revoke',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      try {
        const session = await sessionManager.getSession(id);
        await sessionManager.deleteSession(id);

        await audit({
          request: request as AuthenticatedRequest,
          action: 'session.revoke',
          targetType: 'session',
          targetId: id,
          payloadBefore: session ?? null,
          payloadAfter: null,
          reason,
        });

        return reply.send({ ok: true });
      } catch (error) {
        logger.error(error, 'Session revoke failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ------------------------------------------------------------ admins */

  /**
   * GET /api/_x/admins
   *
   * Lists every Telegram ID currently admin'd, distinguishing seed
   * (env-defined) from runtime (dynamically promoted via UI).
   *
   * Runtime admins live in Redis set `admins:dynamic` (Telegram IDs
   * as strings). Seed admins are read from `ADMIN_TELEGRAM_IDS`.
   */
  app.get('/_x/admins', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const seedRaw = process.env.ADMIN_TELEGRAM_IDS ?? '';
      const seedIds = seedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const redis = redisClient.getClient();
      const dynamicIds = await redis.smembers('admins:dynamic');

      const allIds = Array.from(new Set([...seedIds, ...dynamicIds]));
      const users = allIds.length
        ? await app.prisma.user.findMany({
            where: {
              telegramId: { in: allIds.map((s) => BigInt(s)) },
            },
            select: {
              id: true,
              telegramId: true,
              firstName: true,
              username: true,
              photoUrl: true,
            },
          })
        : [];
      const byTg = new Map(
        users.map((u) => [u.telegramId.toString(), u])
      );

      const list = allIds.map((tg) => {
        const u = byTg.get(tg);
        return {
          telegramId: Number(tg),
          name:
            u?.firstName ||
            u?.username ||
            `id${tg.slice(-4)}`,
          username: u?.username ?? null,
          photoUrl: u?.photoUrl ?? null,
          source: seedIds.includes(tg) ? 'seed' : 'dynamic',
        };
      });

      return reply.send({ ok: true, admins: list });
    } catch (error) {
      logger.error(error, 'Admin admins list failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /**
   * POST /api/_x/admins
   * Body: { telegramId: number, reason: string }
   * Promotes a user to admin (runtime / dynamic). Seed admins must be
   * managed via the env file; trying to add a seed id is a no-op.
   */
  app.post<{
    Body: { telegramId: number | string; reason: string };
  }>(
    '/_x/admins',
    { preHandler: adminOnly },
    async (request, reply) => {
      const tgRaw = request.body?.telegramId;
      const reason = (request.body?.reason ?? '').trim();
      const tg =
        typeof tgRaw === 'number'
          ? String(tgRaw)
          : typeof tgRaw === 'string'
          ? tgRaw.trim()
          : '';

      if (!/^\d+$/.test(tg)) {
        return reply.code(400).send({ error: 'Bad telegramId' });
      }
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      try {
        const redis = redisClient.getClient();
        await redis.sadd('admins:dynamic', tg);

        await audit({
          request: request as AuthenticatedRequest,
          action: 'admin.add',
          targetType: 'admin',
          targetId: tg,
          payloadAfter: { telegramId: Number(tg) },
          reason,
        });
        return reply.send({ ok: true });
      } catch (error) {
        logger.error(error, 'Admin add failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /**
   * DELETE /api/_x/admins/:telegramId
   * Demote a runtime admin. Seed admins (env) cannot be removed via UI.
   */
  app.post<{
    Params: { telegramId: string };
    Body: { reason: string };
  }>(
    '/_x/admins/:telegramId/remove',
    { preHandler: adminOnly },
    async (request, reply) => {
      const tg = request.params.telegramId;
      const reason = (request.body?.reason ?? '').trim();
      if (!/^\d+$/.test(tg)) {
        return reply.code(400).send({ error: 'Bad telegramId' });
      }
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const seedRaw = process.env.ADMIN_TELEGRAM_IDS ?? '';
      const seedIds = seedRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (seedIds.includes(tg)) {
        return reply.code(400).send({
          error: 'Cannot demote seed admin via UI; edit .env instead',
        });
      }

      try {
        const redis = redisClient.getClient();
        await redis.srem('admins:dynamic', tg);
        await audit({
          request: request as AuthenticatedRequest,
          action: 'admin.remove',
          targetType: 'admin',
          targetId: tg,
          payloadBefore: { telegramId: Number(tg) },
          reason,
        });
        return reply.send({ ok: true });
      } catch (error) {
        logger.error(error, 'Admin remove failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* ============================================================== Phase 4 */
  /* ----------------------------------------------------- withdrawal flow */

  interface RawWithdrawalRow {
    id: string;
    user_id: string;
    amount: string;
    currency: string;
    method: string;
    destination: string;
    status: string;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    rejection_reason: string | null;
    metadata: unknown;
    created_at: Date;
    updated_at: Date;
  }

  /**
   * GET /api/_x/withdrawal-requests
   * Withdrawal lifecycle list. Status filter optional.
   */
  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/_x/withdrawal-requests',
    { preHandler: adminOnly },
    async (request, reply) => {
      const limit = Math.min(
        200,
        Math.max(10, parseInt(request.query.limit ?? '50', 10))
      );
      const status = request.query.status;
      try {
        const where = status
          ? Prisma.sql` WHERE status = ${status}`
          : Prisma.empty;
        const rows = await app.prisma.$queryRaw<RawWithdrawalRow[]>(Prisma.sql`
          SELECT * FROM withdrawal_requests${where}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);

        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
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

        const list = rows.map((r) => {
          const u = usersById.get(r.user_id);
          return {
            id: r.id,
            userId: r.user_id,
            name:
              u?.firstName ||
              u?.username ||
              (u?.telegramId
                ? `id${u.telegramId.toString().slice(-4)}`
                : 'Игрок'),
            telegramId: u?.telegramId ? Number(u.telegramId) : null,
            photoUrl: u?.photoUrl ?? null,
            amount: Number(r.amount),
            currency: r.currency,
            method: r.method,
            destination: r.destination,
            status: r.status,
            reviewedBy: r.reviewed_by,
            reviewedAt: r.reviewed_at?.getTime() ?? null,
            rejectionReason: r.rejection_reason,
            metadata: r.metadata,
            createdAt: r.created_at.getTime(),
            updatedAt: r.updated_at.getTime(),
          };
        });

        return reply.send({ ok: true, requests: list });
      } catch (error) {
        logger.error(error, 'Withdrawal requests list failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * POST /api/_x/withdrawal-requests/:id/approve
   * Approves the request, debits the user balance via bettingPipeline-style
   * atomic SQL, marks as paid. Body: { reason }.
   *
   * NOTE: doesn't actually call any payment provider — this is the
   * authoritative ledger move; the provider integration lands when
   * we wire FreeKassa / CryptoPay etc.
   */
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/_x/withdrawal-requests/:id/approve',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<RawWithdrawalRow[]>(Prisma.sql`
            SELECT * FROM withdrawal_requests
            WHERE id = ${id} FOR UPDATE
          `);
          const wd = rows[0];
          if (!wd) throw new Error('Not found');
          if (wd.status !== 'pending') {
            throw new Error('Already processed');
          }

          // Debit funds — withdrawal flow holds the balance separately
          // when the user opens the request, so by approve time the
          // money was already moved from the user's spendable balance.
          // For this lifecycle we mark as `paid` and credit a
          // "withdrawal" transaction record.
          const beforeRows = await tx.$queryRaw<Array<{ amount: string }>>`
            SELECT amount FROM balances WHERE user_id = ${wd.user_id} LIMIT 1
          `;
          const beforeAmount = Number(beforeRows[0]?.amount ?? 0);

          await tx.$executeRaw`
            UPDATE withdrawal_requests
            SET status = 'paid',
                reviewed_by = ${(request as AuthenticatedRequest).user.userId},
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${id}
          `;

          await tx.transaction.create({
            data: {
              userId: wd.user_id,
              type: 'withdrawal',
              amount: -Number(wd.amount),
              balanceBefore: beforeAmount,
              balanceAfter: beforeAmount,
              metadata: {
                requestId: wd.id,
                method: wd.method,
                destination: wd.destination,
                approvedBy: (request as AuthenticatedRequest).user.telegramId,
              },
            },
          });

          return wd;
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'withdrawal.approve',
          targetType: 'withdrawal',
          targetId: id,
          payloadAfter: { status: 'paid', amount: Number(result.amount) },
          reason,
        });

        return reply.send({ ok: true });
      } catch (error) {
        const msg = (error as Error).message;
        logger.warn({ err: error, id }, 'Withdrawal approve failed');
        return reply.code(400).send({ error: 'Bad Request', message: msg });
      }
    }
  );

  /**
   * POST /api/_x/withdrawal-requests/:id/reject
   * Rejects the request and refunds the held amount to the user.
   * Body: { reason }
   */
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/_x/withdrawal-requests/:id/reject',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<RawWithdrawalRow[]>(Prisma.sql`
            SELECT * FROM withdrawal_requests
            WHERE id = ${id} FOR UPDATE
          `);
          const wd = rows[0];
          if (!wd) throw new Error('Not found');
          if (wd.status !== 'pending') {
            throw new Error('Already processed');
          }

          const refundedRows = await tx.$queryRaw<
            Array<{ amount: string }>
          >`
            UPDATE balances
            SET amount = amount + ${Number(wd.amount)}::numeric,
                updated_at = NOW(),
                last_synced_at = NOW(),
                version = version + 1
            WHERE user_id = ${wd.user_id}
            RETURNING amount
          `;
          const afterAmount = Number(refundedRows[0]?.amount ?? 0);

          await tx.$executeRaw`
            UPDATE withdrawal_requests
            SET status = 'rejected',
                reviewed_by = ${(request as AuthenticatedRequest).user.userId},
                reviewed_at = NOW(),
                rejection_reason = ${reason},
                updated_at = NOW()
            WHERE id = ${id}
          `;

          await tx.transaction.create({
            data: {
              userId: wd.user_id,
              type: 'refund',
              amount: Number(wd.amount),
              balanceBefore: afterAmount - Number(wd.amount),
              balanceAfter: afterAmount,
              metadata: {
                requestId: wd.id,
                reason: 'withdrawal rejected',
                rejectedBy: (request as AuthenticatedRequest).user.telegramId,
              },
            },
          });

          return { wd, afterAmount };
        });

        await balanceService.invalidateCache(result.wd.user_id);
        await balanceService.notifyBalance(
          result.wd.user_id,
          result.afterAmount,
          false
        );

        await audit({
          request: request as AuthenticatedRequest,
          action: 'withdrawal.reject',
          targetType: 'withdrawal',
          targetId: id,
          payloadAfter: {
            status: 'rejected',
            refunded: Number(result.wd.amount),
          },
          reason,
        });

        return reply.send({ ok: true });
      } catch (error) {
        const msg = (error as Error).message;
        logger.warn({ err: error, id }, 'Withdrawal reject failed');
        return reply.code(400).send({ error: 'Bad Request', message: msg });
      }
    }
  );

  /* ----------------------------------------------------- wallet config */

  /**
   * GET /api/_x/wallet-config
   * Reads the current wallet config. By default secrets are masked
   * (`••••${last4}`). Add `?reveal=1` to get the raw values — the UI
   * shows a confirmation modal before sending that flag.
   */
  app.get<{ Querystring: { reveal?: string } }>(
    '/_x/wallet-config',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reveal = request.query.reveal === '1';
      const cfg = reveal
        ? await walletConfig.get()
        : await walletConfig.getMasked();
      return reply.send({ ok: true, config: cfg });
    }
  );

  /**
   * PATCH /api/_x/wallet-config
   * Body: partial config + reason. Empty-string secrets are treated as
   * "don't change" so admins can update non-secret fields without
   * re-pasting the keys.
   */
  app.patch<{
    Body: {
      reason: string;
      cryptoUsdtTrc20?: string;
      cryptoBtc?: string;
      cryptoEth?: string;
      piastrixApiKey?: string;
      freekassaApiKey?: string;
      fkWalletApiKey?: string;
      minDeposit?: number;
      maxDeposit?: number;
      minWithdrawal?: number;
      maxWithdrawal?: number;
      wagerMultiplier?: number;
      cryptoFee?: number;
      cardFee?: number;
    };
  }>(
    '/_x/wallet-config',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      const before = await walletConfig.get();
      const patch: Partial<typeof before> = {};
      const fields: Array<keyof typeof before> = [
        'cryptoUsdtTrc20',
        'cryptoBtc',
        'cryptoEth',
        'piastrixApiKey',
        'freekassaApiKey',
        'fkWalletApiKey',
        'minDeposit',
        'maxDeposit',
        'minWithdrawal',
        'maxWithdrawal',
        'wagerMultiplier',
        'cryptoFee',
        'cardFee',
      ];
      for (const f of fields) {
        const v = (request.body as Record<string, unknown>)[f as string];
        if (v === undefined) continue;
        // Don't overwrite secret fields with an empty string — admins
        // editing non-secret values shouldn't have to re-type the keys.
        if (
          (f === 'piastrixApiKey' ||
            f === 'freekassaApiKey' ||
            f === 'fkWalletApiKey') &&
          v === ''
        ) {
          continue;
        }
        // Don't accept the masked placeholder ("••••xxxx") as a real
        // value either — that's what the GET (masked) returned.
        if (typeof v === 'string' && v.startsWith('••••')) continue;
        (patch as Record<string, unknown>)[f as string] = v;
      }

      try {
        const after = await walletConfig.update(patch);

        // For audit: mask the secrets in both snapshots so the journal
        // never contains plaintext keys.
        const safe = (c: typeof before) => ({
          ...c,
          piastrixApiKey: c.piastrixApiKey ? '••••' : '',
          freekassaApiKey: c.freekassaApiKey ? '••••' : '',
          fkWalletApiKey: c.fkWalletApiKey ? '••••' : '',
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'wallet.config',
          targetType: 'wallet',
          targetId: 'global',
          payloadBefore: safe(before),
          payloadAfter: safe(after),
          reason,
        });

        return reply.send({ ok: true, config: await walletConfig.getMasked() });
      } catch (error) {
        logger.error(error, 'Wallet config update failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* -------------------------------------------------------- deposits list */

  /**
   * GET /api/_x/deposits
   * Mirrors withdrawals listing for transparency. Read-only —
   * provider integration writes deposits as transactions.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/_x/deposits',
    { preHandler: adminOnly },
    async (request, reply) => {
      const limit = Math.min(
        200,
        Math.max(10, parseInt(request.query.limit ?? '50', 10))
      );
      try {
        const txs = await app.prisma.transaction.findMany({
          where: { type: 'deposit' },
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
        const byId = new Map(users.map((u) => [u.id, u]));

        const list = txs.map((t) => {
          const u = byId.get(t.userId);
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

        return reply.send({ ok: true, deposits: list });
      } catch (error) {
        logger.error(error, 'Deposits list failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ============================================================== Phase 5 */
  /* ----------------------------------------------------------- broadcasts */

  interface AudienceFilter {
    all?: boolean;
    minBalance?: number;
    regAfter?: number; // ms epoch
    regBefore?: number;
    inactiveDays?: number;
    telegramIds?: number[];
  }

  interface BroadcastButton {
    text: string;
    url: string;
  }

  /**
   * Build the SQL `WHERE` clause for an audience filter. We never send
   * to blocked accounts; that's an unconditional exclusion regardless
   * of the filter the admin picked.
   */
  function audienceWhere(filter: AudienceFilter): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`is_blocked = false`];

    if (filter.minBalance !== undefined && filter.minBalance > 0) {
      conds.push(
        Prisma.sql`id IN (SELECT user_id FROM balances WHERE demo_mode = false AND amount >= ${filter.minBalance}::numeric)`
      );
    }
    if (filter.regAfter) {
      conds.push(Prisma.sql`created_at >= ${new Date(filter.regAfter)}`);
    }
    if (filter.regBefore) {
      conds.push(Prisma.sql`created_at <= ${new Date(filter.regBefore)}`);
    }
    if (filter.inactiveDays && filter.inactiveDays > 0) {
      const cutoff = new Date(
        Date.now() - filter.inactiveDays * 24 * 60 * 60 * 1000
      );
      conds.push(
        Prisma.sql`id NOT IN (SELECT user_id FROM bets WHERE placed_at >= ${cutoff})`
      );
    }
    if (filter.telegramIds && filter.telegramIds.length > 0) {
      const ids = filter.telegramIds.map((n) => BigInt(n));
      conds.push(Prisma.sql`telegram_id IN (${Prisma.join(ids)})`);
    }

    return Prisma.sql` WHERE ${Prisma.join(conds, ' AND ')}`;
  }

  /**
   * POST /api/_x/broadcasts/preview
   * Returns the count + a sample of 5 recipients for the supplied
   * audience filter. Lets admins sanity-check before scheduling.
   */
  app.post<{ Body: { audience: AudienceFilter } }>(
    '/_x/broadcasts/preview',
    { preHandler: adminOnly },
    async (request, reply) => {
      const audience = request.body?.audience ?? { all: true };
      try {
        const where = audienceWhere(audience);
        const countRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS c FROM users${where}`
        );
        const sample = await app.prisma.$queryRaw<
          Array<{
            telegram_id: bigint;
            first_name: string | null;
            username: string | null;
          }>
        >(
          Prisma.sql`
            SELECT telegram_id, first_name, username
            FROM users${where}
            ORDER BY created_at DESC
            LIMIT 5
          `
        );
        return reply.send({
          ok: true,
          total: Number(countRows[0]?.c ?? 0),
          sample: sample.map((s) => ({
            telegramId: Number(s.telegram_id),
            name:
              s.first_name ||
              s.username ||
              `id${s.telegram_id.toString().slice(-4)}`,
          })),
        });
      } catch (error) {
        logger.error(error, 'Broadcast preview failed');
        return reply.code(400).send({ error: 'Bad audience' });
      }
    }
  );

  /**
   * GET /api/_x/broadcasts
   * Lists recent broadcasts (newest first).
   */
  app.get<{ Querystring: { limit?: string; status?: string } }>(
    '/_x/broadcasts',
    { preHandler: adminOnly },
    async (request, reply) => {
      const limit = Math.min(
        100,
        Math.max(10, parseInt(request.query.limit ?? '50', 10))
      );
      try {
        const where = request.query.status
          ? Prisma.sql` WHERE status = ${request.query.status}`
          : Prisma.empty;
        const rows = await app.prisma.$queryRaw<
          Array<{
            id: string;
            status: string;
            text: string;
            parse_mode: string;
            media_url: string | null;
            buttons: unknown;
            audience: unknown;
            scheduled_at: Date | null;
            total_targets: number;
            delivered: number;
            failed: number;
            created_by_tg: bigint;
            created_at: Date;
            started_at: Date | null;
            finished_at: Date | null;
            error_message: string | null;
          }>
        >(Prisma.sql`
          SELECT id, status, text, parse_mode, media_url, buttons, audience,
                 scheduled_at, total_targets, delivered, failed,
                 created_by_tg, created_at, started_at, finished_at, error_message
          FROM broadcasts${where}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);

        return reply.send({
          ok: true,
          broadcasts: rows.map((r) => ({
            id: r.id,
            status: r.status,
            text: r.text,
            parseMode: r.parse_mode,
            mediaUrl: r.media_url,
            buttons: r.buttons,
            audience: r.audience,
            scheduledAt: r.scheduled_at?.getTime() ?? null,
            totalTargets: r.total_targets,
            delivered: r.delivered,
            failed: r.failed,
            createdByTg: Number(r.created_by_tg),
            createdAt: r.created_at.getTime(),
            startedAt: r.started_at?.getTime() ?? null,
            finishedAt: r.finished_at?.getTime() ?? null,
            errorMessage: r.error_message,
          })),
        });
      } catch (error) {
        logger.error(error, 'Broadcasts list failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * POST /api/_x/broadcasts
   * Creates a broadcast. Body:
   *   { text, parseMode?, mediaUrl?, buttons?, audience, scheduledAt?, reason }
   *
   * If `scheduledAt` is omitted or in the past, the broadcast is
   * scheduled for "now" — the python worker polls every 10s and picks
   * up due jobs.
   */
  app.post<{
    Body: {
      text: string;
      parseMode?: 'HTML' | 'Markdown' | 'none';
      mediaUrl?: string | null;
      buttons?: BroadcastButton[];
      audience: AudienceFilter;
      scheduledAt?: number | null;
      reason: string;
    };
  }>(
    '/_x/broadcasts',
    { preHandler: adminOnly },
    async (request, reply) => {
      const body = request.body ?? ({} as typeof request.body);
      const reason = (body.reason ?? '').trim();
      const text = (body.text ?? '').trim();
      const audience = body.audience ?? {};

      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      if (!text || text.length < 1 || text.length > 4000) {
        return reply.code(400).send({ error: 'Text must be 1-4000 chars' });
      }
      if (
        body.parseMode &&
        !['HTML', 'Markdown', 'none'].includes(body.parseMode)
      ) {
        return reply.code(400).send({ error: 'Bad parseMode' });
      }
      if (body.buttons && body.buttons.length > 3) {
        return reply.code(400).send({ error: 'Max 3 buttons' });
      }
      const scheduledAt = body.scheduledAt
        ? new Date(body.scheduledAt)
        : new Date();

      try {
        // Compute total targets up-front so the UI shows the count.
        const where = audienceWhere(audience);
        const countRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>(
          Prisma.sql`SELECT COUNT(*)::bigint AS c FROM users${where}`
        );
        const totalTargets = Number(countRows[0]?.c ?? 0);

        const id =
          (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
          `bc_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        await app.prisma.$executeRaw`
          INSERT INTO broadcasts (
            id, status, text, parse_mode, media_url, buttons, audience,
            scheduled_at, total_targets, created_by, created_by_tg,
            created_at, updated_at
          ) VALUES (
            ${id},
            'scheduled',
            ${text},
            ${body.parseMode ?? 'HTML'},
            ${body.mediaUrl ?? null},
            ${body.buttons ? JSON.stringify(body.buttons) : null}::jsonb,
            ${JSON.stringify(audience)}::jsonb,
            ${scheduledAt},
            ${totalTargets},
            ${(request as AuthenticatedRequest).user.userId},
            ${BigInt((request as AuthenticatedRequest).user.telegramId)},
            NOW(), NOW()
          )
        `;

        await audit({
          request: request as AuthenticatedRequest,
          action: 'broadcast.create',
          targetType: 'broadcast',
          targetId: id,
          payloadAfter: {
            text: text.slice(0, 200),
            audience,
            scheduledAt: scheduledAt.getTime(),
            totalTargets,
          },
          reason,
        });

        return reply.send({ ok: true, id, totalTargets });
      } catch (error) {
        logger.error(error, 'Broadcast create failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /**
   * POST /api/_x/broadcasts/:id/cancel
   * Marks a not-yet-started broadcast as `cancelled`. If it's already
   * in `sending`, the worker will see the flag on the next message
   * and stop early.
   */
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/_x/broadcasts/:id/cancel',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      try {
        await app.prisma.$executeRaw`
          UPDATE broadcasts
          SET status = 'cancelled',
              updated_at = NOW(),
              finished_at = COALESCE(finished_at, NOW())
          WHERE id = ${id}
            AND status IN ('scheduled', 'sending')
        `;
        await audit({
          request: request as AuthenticatedRequest,
          action: 'broadcast.cancel',
          targetType: 'broadcast',
          targetId: id,
          reason,
        });
        return reply.send({ ok: true });
      } catch (error) {
        logger.error(error, 'Broadcast cancel failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /**
   * GET /api/_x/broadcasts/:id/recipients
   * Per-recipient delivery log for one broadcast. Limited to 200 rows
   * to keep the UI responsive; recent first.
   */
  app.get<{ Params: { id: string } }>(
    '/_x/broadcasts/:id/recipients',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const rows = await app.prisma.$queryRaw<
          Array<{
            telegram_id: bigint;
            status: string;
            error: string | null;
            attempted_at: Date;
          }>
        >(Prisma.sql`
          SELECT telegram_id, status, error, attempted_at
          FROM broadcast_recipients
          WHERE broadcast_id = ${id}
          ORDER BY attempted_at DESC
          LIMIT 200
        `);
        return reply.send({
          ok: true,
          recipients: rows.map((r) => ({
            telegramId: Number(r.telegram_id),
            status: r.status,
            error: r.error,
            attemptedAt: r.attempted_at.getTime(),
          })),
        });
      } catch (error) {
        logger.error(error, 'Broadcast recipients fetch failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ============================================================== Phase 6 */
  /* ----------------------------------------------------------- system */

  /**
   * GET /api/_x/system/status
   * Snapshot of service health + the backend's own process stats.
   */
  app.get('/_x/system/status', { preHandler: adminOnly }, async (_req, reply) => {
    const services = await systemMonitor.getServiceStatuses(app.prisma);
    const proc = systemMonitor.getProcessStats();
    return reply.send({ ok: true, services, process: proc });
  });

  /**
   * GET /api/_x/system/logs?service=backend|frontend|bot&lines=200
   * Tails the requested service's PM2 log. Service name is whitelisted
   * so an admin can't read arbitrary files.
   */
  app.get<{
    Querystring: { service?: string; lines?: string };
  }>(
    '/_x/system/logs',
    { preHandler: adminOnly },
    async (request, reply) => {
      const service = request.query.service ?? 'backend';
      if (!['backend', 'frontend', 'bot'].includes(service)) {
        return reply.code(400).send({ error: 'Bad service' });
      }
      const lines = parseInt(request.query.lines ?? '200', 10);
      const result = await systemMonitor.tailLogs(
        service as 'backend' | 'frontend' | 'bot',
        Number.isFinite(lines) ? lines : 200
      );
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * POST /api/_x/system/restart-crash
   * Spins down and back up the Crash engine in-place. Body: { reason }.
   */
  app.post<{ Body: { reason: string } }>(
    '/_x/system/restart-crash',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      try {
        restartCrashEngine();
        await audit({
          request: request as AuthenticatedRequest,
          action: 'system.crash_restart',
          targetType: 'system',
          targetId: 'crash_main',
          reason,
        });
        return reply.send({ ok: true });
      } catch (error) {
        logger.error(error, 'Crash restart failed');
        return reply.code(500).send({ error: 'Restart failed' });
      }
    }
  );

  /**
   * POST /api/_x/system/clear-cache
   * Drops `game_config:*` keys so the next bet re-reads from defaults.
   * Body: { reason }.
   */
  app.post<{ Body: { reason: string } }>(
    '/_x/system/clear-cache',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const removed = await systemMonitor.clearGameConfigCache();
      await audit({
        request: request as AuthenticatedRequest,
        action: 'system.clear_cache',
        targetType: 'system',
        targetId: 'redis_cache',
        payloadAfter: { removedKeys: removed },
        reason,
      });
      return reply.send({ ok: true, removedKeys: removed });
    }
  );

  void isAdminTelegramId;
}