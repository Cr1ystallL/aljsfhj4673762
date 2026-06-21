import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  adminOnly,
  isAdminTelegramId,
  isAdminTelegramIdAsync,
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
import { rtpEngine } from '../services/rtp-engine.js';
import { config } from '../config/index.js';

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
        betCountRows,
        wagerAggRows,
        payoutAggRows,
        perGameRaw,
        topPlayersRaw,
        timelineRaw,
        biggestWinRaw,
      ] = await Promise.all([
        app.prisma.user.count(),
        app.prisma.user.count({ where: { createdAt: { gte: since24h } } }),
        app.prisma.user.count({ where: { createdAt: { gte: since7d } } }),
        app.prisma.balance.findMany({
          select: { amount: true, demoMode: true, currency: true },
        }),
        app.prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM bets WHERE metadata->>'tournamentId' IS NULL`,
        app.prisma.$queryRaw<{ sum: number }[]>`SELECT SUM(amount) as sum FROM bets WHERE metadata->>'tournamentId' IS NULL`,
        app.prisma.$queryRaw<{ sum: number }[]>`SELECT SUM(payout) as sum FROM bets WHERE metadata->>'tournamentId' IS NULL`,
        app.prisma.$queryRaw<{ game_type: string, count: bigint, sum_amount: number, sum_payout: number, max_multiplier: number }[]>`
          SELECT game_type, COUNT(*) as count, SUM(amount) as sum_amount, SUM(payout) as sum_payout, MAX(multiplier) as max_multiplier
          FROM bets
          WHERE metadata->>'tournamentId' IS NULL
          GROUP BY game_type
        `,
        app.prisma.$queryRaw<{ user_id: string, sum_amount: number, sum_payout: number, count: bigint }[]>`
          SELECT user_id, SUM(amount) as sum_amount, SUM(payout) as sum_payout, COUNT(*) as count
          FROM bets
          WHERE metadata->>'tournamentId' IS NULL
          GROUP BY user_id
          ORDER BY sum_amount DESC
          LIMIT 10
        `,
        app.prisma.$queryRaw<{ placed_at: Date, amount: number, payout: number }[]>`
          SELECT placed_at, amount, payout
          FROM bets
          WHERE placed_at >= ${since14d} AND metadata->>'tournamentId' IS NULL
        `,
        app.prisma.$queryRaw<any[]>`
          SELECT b.payout, b.multiplier, b.game_type, b.placed_at, u.first_name, u.username, u.telegram_id
          FROM bets b
          JOIN users u ON u.id = b.user_id
          WHERE b.payout IS NOT NULL AND b.metadata->>'tournamentId' IS NULL
          ORDER BY b.payout DESC
          LIMIT 1
        `,
      ]);

      const betCount = Number(betCountRows[0]?.count || 0);
      const wagerAgg = { _sum: { amount: wagerAggRows[0]?.sum || 0 } };
      const payoutAgg = { _sum: { payout: payoutAggRows[0]?.sum || 0 } };
      const biggestWin = biggestWinRaw[0] ? {
        payout: biggestWinRaw[0].payout,
        multiplier: biggestWinRaw[0].multiplier,
        gameType: biggestWinRaw[0].game_type,
        placedAt: biggestWinRaw[0].placed_at,
        user: {
          firstName: biggestWinRaw[0].first_name,
          username: biggestWinRaw[0].username,
          telegramId: biggestWinRaw[0].telegram_id,
        }
      } : null;

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
        gameType: g.game_type,
        count: Number(g.count || 0),
        wagered: Number(g.sum_amount ?? 0),
        paidOut: Number(g.sum_payout ?? 0),
        ggr: Number(g.sum_amount ?? 0) - Number(g.sum_payout ?? 0),
        maxMultiplier: Number(g.max_multiplier ?? 0),
      }));

      const topUserIds = topPlayersRaw.map((t) => t.user_id);
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
        const u = topUsersById.get(t.user_id);
        const wagered = Number(t.sum_amount ?? 0);
        const paid = Number(t.sum_payout ?? 0);
        return {
          userId: t.user_id,
          name:
            u?.firstName ||
            u?.username ||
            (u?.telegramId
              ? `id${u.telegramId.toString().slice(-4)}`
              : 'Игрок'),
          photoUrl: u?.photoUrl ?? null,
          telegramId: u?.telegramId ? Number(u.telegramId) : null,
          bets: Number(t.count || 0),
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
        const key = new Date(b.placed_at).toISOString().slice(0, 10);
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

  /**
   * POST /api/_x/bonuses/contests/:id/draft-winners
   * Body: { winners: [{ userId, place }], reason }
   * Sets the preview winners list (pre-draw). Duplicates and banned
   * users are filtered; list is clamped to winners_count.
   */
  app.post<{
    Params: { id: string };
    Body: { winners?: Array<{ userId?: string; place?: number }>; reason?: string };
  }>(
    '/_x/bonuses/contests/:id/draft-winners',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id } = request.params;
      const winnersBody = Array.isArray(request.body?.winners) ? request.body.winners : [];

      try {
        const draft = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ winners_count: number; visibility: string; rules: unknown; starts_at: Date }>
          >`SELECT winners_count, visibility, rules, starts_at FROM contests WHERE id = ${id} LIMIT 1 FOR UPDATE`;
          const c = rows[0];
          if (!c) throw new Error('Contest not found');

          let pool: string[] = [];
          if (c.visibility === 'global') {
            const eligible = await collectGlobalContestParticipants(app, id, c.rules, c.starts_at);
            pool = eligible.filter((e) => !e.banned).map((e) => e.user_id);
          } else {
            const eligible = await tx.$queryRaw<Array<{ user_id: string }>>`
              SELECT user_id FROM contest_participants
               WHERE contest_id = ${id} AND banned = FALSE`;
            pool = eligible.map((e) => e.user_id);
          }
          if (pool.length === 0) throw new Error('No eligible participants');

          const cleaned = winnersBody
            .map((w, i) => ({
              userId: typeof w?.userId === 'string' ? w.userId : '',
              place: Number.isFinite(w?.place) && (w?.place ?? 0) > 0 ? Number(w?.place) : i + 1,
            }))
            .filter((w) => w.userId && pool.includes(w.userId));

          const unique: string[] = [];
          for (const w of cleaned.sort((a, b) => a.place - b.place)) {
            if (unique.includes(w.userId)) continue;
            if (unique.length >= c.winners_count) break;
            unique.push(w.userId);
          }

          const normalized = unique.map((uid, idx) => ({ userId: uid, place: idx + 1 }));

          await tx.$executeRaw`
            UPDATE contests
               SET draft_winners = ${JSON.stringify(normalized)}::jsonb,
                   updated_at = NOW()
             WHERE id = ${id}`;
          return normalized;
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'contest.draft_winners.set',
          targetType: 'contest',
          targetId: id,
          payloadAfter: { draftWinners: draft },
          reason,
        });

        return reply.send({ ok: true, draftWinners: draft });
      } catch (err) {
        const msg = (err as Error).message ?? 'Bad Request';
        logger.error({ err }, 'Contest draft-winners set failed');
        return reply.code(400).send({ error: msg });
      }
    }
  );

  /**
   * DELETE /api/_x/bonuses/contests/:id/draft-winners/:userId
   * Removes a single user from the preview winners list.
   */
  app.delete<{
    Params: { id: string; userId: string };
    Body: { reason?: string };
  }>(
    '/_x/bonuses/contests/:id/draft-winners/:userId',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id, userId } = request.params;
      try {
        const updated = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ draft_winners: unknown }>>`
            SELECT draft_winners FROM contests WHERE id = ${id} LIMIT 1 FOR UPDATE`;
          const c = rows[0];
          if (!c) throw new Error('Contest not found');
          const current = Array.isArray(c.draft_winners)
            ? (c.draft_winners as Array<{ userId?: string; place?: number }> )
            : [];
          const filtered = current.filter((w) => (w as any).userId !== userId);
          const normalized = filtered.map((w, idx) => ({
            userId: String((w as any).userId),
            place: idx + 1,
          }));
          await tx.$executeRaw`
            UPDATE contests
               SET draft_winners = ${JSON.stringify(normalized)}::jsonb,
                   updated_at = NOW()
             WHERE id = ${id}`;
          return normalized;
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'contest.draft_winners.remove',
          targetType: 'contest',
          targetId: id,
          payloadAfter: { userId },
          reason,
        });

        return reply.send({ ok: true, draftWinners: updated });
      } catch (err) {
        const msg = (err as Error).message ?? 'Bad Request';
        logger.error({ err }, 'Contest draft-winner remove failed');
        return reply.code(400).send({ error: msg });
      }
    }
  );

  /**
   * DELETE /api/_x/bonuses/contests/:id/participants/:userId
   * Remove a participant entirely (admin kick).
   */
  app.delete<{
    Params: { id: string; userId: string };
    Body: { reason?: string };
  }>(
    '/_x/bonuses/contests/:id/participants/:userId',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id, userId } = request.params;
      try {
        await app.prisma.$executeRaw`
          DELETE FROM contest_participants
           WHERE contest_id = ${id} AND user_id = ${userId}`;
        await app.prisma.$executeRaw`
          UPDATE contests
             SET draft_winners = CASE
                                   WHEN draft_winners IS NULL THEN NULL
                                   ELSE (
                                     SELECT jsonb_agg(elem)
                                       FROM jsonb_array_elements(draft_winners) elem
                                      WHERE elem->>'userId' <> ${userId}
                                   )
                                 END,
                 updated_at = NOW()
           WHERE id = ${id}`;
        await audit({
          request: request as AuthenticatedRequest,
          action: 'contest.participant.remove',
          targetType: 'contest',
          targetId: id,
          payloadAfter: { userId },
          reason,
        });
        return reply.send({ ok: true });
      } catch (err) {
        logger.error(err, 'contest participant remove failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* ------------------------------------------------ user RTP (per-user auto-RTP) */

  app.get<{ Params: { id: string } }>(
    '/_x/users/:id/rtp',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const [config, status] = await Promise.all([
          rtpEngine.getUserConfig(id),
          rtpEngine.getUserStatus(id),
        ]);
        return reply.send({ ok: true, config, status });
      } catch (error) {
        logger.error(error, 'Admin user RTP get failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  app.patch<{
    Params: { id: string };
    Body: {
      mode?: 'off' | 'earn' | 'give';
      target?: number;
      windowMs?: number;
      intensity?: number;
      reset?: boolean;
      reason: string;
    };
  }>(
    '/_x/users/:id/rtp',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      const patch: Partial<import('../services/rtp-engine.js').RtpConfig> = {};
      if (request.body.mode) patch.mode = request.body.mode;
      if (typeof request.body.target === 'number') patch.target = request.body.target;
      if (typeof request.body.windowMs === 'number') patch.windowMs = request.body.windowMs;
      if (typeof request.body.intensity === 'number') patch.intensity = request.body.intensity;

      try {
        const before = await rtpEngine.getUserConfig(id);
        const next = await rtpEngine.setUserConfig(id, patch, { reset: !!request.body.reset });
        await audit({
          request: request as AuthenticatedRequest,
          action: 'rtp.user.config',
          targetType: 'user-rtp',
          targetId: id,
          payloadBefore: before,
          payloadAfter: next,
          reason,
        });
        const status = await rtpEngine.getUserStatus(id);
        return reply.send({ ok: true, config: next, status });
      } catch (error) {
        logger.error(error, 'Admin user RTP patch failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  app.get<{
    Params: { id: string };
    Querystring?: { betLimit?: string; txLimit?: string };
  }>(
    '/_x/users/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      const betLimit = Math.min(500, Math.max(10, parseInt(request.query?.betLimit ?? '100', 10)));
      const txLimit = Math.min(500, Math.max(10, parseInt(request.query?.txLimit ?? '100', 10)));
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

        const [balance, betsAgg, bets, txAgg, txs, sessions, adminLog] = await Promise.all([
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
            take: betLimit,
            select: {
              id: true,
              gameType: true,
              amount: true,
              payout: true,
              multiplier: true,
              state: true,
              placedAt: true,
              resolvedAt: true,
              metadata: true,
            },
          }),
          app.prisma.transaction.aggregate({
            where: { userId: id },
            _count: { _all: true },
          }),
          app.prisma.transaction.findMany({
            where: { userId: id },
            orderBy: { createdAt: 'desc' },
            take: txLimit,
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
          sessionManager.getUserSessions(id),
          app.prisma.$queryRaw<RawAuditRow[]>(Prisma.sql`
            SELECT * FROM admin_audit_log
            WHERE target_type = 'user' AND target_id = ${id}
            ORDER BY created_at DESC
            LIMIT 30
          `),
        ]);

        const wagered = Number(betsAgg._sum.amount ?? 0);
        const paidOut = Number(betsAgg._sum.payout ?? 0);
        const asMillis = (value: unknown): number => {
          if (typeof value === 'number') return value;
          if (!value) return 0;
          const d = new Date(value as string | number | Date);
          const t = d.getTime();
          return Number.isFinite(t) ? t : 0;
        };

        const lastSeenAt = sessions.reduce<number | null>((acc, s) => {
          const t = asMillis((s as any).lastActivity);
          return acc === null || t > acc ? t : acc;
        }, null);

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
          lastSeenAt,
          sessions: sessions.map((s) => ({
            sessionId: (s as any).id ?? (s as any).sessionId ?? '',
            createdAt: asMillis((s as any).createdAt),
            lastActivity: asMillis((s as any).lastActivity),
            expiresAt: asMillis((s as any).expiresAt),
            ipAddress: (s as any).ipAddress ?? null,
            userAgent: (s as any).userAgent ?? null,
          })),
          bets: bets.map((b) => ({
            id: b.id,
            gameType: b.gameType,
            amount: Number(b.amount),
            payout: b.payout !== null ? Number(b.payout) : null,
            multiplier: b.multiplier !== null ? Number(b.multiplier) : null,
            state: b.state,
            placedAt: b.placedAt.getTime(),
            resolvedAt: b.resolvedAt?.getTime() ?? null,
            source:
              b.metadata && typeof b.metadata === 'object'
                ? String((b.metadata as Record<string, unknown>).source ?? 'miniapp')
                : 'miniapp',
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
            source:
              (t.metadata as Record<string, unknown> | null | undefined)?.source
                ? String((t.metadata as Record<string, unknown>).source)
                : (t.metadata as Record<string, unknown> | null | undefined)?.provider
                  ? String((t.metadata as Record<string, unknown>).provider)
                  : null,
          })),
          totals: {
            bets: betsAgg._count._all,
            transactions: txAgg._count._all,
          },
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
              wagerTarget: delta > 0 ? delta * 2 : 0,
              autoRtpTarget: delta > 0 ? delta * 2 : 0,
            },
            update: {
              amount: { increment: delta },
              lastSyncedAt: new Date(),
              version: { increment: 1 },
              ...(delta > 0 ? {
                wagerTarget: { increment: delta * 2 },
                autoRtpTarget: { increment: delta * 2 },
              } : {}),
            },
            select: { amount: true, wagerTarget: true, wagerProgress: true, autoRtpTarget: true, autoRtpProgress: true },
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

          return { 
            beforeAmount, 
            afterAmount,
            wagerTarget: Number(updated.wagerTarget),
            wagerProgress: Number(updated.wagerProgress),
            autoRtpTarget: Number(updated.autoRtpTarget),
            autoRtpProgress: Number(updated.autoRtpProgress)
          };
        });

        await balanceService.invalidateCache(id);
        await balanceService.notifyBalance(id, result.afterAmount, result.wagerTarget, result.wagerProgress, result.autoRtpTarget, result.autoRtpProgress);

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
            telegram_id: bigint;
          }>
        >`
          SELECT is_blocked, withdrawal_locked, admin_note, telegram_id
          FROM users WHERE id = ${id} LIMIT 1
        `;
        const before = beforeRows[0];
        if (!before) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }

        if (await isAdminTelegramIdAsync(Number(before.telegram_id))) {
          if (request.body.isBlocked === true || request.body.withdrawalLocked === true) {
            return reply.code(403).send({ error: 'Cannot block or lock an admin account' });
          }
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
      q?: string;
    };
  }>(
    '/_x/audit',
    { preHandler: adminOnly },
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(200, Math.max(5, parseInt(request.query.limit ?? '10', 10)));
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
        // Free-text search across action, target_id, reason — case-
        // insensitive substring match. Convenient when an admin only
        // remembers a fragment of the row they need to inspect.
        const q = (request.query.q ?? '').trim();
        if (q) {
          const like = `%${q}%`;
          conds.push(
            Prisma.sql`(action ILIKE ${like} OR target_id ILIKE ${like} OR reason ILIKE ${like})`
          );
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
    const types: GameType[] = ['crash', 'mines', 'plinko', 'coinflip', 'wheel', 'bridges', 'blackjack'];
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
      if (!['crash', 'mines', 'plinko', 'coinflip', 'wheel', 'bridges', 'blackjack'].includes(t)) {
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
      hidden?: boolean;
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
      if (!['crash', 'mines', 'plinko', 'coinflip', 'wheel', 'bridges', 'blackjack'].includes(t)) {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }

      const before = await gameConfig.get(t);
      const patch: Partial<typeof before> = {};
      if (typeof request.body.paused === 'boolean') patch.paused = request.body.paused;
      if (typeof request.body.hidden === 'boolean') patch.hidden = request.body.hidden;
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
   * (env-defined) from runtime (dynamically promoted via UI). Each
   * runtime admin has a role:
   *   - `full`       → unrestricted access (default).
   *   - `withdrawal` → withdrawals-only operator (sees withdrawal
   *                    queue but no other admin sections).
   *
   * Storage layout in Redis:
   *   - `admins:dynamic`    set of Telegram IDs with full access.
   *   - `admins:withdrawal` set of Telegram IDs with withdrawal-only
   *                         access. Mutually exclusive with dynamic.
   */
  app.get('/_x/admins', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const seedRaw = process.env.ADMIN_TELEGRAM_IDS ?? '';
      const seedIds = seedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const redis = redisClient.getClient();
      const [dynamicIds, withdrawalIds] = await Promise.all([
        redis.smembers('admins:dynamic'),
        redis.smembers('admins:withdrawal'),
      ]);

      const allIds = Array.from(
        new Set([...seedIds, ...dynamicIds, ...withdrawalIds])
      );
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
      const byTg = new Map(users.map((u) => [u.telegramId.toString(), u]));

      const list = allIds.map((tg) => {
        const u = byTg.get(tg);
        const isSeed = seedIds.includes(tg);
        const isFull = isSeed || dynamicIds.includes(tg);
        const role: 'full' | 'withdrawal' = isFull ? 'full' : 'withdrawal';
        return {
          telegramId: Number(tg),
          name: u?.firstName || u?.username || `id${tg.slice(-4)}`,
          username: u?.username ?? null,
          photoUrl: u?.photoUrl ?? null,
          source: isSeed ? 'seed' : 'dynamic',
          role,
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
   * Body: { telegramId, reason, role? }
   * Promotes a user to admin. `role`:
   *   - `full` (default) → full admin powers.
   *   - `withdrawal`     → withdrawal-only operator.
   *
   * Promotion to a role removes any prior membership in the other set,
   * so the two roles stay mutually exclusive.
   */
  app.post<{
    Body: {
      telegramId: number | string;
      reason: string;
      role?: 'full' | 'withdrawal';
    };
  }>(
    '/_x/admins',
    { preHandler: adminOnly },
    async (request, reply) => {
      const tgRaw = request.body?.telegramId;
      const reason = (request.body?.reason ?? '').trim();
      const role: 'full' | 'withdrawal' =
        request.body?.role === 'withdrawal' ? 'withdrawal' : 'full';
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
        if (role === 'withdrawal') {
          await redis.srem('admins:dynamic', tg);
          await redis.sadd('admins:withdrawal', tg);
        } else {
          await redis.srem('admins:withdrawal', tg);
          await redis.sadd('admins:dynamic', tg);
        }

        await audit({
          request: request as AuthenticatedRequest,
          action: 'admin.add',
          targetType: 'admin',
          targetId: tg,
          payloadAfter: { telegramId: Number(tg), role },
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
   * POST /api/_x/admins/:telegramId/remove
   * Demote a runtime admin. Seed admins (env) cannot be removed via UI.
   * Removes membership from both runtime sets to be safe.
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
        await redis.srem('admins:withdrawal', tg);
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

        await balanceService.syncBalance(result.wd.user_id);

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
   * Body: partial config + reason. Only operational knobs are honoured;
   * legacy fields (crypto addresses, provider API keys, per-method fees)
   * are silently ignored for backwards compat with old admin UIs.
   */
  app.patch<{
    Body: {
      reason: string;
      minDeposit?: number;
      maxDeposit?: number;
      minWithdrawal?: number;
      maxWithdrawal?: number;
      wagerMultiplier?: number;
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
        'minDeposit',
        'maxDeposit',
        'minWithdrawal',
        'maxWithdrawal',
        'wagerMultiplier',
      ];
      for (const f of fields) {
        const v = (request.body as Record<string, unknown>)[f as string];
        if (v === undefined) continue;
        (patch as Record<string, unknown>)[f as string] = v;
      }

      try {
        const after = await walletConfig.update(patch);

        await audit({
          request: request as AuthenticatedRequest,
          action: 'wallet.config',
          targetType: 'wallet',
          targetId: 'global',
          payloadBefore: before,
          payloadAfter: after,
          reason,
        });

        return reply.send({ ok: true, config: await walletConfig.getMasked() });
      } catch (error) {
        logger.error(error, 'Wallet config update failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* -------------------------------------------------------- RTP engine */

  /**
   * GET /api/_x/rtp
   * Read auto-RTP controller status. Used by the admin UI to show the
   * current window, target, signal and operating mode.
   */
  app.get('/_x/rtp', { preHandler: adminOnly }, async (_request, reply) => {
    try {
      const status = await rtpEngine.getStatus();
      return reply.send({ ok: true, status });
    } catch (error) {
      logger.error(error, 'rtp.getStatus failed');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * PATCH /api/_x/rtp
   * Update the auto-RTP controller config. Body:
   *   - mode: 'off' | 'earn' | 'give'
   *   - target: PLN target for the window (positive number — the engine
   *             interprets sign by mode)
   *   - windowMs: window duration in milliseconds
   *   - intensity: 0..1 — strength of the bias (0 = controller does
   *                nothing even when on, 1 = fully aggressive)
   *   - earnBiasBoost: optional >0 multiplier to make earn tilt stronger
   *   - reset: if true, wipe the current window and start fresh.
   *   - reason: required (>=3 chars) for audit trail.
   */
  app.patch<{
    Body: {
      reason: string;
      mode?: 'off' | 'earn' | 'give';
      target?: number;
      windowMs?: number;
      intensity?: number;
      earnBiasBoost?: number;
      reset?: boolean;
    };
  }>(
    '/_x/rtp',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      try {
        const before = await rtpEngine.getConfig();
        const next = await rtpEngine.setConfig(
          {
            mode: request.body.mode,
            target: request.body.target,
            windowMs: request.body.windowMs,
            intensity: request.body.intensity,
            earnBiasBoost: request.body.earnBiasBoost,
          },
          { reset: !!request.body.reset }
        );
        await audit({
          request: request as AuthenticatedRequest,
          action: 'rtp.config',
          targetType: 'rtp',
          targetId: 'global',
          payloadBefore: before,
          payloadAfter: next,
          reason,
        });
        const status = await rtpEngine.getStatus();
        return reply.send({ ok: true, status });
      } catch (error) {
        logger.error(error, 'rtp.setConfig failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* -------------------------------------------------------- deposits list */

  /**
   * GET /api/_x/deposits
   * MacvPay-aware deposit list. Returns the live order status (pending,
   * paid, cancelled, expired) for each request so the admin UI can show
   * the lifecycle, not just confirmed deposits. Falls back to the
   * `transaction.type='deposit'` rows for legacy deposits that pre-date
   * the provider integration.
   */
  app.get<{ Querystring: { limit?: string; status?: string } }>(
    '/_x/deposits',
    { preHandler: adminOnly },
    async (request, reply) => {
      const limit = Math.min(
        200,
        Math.max(10, parseInt(request.query.limit ?? '50', 10))
      );
      const statusFilter = request.query.status;
      const normalizedStatus =
        statusFilter && statusFilter !== 'all' ? statusFilter : undefined;
      try {
        // ---- MacvPay orders ---------------------------------------------
        // Raw query — table is created via the macvpay migration and may
        // not exist in the Prisma client schema yet on every deployment.
        interface MacvpayOrderRow {
          id: string;
          user_id: string;
          external_id: string;
          requested_amount: string;
          unique_amount: string | null;
          currency: string;
          payment_type: string;
          status: string;
          card: string | null;
          recipient: string | null;
          details: string | null;
          expires_at: Date | null;
          paid_at: Date | null;
          created_at: Date;
        }

        const where = normalizedStatus
          ? Prisma.sql` WHERE status = ${normalizedStatus}`
          : Prisma.empty;
        let orders: MacvpayOrderRow[] = [];
        try {
          orders = await app.prisma.$queryRaw<MacvpayOrderRow[]>(Prisma.sql`
            SELECT id, user_id, external_id, requested_amount, unique_amount,
                   currency, payment_type, status, card, recipient, details,
                   expires_at, paid_at, created_at
              FROM macvpay_orders${where}
             ORDER BY created_at DESC
             LIMIT ${limit}
          `);
        } catch (err) {
          // Table missing on older deployments — fall through with empty.
          logger.warn({ err }, 'macvpay_orders read failed; returning empty');
          orders = [];
        }

        interface CryptoBotTxRow {
          id: string;
          user_id: string;
          amount: string;
          metadata: Prisma.JsonValue;
          created_at: Date;
        }

        const allowFallback = !normalizedStatus || normalizedStatus === 'paid';
        let txRows: CryptoBotTxRow[] = [];
        if (allowFallback) {
          try {
            txRows = await app.prisma.$queryRaw<CryptoBotTxRow[]>(Prisma.sql`
              SELECT id::text AS id,
                     user_id::text AS user_id,
                     amount::text AS amount,
                     metadata,
                     created_at
                FROM transactions
               WHERE type = 'deposit'
                 AND metadata ? 'provider'
                 AND metadata->>'provider' = 'cryptobot'
               ORDER BY created_at DESC
               LIMIT ${limit}
            `);
          } catch (err) {
            logger.warn({ err }, 'cryptobot deposit fallback read failed');
            txRows = [];
          }
        }

        const userIdSet = new Set<string>();
        for (const o of orders) userIdSet.add(o.user_id);
        for (const t of txRows) userIdSet.add(t.user_id);

        const userIds = Array.from(userIdSet);
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

        const list = orders.map((o) => {
          const u = byId.get(o.user_id);
          const expiresAt = o.expires_at ? o.expires_at.getTime() : null;
          // Compute live status: an order is "expired" once we passed
          // expires_at while still in 'pending'.
          let status = o.status;
          if (status === 'pending' && expiresAt && expiresAt < Date.now()) {
            status = 'expired';
          }
          return {
            id: o.id,
            providerOrderId: o.id,
            externalId: o.external_id,
            userId: o.user_id,
            name:
              u?.firstName ||
              u?.username ||
              (u?.telegramId
                ? `id${u.telegramId.toString().slice(-4)}`
                : 'Игрок'),
            telegramId: u?.telegramId ? Number(u.telegramId) : null,
            photoUrl: u?.photoUrl ?? null,
            amount: Number(o.requested_amount ?? 0),
            uniqueAmount: o.unique_amount != null ? Number(o.unique_amount) : 0,
            currency: o.currency,
            type: o.payment_type,
            status,
            card: o.card,
            recipient: o.recipient,
            details: o.details,
            expiresAt,
            paidAt: o.paid_at ? o.paid_at.getTime() : null,
            createdAt: o.created_at.getTime(),
          };
        });

        const ordersById = new Map(list.map((o) => [o.id, o]));

        const cryptoBotList = txRows.map((t) => {
          const u = byId.get(t.user_id);
          const meta =
            t.metadata && typeof t.metadata === 'object' && t.metadata !== null
              ? (t.metadata as Record<string, unknown>)
              : null;
          const amountUsdt = Number(t.amount ?? 0);
          const invoiceId = meta?.invoiceId;
          const providerOrderIdRaw =
            typeof invoiceId === 'string' || typeof invoiceId === 'number'
              ? String(invoiceId)
              : t.id;
          const providerOrderId = providerOrderIdRaw.startsWith('cryptobot_')
            ? providerOrderIdRaw
            : `cryptobot_${providerOrderIdRaw}`;
          const currency =
            typeof meta?.currency === 'string' ? meta.currency : 'USDT';
          const amountPln = Number(meta?.amountLocal ?? 0);
          const fxRate = Number(meta?.fxRate ?? 0);
          const linked = ordersById.get(providerOrderId);

          return {
            id: t.id,
            providerOrderId,
            externalId: providerOrderId,
            userId: t.user_id,
            name:
              linked?.name ||
              u?.firstName ||
              u?.username ||
              (u?.telegramId
                ? `id${u.telegramId.toString().slice(-4)}`
                : 'Игрок'),
            telegramId: linked?.telegramId ?? (u?.telegramId ? Number(u.telegramId) : null),
            photoUrl: linked?.photoUrl ?? u?.photoUrl ?? null,
            amount: linked?.currency === 'PLN' && amountPln > 0 ? amountPln : amountUsdt,
            uniqueAmount: linked?.uniqueAmount ?? 0,
            currency: linked?.currency ?? currency,
            type: 'cryptobot',
            status: 'paid' as const,
            card: linked?.card ?? null,
            recipient: linked?.recipient ?? null,
            details: linked?.details ?? null,
            expiresAt: linked?.expiresAt ?? null,
            paidAt: linked?.paidAt ?? t.created_at.getTime(),
            createdAt: linked?.createdAt ?? t.created_at.getTime(),
            meta: {
              fxRate,
              amountUsdt,
              amountPln,
            },
          };
        });

        const combined = [...list, ...cryptoBotList]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);

        return reply.send({ ok: true, deposits: combined });
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
    channelId?: string;
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
      
      // If targeting a specific channel/group, verify access via Telegram API
      if (audience.channelId !== undefined) {
        try {
          const chatId = audience.channelId.trim();
          if (!chatId) {
            return reply.send({ ok: true, total: 0, sample: [] });
          }
          const tgRes = await fetch(
            `https://api.telegram.org/bot${config.telegramBotToken}/getChat?chat_id=${chatId}`
          );
          const data = await tgRes.json();
          if (!data.ok || !data.result) {
            return reply.code(400).send({ error: data.description || 'Bot cannot access this channel/group' });
          }
          return reply.send({
            ok: true,
            total: 1,
            sample: [{
              telegramId: data.result.id,
              name: data.result.title || data.result.username || String(data.result.id)
            }]
          });
        } catch (error) {
          logger.error(error, 'Channel preview failed');
          return reply.code(400).send({ error: 'Failed to verify channel' });
        }
      }

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
        let totalTargets = 0;
        if (audience.channelId) {
          totalTargets = 1;
        } else {
          const where = audienceWhere(audience);
          const countRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>(
            Prisma.sql`SELECT COUNT(*)::bigint AS c FROM users${where}`
          );
          totalTargets = Number(countRows[0]?.c ?? 0);
        }

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

  /* ============================================================== Phase 7 */
  /* ----------------------------------------------------------- bonuses */
  //
  // Bonuses admin surface — promo codes (CRUD + redemption stats),
  // contests (CRUD + draw winners + ban participant), Lucky Wheel
  // settings (read-only summary for now).
  //
  // All endpoints obey the same 404-on-failure posture as the rest
  // of `/_x/*` and require the audit reason on mutating calls.

  /* ----- promo codes --------------------------------------------------- */

  /**
   * GET /api/_x/bonuses/promos
   * List promo codes with redemption count and total amount paid out.
   */
  app.get('/_x/bonuses/promos', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const rows = await app.prisma.$queryRaw<
        Array<{
          id: string;
          code: string;
          amount: string;
          currency: string;
          max_redemptions: number | null;
          per_user_limit: number;
          expires_at: Date | null;
          active: boolean;
          note: string | null;
          rules: unknown;
          created_at: Date;
          redemptions: bigint;
          paid_out: string;
        }>
      >`
        SELECT p.id, p.code, p.amount::text, p.currency,
               p.max_redemptions, p.per_user_limit, p.expires_at,
               p.active, p.note, p.rules, p.created_at,
               COUNT(r.id)::bigint AS redemptions,
               COALESCE(SUM(r.amount), 0)::text AS paid_out
          FROM promo_codes p
          LEFT JOIN promo_redemptions r ON r.promo_code_id = p.id
         GROUP BY p.id
         ORDER BY p.created_at DESC
         LIMIT 200`;
      return reply.send({
        ok: true,
        promos: rows.map((r) => ({
          id: r.id,
          code: r.code,
          amount: Number(r.amount),
          currency: r.currency,
          maxRedemptions: r.max_redemptions,
          perUserLimit: r.per_user_limit,
          expiresAt: r.expires_at?.getTime() ?? null,
          active: r.active,
          note: r.note,
          rules: r.rules,
          createdAt: r.created_at.getTime(),
          redemptions: Number(r.redemptions),
          paidOut: Number(r.paid_out),
        })),
      });
    } catch (err) {
      logger.error(err, 'Admin promos list failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /**
   * POST /api/_x/bonuses/promos
   * Body: { code, amount, perUserLimit, maxRedemptions?, expiresAt?, note?, rules?, reason }
   */
  app.post<{
    Body: {
      code?: string;
      amount?: number;
      perUserLimit?: number;
      maxRedemptions?: number | null;
      expiresAt?: number | null;
      note?: string | null;
      rules?: unknown;
      reason?: string;
    };
  }>('/_x/bonuses/promos', { preHandler: adminOnly }, async (request, reply) => {
    const reason = (request.body?.reason ?? '').trim();
    if (!reason || reason.length < 3) {
      return reply.code(400).send({ error: 'Reason required' });
    }
    const code = (request.body?.code ?? '').trim().toUpperCase();
    const amount = Number(request.body?.amount);
    // perUserLimit < 1 → unlimited (stored as 0).
    const rawPerUser = Number(request.body?.perUserLimit ?? 1);
    const perUserLimit = !Number.isFinite(rawPerUser) || rawPerUser < 1 ? 0 : Math.floor(rawPerUser);
    // maxRedemptions: negative or null/undef → ∞ (NULL in DB).
    const rawMax = request.body?.maxRedemptions;
    const maxRedemptions =
      typeof rawMax === 'number' && rawMax > 0 ? Math.floor(rawMax) : null;
    const expiresAt =
      typeof request.body?.expiresAt === 'number' && request.body.expiresAt > 0
        ? new Date(request.body.expiresAt)
        : null;
    const note = (request.body?.note ?? null) || null;
    const rules = Array.isArray(request.body?.rules) ? request.body.rules : [];

    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
      return reply.code(400).send({ error: 'Invalid code format' });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return reply.code(400).send({ error: 'Invalid amount' });
    }
    try {
      const id = (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await app.prisma.$executeRaw`
        INSERT INTO promo_codes (id, code, amount, currency, max_redemptions,
                                  per_user_limit, expires_at, created_by_user_id,
                                  active, note, rules, created_at, updated_at)
        VALUES (${id}, ${code}, ${amount}::numeric, 'PLN', ${maxRedemptions},
                ${perUserLimit}, ${expiresAt}, ${(request as AuthenticatedRequest).user.userId},
                TRUE, ${note}, ${JSON.stringify(rules)}::jsonb, NOW(), NOW())`;

      await audit({
        request: request as AuthenticatedRequest,
        action: 'promo.create',
        targetType: 'promo',
        targetId: id,
        payloadAfter: { code, amount, perUserLimit, maxRedemptions, expiresAt, note, rules },
        reason,
      });
      return reply.send({ ok: true, id });
    } catch (err) {
      const msg = (err as { code?: string }).code === '23505' ? 'Code already exists' : 'Bad Request';
      logger.warn({ err }, 'Promo create failed');
      return reply.code(400).send({ error: msg });
    }
  });

  /**
   * DELETE /api/_x/bonuses/promos/:id
   * Body: { reason }
   *
   * Hard-deletes the promo code and its redemptions cascade. Used from
   * the admin context menu when a promo was created by mistake. Active
   * promos can be deleted too — admins know what they're doing.
   */
  app.delete<{ Params: { id: string }; Body: { reason?: string } }>(
    '/_x/bonuses/promos/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id } = request.params;
      try {
        await app.prisma.$executeRaw`DELETE FROM promo_codes WHERE id = ${id}`;
        await audit({
          request: request as AuthenticatedRequest,
          action: 'promo.delete',
          targetType: 'promo',
          targetId: id,
          reason,
        });
        return reply.send({ ok: true });
      } catch (err) {
        logger.error(err, 'Promo delete failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * PATCH /api/_x/bonuses/promos/:id
   * Body: { active?, perUserLimit?, maxRedemptions?, expiresAt?, note?, reason }
   */
  app.patch<{
    Params: { id: string };
    Body: {
      active?: boolean;
      perUserLimit?: number;
      maxRedemptions?: number | null;
      expiresAt?: number | null;
      note?: string | null;
      rules?: unknown;
      reason?: string;
    };
  }>('/_x/bonuses/promos/:id', { preHandler: adminOnly }, async (request, reply) => {
    const reason = (request.body?.reason ?? '').trim();
    if (!reason || reason.length < 3) {
      return reply.code(400).send({ error: 'Reason required' });
    }
    const { id } = request.params;
    const fragments: Prisma.Sql[] = [];
    if (typeof request.body.active === 'boolean') {
      fragments.push(Prisma.sql`active = ${request.body.active}`);
    }
    if (typeof request.body.perUserLimit === 'number') {
      const v = request.body.perUserLimit;
      const stored = !Number.isFinite(v) || v < 1 ? 0 : Math.floor(v);
      fragments.push(Prisma.sql`per_user_limit = ${stored}`);
    }
    if (request.body.maxRedemptions !== undefined) {
      fragments.push(
        Prisma.sql`max_redemptions = ${
          request.body.maxRedemptions === null || request.body.maxRedemptions < 1
            ? null
            : Math.floor(request.body.maxRedemptions)
        }`
      );
    }
    if (request.body.expiresAt !== undefined) {
      fragments.push(
        Prisma.sql`expires_at = ${
          request.body.expiresAt === null ? null : new Date(request.body.expiresAt)
        }`
      );
    }
    if (request.body.note !== undefined) {
      fragments.push(Prisma.sql`note = ${request.body.note ?? null}`);
    }
    if (request.body.rules !== undefined) {
      fragments.push(
        Prisma.sql`rules = ${JSON.stringify(
          Array.isArray(request.body.rules) ? request.body.rules : []
        )}::jsonb`
      );
    }
    if (fragments.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }
    fragments.push(Prisma.sql`updated_at = NOW()`);
    try {
      await app.prisma.$executeRaw(Prisma.sql`
        UPDATE promo_codes SET ${Prisma.join(fragments, ', ')} WHERE id = ${id}
      `);
      await audit({
        request: request as AuthenticatedRequest,
        action: 'promo.update',
        targetType: 'promo',
        targetId: id,
        payloadAfter: request.body,
        reason,
      });
      return reply.send({ ok: true });
    } catch (err) {
      logger.error(err, 'Promo update failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /**
   * GET /api/_x/bonuses/promos/:id
   * Detail card — includes recent redemptions + per-user breakdown.
   */
  app.get<{ Params: { id: string } }>(
    '/_x/bonuses/promos/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const promoRows = await app.prisma.$queryRaw<
          Array<{
            id: string;
            code: string;
            amount: string;
            currency: string;
            max_redemptions: number | null;
            per_user_limit: number;
            expires_at: Date | null;
            active: boolean;
            note: string | null;
            created_at: Date;
          }>
        >`SELECT id, code, amount::text, currency, max_redemptions,
                  per_user_limit, expires_at, active, note, created_at
            FROM promo_codes WHERE id = ${id} LIMIT 1`;
        const promo = promoRows[0];
        if (!promo) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }
        const redemptions = await app.prisma.$queryRaw<
          Array<{
            id: string;
            user_id: string;
            amount: string;
            created_at: Date;
            first_name: string | null;
            username: string | null;
          }>
        >`SELECT r.id, r.user_id, r.amount::text, r.created_at,
                  u.first_name, u.username
            FROM promo_redemptions r
            LEFT JOIN users u ON u.id = r.user_id
           WHERE r.promo_code_id = ${id}
           ORDER BY r.created_at DESC
           LIMIT 100`;
        return reply.send({
          ok: true,
          promo: {
            id: promo.id,
            code: promo.code,
            amount: Number(promo.amount),
            currency: promo.currency,
            maxRedemptions: promo.max_redemptions,
            perUserLimit: promo.per_user_limit,
            expiresAt: promo.expires_at?.getTime() ?? null,
            active: promo.active,
            note: promo.note,
            createdAt: promo.created_at.getTime(),
          },
          redemptions: redemptions.map((r) => ({
            id: r.id,
            userId: r.user_id,
            name: r.first_name || r.username || `id${r.user_id.slice(0, 4)}`,
            amount: Number(r.amount),
            createdAt: r.created_at.getTime(),
          })),
        });
      } catch (err) {
        logger.error(err, 'Promo detail failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /* ----- contests ------------------------------------------------------ */

  app.get('/_x/bonuses/contests', { preHandler: adminOnly }, async (_req, reply) => {
    try {
      const rows = await app.prisma.$queryRaw<
        Array<{
          id: string;
          title: string;
          visibility: string;
          prize_pool: string;
          winners_count: number;
          starts_at: Date;
          ends_at: Date;
          state: string;
          participants: bigint;
          created_at: Date;
        }>
      >`
        SELECT c.id, c.title, c.visibility, c.prize_pool::text,
               c.winners_count, c.starts_at, c.ends_at, c.state,
               (SELECT COUNT(*)::bigint FROM contest_participants p
                 WHERE p.contest_id = c.id) AS participants,
               c.created_at
          FROM contests c
         ORDER BY c.created_at DESC
         LIMIT 200`;
      return reply.send({
        ok: true,
        contests: rows.map((r) => ({
          id: r.id,
          title: r.title,
          visibility: r.visibility,
          prizePool: Number(r.prize_pool),
          winnersCount: r.winners_count,
          startsAt: r.starts_at.getTime(),
          endsAt: r.ends_at.getTime(),
          state: r.state,
          participants: Number(r.participants),
          createdAt: r.created_at.getTime(),
        })),
      });
    } catch (err) {
      logger.error(err, 'Admin contests list failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /**
   * POST /api/_x/bonuses/contests
   * Body: title, description?, visibility, prizePool, winnersCount,
   *        prizeShares (array | "equal"), rules (array), startsAt, endsAt, reason
   */
  app.post<{
    Body: {
      title?: string;
      description?: string | null;
      visibility?: 'public' | 'private' | 'global';
      bannerUrl?: string | null;
      prizePool?: number;
      winnersCount?: number;
      prizeShares?: unknown;
      rules?: unknown;
      startsAt?: number;
      endsAt?: number;
      winnerWager?: number;
      reason?: string;
    };
  }>('/_x/bonuses/contests', { preHandler: adminOnly }, async (request, reply) => {
    const reason = (request.body?.reason ?? '').trim();
    if (!reason || reason.length < 3) {
      return reply.code(400).send({ error: 'Reason required' });
    }
    const title = (request.body?.title ?? '').trim();
    const visibility =
      request.body?.visibility === 'private'
        ? 'private'
        : request.body?.visibility === 'global'
          ? 'global'
          : 'public';
    const bannerUrl =
      typeof request.body?.bannerUrl === 'string' && request.body.bannerUrl.trim()
        ? request.body.bannerUrl.trim()
        : null;
    const prizePool = Number(request.body?.prizePool);
    const winnersCount = Math.floor(Number(request.body?.winnersCount));
    const startsAt = request.body?.startsAt;
    const endsAt = request.body?.endsAt;
    const winnerWagerRaw = Number(request.body?.winnerWager);
    const winnerWager =
      Number.isFinite(winnerWagerRaw) && winnerWagerRaw > 0
        ? +winnerWagerRaw.toFixed(2)
        : 0;
    if (
      !title ||
      !Number.isFinite(prizePool) ||
      prizePool <= 0 ||
      !Number.isFinite(winnersCount) ||
      winnersCount < 1 ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt
    ) {
      return reply.code(400).send({ error: 'Invalid contest payload' });
    }

    let prizeShares = request.body?.prizeShares;
    if (prizeShares === 'equal' || !Array.isArray(prizeShares)) {
      const each = +(prizePool / winnersCount).toFixed(2);
      prizeShares = Array.from({ length: winnersCount }, (_, i) => ({
        place: i + 1,
        amount: each,
      }));
    }
    const rules = Array.isArray(request.body?.rules) ? request.body.rules : [];

    try {
      const id = (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await app.prisma.$executeRaw`
        INSERT INTO contests (id, title, description, visibility, banner_url, prize_pool,
                               winners_count, winner_wager, prize_shares, rules,
                               starts_at, ends_at, state,
                               created_by_user_id, created_at, updated_at)
        VALUES (${id}, ${title}, ${request.body?.description ?? null},
                ${visibility}, ${bannerUrl}, ${prizePool}::numeric, ${winnersCount}, ${winnerWager}::numeric,
                ${JSON.stringify(prizeShares)}::jsonb,
                ${JSON.stringify(rules)}::jsonb,
                ${new Date(startsAt)}, ${new Date(endsAt)},
                ${startsAt > Date.now() ? 'scheduled' : 'live'},
                ${(request as AuthenticatedRequest).user.userId},
                NOW(), NOW())`;

      await audit({
        request: request as AuthenticatedRequest,
        action: 'contest.create',
        targetType: 'contest',
        targetId: id,
        payloadAfter: { title, visibility, prizePool, winnersCount },
        reason,
      });
      return reply.send({ ok: true, id });
    } catch (err) {
      logger.error(err, 'Contest create failed');
      return reply.code(400).send({ error: 'Bad Request' });
    }
  });

  /**
   * GET /api/_x/bonuses/contests/:id
   * Card data — includes participant list, current preview of likely
   * winners (random pick from non-banned participants), and resolved
   * winners once drawn.
   */
  app.get<{ Params: { id: string } }>(
    '/_x/bonuses/contests/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const rows = await app.prisma.$queryRaw<
          Array<{
            id: string;
            title: string;
            description: string | null;
            visibility: string;
            prize_pool: string;
            winners_count: number;
            prize_shares: unknown;
            rules: unknown;
            starts_at: Date;
            ends_at: Date;
            state: string;
            resolved_winners: unknown;
            draft_winners: unknown;
            winner_wager: string | null;
            banner_url: string | null;
            created_at: Date;
          }>
        >`SELECT id, title, description, visibility, prize_pool::text,
                  winners_count, prize_shares, rules, starts_at, ends_at,
                  state, resolved_winners, draft_winners, winner_wager,
                  banner_url,
                  created_at
            FROM contests WHERE id = ${id} LIMIT 1`;
        const c = rows[0];
        if (!c) {
          return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
        }
        let participants: Array<{
          id: string;
          user_id: string;
          banned: boolean;
          joined_at: Date;
          first_name: string | null;
          username: string | null;
          photo_url: string | null;
        }>;

        if (c.visibility === 'global') {
          // Global contest — every user who passes the eligibility rules
          // is implicitly a participant. We compute the set on the fly
          // so the admin sees exactly who's qualified right now,
          // including those who only just met the threshold.
          // Bans are still respected via the contest_participants table:
          // an admin can disqualify an otherwise-eligible user with the
          // /participants/:userId/ban endpoint, which inserts a banned
          // row that we then exclude from this list.
          participants = await collectGlobalContestParticipants(
            app,
            id,
            c.rules,
            c.starts_at
          );
        } else {
          participants = await app.prisma.$queryRaw<
            typeof participants
          >`SELECT p.id, p.user_id, p.banned, p.joined_at,
                    u.first_name, u.username, u.photo_url
              FROM contest_participants p
              LEFT JOIN users u ON u.id = p.user_id
             WHERE p.contest_id = ${id}
             ORDER BY p.joined_at DESC`;
        }

        return reply.send({
          ok: true,
          contest: {
            id: c.id,
            title: c.title,
            description: c.description,
            visibility: c.visibility,
            prizePool: Number(c.prize_pool),
            winnersCount: c.winners_count,
            prizeShares: c.prize_shares,
            rules: c.rules,
            startsAt: c.starts_at.getTime(),
            endsAt: c.ends_at.getTime(),
            state: c.state,
            resolvedWinners: c.resolved_winners,
            draftWinners: c.draft_winners,
            winnerWager: c.winner_wager === null ? 0 : Number(c.winner_wager),
            bannerUrl: c.banner_url,
            createdAt: c.created_at.getTime(),
          },
          participants: participants.map((p) => ({
            id: p.id,
            userId: p.user_id,
            name: p.first_name || p.username || `id${p.user_id.slice(0, 4)}`,
            photoUrl: p.photo_url,
            banned: p.banned,
            joinedAt: p.joined_at.getTime(),
          })),
        });
      } catch (err) {
        logger.error(err, 'Contest detail failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * POST /api/_x/bonuses/contests/:id/participants/:userId/ban
   * Body: { banned, reason }
   */
  app.post<{
    Params: { id: string; userId: string };
    Body: { banned?: boolean; reason?: string };
  }>(
    '/_x/bonuses/contests/:id/participants/:userId/ban',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const banned = !!request.body?.banned;
      const { id, userId } = request.params;
      try {
        await app.prisma.$executeRaw`
          UPDATE contest_participants SET banned = ${banned}
           WHERE contest_id = ${id} AND user_id = ${userId}`;
        await audit({
          request: request as AuthenticatedRequest,
          action: banned ? 'contest.ban_user' : 'contest.unban_user',
          targetType: 'contest',
          targetId: id,
          payloadAfter: { userId },
          reason,
        });
        return reply.send({ ok: true });
      } catch (err) {
        logger.error(err, 'Contest ban failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * POST /api/_x/bonuses/contests/:id/draw
   * Resolves winners. Picks `winnersCount` random non-banned
   * participants, applies the prize-share distribution, credits each
   * winner's balance + writes a transaction, persists `resolved_winners`
   * and flips state to 'paid'. Idempotent: if state is already 'paid'
   * the call is a no-op.
   *
   * Body: { reason }
   */
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/_x/bonuses/contests/:id/draw',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id } = request.params;
      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              winners_count: number;
              prize_shares: unknown;
              state: string;
              visibility: string;
              rules: unknown;
              starts_at: Date;
              draft_winners: unknown;
              winner_wager: unknown;
            }>
          >`SELECT id, winners_count, prize_shares, state, visibility,
                    rules, starts_at, draft_winners, winner_wager
              FROM contests WHERE id = ${id} LIMIT 1 FOR UPDATE`;
          const c = rows[0];
          if (!c) throw new Error('Contest not found');
          if (c.state === 'paid') return { winners: [], alreadyPaid: true };

          let pool: string[];
          if (c.visibility === 'global') {
            const eligible = await collectGlobalContestParticipants(
              app,
              id,
              c.rules,
              c.starts_at
            );
            pool = eligible.filter((e) => !e.banned).map((e) => e.user_id);
          } else {
            const eligible = await tx.$queryRaw<
              Array<{ user_id: string }>
            >`SELECT user_id FROM contest_participants
               WHERE contest_id = ${id} AND banned = FALSE`;
            pool = eligible.map((e) => e.user_id);
          }

          if (pool.length === 0) {
            throw new Error('No eligible participants');
          }
          const shares = Array.isArray(c.prize_shares) ? c.prize_shares : [];

          // If admin preselected draft_winners, respect them (skip banned, clamp to winners_count).
          let winners: Array<{ userId: string; place: number; amount: number }> = [];
          if (Array.isArray(c.draft_winners) && (c.draft_winners as any[]).length) {
            const cleaned = (c.draft_winners as any[])
              .map((w) => ({ userId: String((w as any).userId), place: Number((w as any).place) }))
              .filter((w) => pool.includes(w.userId) && Number.isFinite(w.place));
            const unique: Record<string, boolean> = {};
            winners = cleaned
              .sort((a, b) => a.place - b.place)
              .slice(0, c.winners_count)
              .filter((w) => {
                if (unique[w.userId]) return false;
                unique[w.userId] = true;
                return true;
              })
              .map((w, i) => {
                const share = (shares as Array<{ amount?: number }>)[i] ?? shares[shares.length - 1] ?? { amount: 0 };
                return { ...w, place: i + 1, amount: Number(share.amount ?? 0) };
              });
            // Fill remaining slots randomly.
            const remaining = Math.max(0, Math.min(c.winners_count, pool.length) - winners.length);
            const used = new Set(winners.map((w) => w.userId));
            const draftPool = pool.filter((p) => !used.has(p));
            for (let i = 0; i < remaining; i++) {
              const idx = Math.floor(Math.random() * draftPool.length);
              const uid = draftPool.splice(idx, 1)[0];
              const share = (shares as Array<{ amount?: number }>)[winners.length + i] ?? shares[shares.length - 1] ?? { amount: 0 };
              winners.push({ userId: uid, place: winners.length + 1, amount: Number(share.amount ?? 0) });
            }
          } else {
            const winnersCount = Math.min(c.winners_count, pool.length);
            const picks: string[] = [];
            const draftPool = [...pool];
            for (let i = 0; i < winnersCount; i++) {
              const idx = Math.floor(Math.random() * draftPool.length);
              picks.push(draftPool.splice(idx, 1)[0]);
            }
            winners = picks.map((uid, i) => {
              const share = (shares as Array<{ amount?: number }>)[i] ?? shares[shares.length - 1] ?? { amount: 0 };
              return { userId: uid, place: i + 1, amount: Number(share.amount ?? 0) };
            });
          }

          // Credit winners.
          for (const w of winners) {
            const balRows = await tx.$queryRaw<
              Array<{ amount: string }>
            >`SELECT amount::text FROM balances
                WHERE user_id = ${w.userId} LIMIT 1 FOR UPDATE`;
            const before = Number(balRows[0]?.amount ?? 0);
            const after = +(before + w.amount).toFixed(2);
            await tx.$executeRaw`
              UPDATE balances SET amount = ${after}::numeric,
                                  version = version + 1,
                                  last_synced_at = NOW(),
                                  updated_at = NOW()
                WHERE user_id = ${w.userId}`;
            await tx.$executeRaw`
              INSERT INTO transactions (id, user_id, type, amount,
                                         balance_before, balance_after,
                                         metadata, created_at)
              VALUES (
                ${(globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`},
                ${w.userId}, 'bonus', ${w.amount}::numeric,
                ${before}::numeric, ${after}::numeric,
                ${JSON.stringify({
                  kind: 'contest',
                  contestId: id,
                  place: w.place,
                })}::jsonb, NOW())`;
          }

          await tx.$executeRaw`
            UPDATE contests SET resolved_winners = ${JSON.stringify(winners)}::jsonb,
                                draft_winners = NULL,
                                state = 'paid',
                                updated_at = NOW()
              WHERE id = ${id}`;
          return { winners, alreadyPaid: false };
        });

        if (!result.alreadyPaid) {
          await audit({
            request: request as AuthenticatedRequest,
            action: 'contest.draw',
            targetType: 'contest',
            targetId: id,
            payloadAfter: { winners: result.winners },
            reason,
          });
        }
        return reply.send({ ok: true, ...result });
      } catch (err) {
        const msg = (err as Error).message ?? 'Bad Request';
        logger.error({ err }, 'Contest draw failed');
        return reply.code(400).send({ error: msg });
      }
    }
  );

  /**
   * POST /api/_x/bonuses/contests/:id/replace-winner
   * Body: { place, reason } — re-rolls one slot in `resolved_winners`,
   * picks a new random non-banned participant who is not already a
   * winner, refunds the old winner's bonus and credits the new one.
   *
   * Use case: admin notices a winner is suspicious and wants to
   * substitute without redoing the entire draw.
   */
  app.post<{
    Params: { id: string };
    Body: { place?: number; reason?: string };
  }>(
    '/_x/bonuses/contests/:id/replace-winner',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const place = Math.floor(Number(request.body?.place));
      if (!Number.isFinite(place) || place < 1) {
        return reply.code(400).send({ error: 'Invalid place' });
      }
      const { id } = request.params;
      try {
        const result = await app.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              resolved_winners: unknown;
              draft_winners: unknown;
              state: string;
              visibility: string;
              rules: unknown;
              starts_at: Date;
              winners_count: number;
              prize_shares: unknown;
            }>
          >`SELECT resolved_winners, draft_winners, state, visibility, rules, starts_at, winners_count, prize_shares FROM contests
             WHERE id = ${id} LIMIT 1 FOR UPDATE`;
          const c = rows[0];
          if (!c) throw new Error('Contest not found');

          // If contest not paid yet, operate on draft_winners only.
          if (c.state !== 'paid' || !Array.isArray(c.resolved_winners)) {
            let pool: string[] = [];
            if (c.visibility === 'global') {
              const eligible = await collectGlobalContestParticipants(app, id, c.rules, c.starts_at);
              pool = eligible.filter((e) => !e.banned).map((e) => e.user_id);
            } else {
              const eligible = await tx.$queryRaw<Array<{ user_id: string }>>`
                SELECT user_id FROM contest_participants
                 WHERE contest_id = ${id} AND banned = FALSE`;
              pool = eligible.map((e) => e.user_id);
            }
            if (pool.length === 0) throw new Error('No eligible participants');

            const current = Array.isArray(c.draft_winners) ? (c.draft_winners as any[]) : [];
            if (!current.length) throw new Error('No draft winners to replace');

            const normalized = current
              .map((w, i) => ({
                userId: String((w as any).userId ?? ''),
                place: Number.isFinite((w as any).place) && (w as any).place > 0 ? Number((w as any).place) : i + 1,
              }))
              .filter((w) => w.userId && pool.includes(w.userId))
              .sort((a, b) => a.place - b.place)
              .slice(0, c.winners_count);

            const idx = normalized.findIndex((w) => w.place === place);
            if (idx === -1) throw new Error('Place not found');
            const old = normalized[idx];

            const used = new Set(normalized.map((w) => w.userId));
            used.delete(old.userId);
            const candidates = pool.filter((uid) => !used.has(uid));
            if (!candidates.length) throw new Error('No replacement available');
            const newUserId = candidates[Math.floor(Math.random() * candidates.length)];

            normalized[idx] = { ...old, userId: newUserId };
            const resequenced = normalized
              .sort((a, b) => a.place - b.place)
              .slice(0, c.winners_count)
              .map((w, i) => ({ userId: w.userId, place: i + 1 }));

            await tx.$executeRaw`
              UPDATE contests
                 SET draft_winners = ${JSON.stringify(resequenced)}::jsonb,
                     updated_at = NOW()
               WHERE id = ${id}`;
            return { mode: 'draft', oldUserId: old.userId, newUserId, draft: resequenced } as const;
          }

          const winners = c.resolved_winners as Array<{
            userId: string;
            place: number;
            amount: number;
          }>;
          const idx = winners.findIndex((w) => w.place === place);
          if (idx === -1) throw new Error('Place not found');
          const old = winners[idx];

          const eligible = await tx.$queryRaw<
            Array<{ user_id: string }>
          >`SELECT user_id FROM contest_participants
             WHERE contest_id = ${id} AND banned = FALSE`;
          const taken = new Set(winners.map((w) => w.userId));
          const pool = eligible.map((e) => e.user_id).filter((uid) => !taken.has(uid));
          if (pool.length === 0) throw new Error('No replacement available');
          const newUserId = pool[Math.floor(Math.random() * pool.length)];

          // Refund old winner.
          {
            const balRows = await tx.$queryRaw<
              Array<{ amount: string }>
            >`SELECT amount::text FROM balances
                WHERE user_id = ${old.userId} LIMIT 1 FOR UPDATE`;
            const before = Number(balRows[0]?.amount ?? 0);
            const after = +(before - old.amount).toFixed(2);
            await tx.$executeRaw`
              UPDATE balances SET amount = ${after}::numeric,
                                  version = version + 1,
                                  last_synced_at = NOW(),
                                  updated_at = NOW()
                WHERE user_id = ${old.userId}`;
            await tx.$executeRaw`
              INSERT INTO transactions (id, user_id, type, amount,
                                         balance_before, balance_after,
                                         metadata, created_at)
              VALUES (
                ${(globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`},
                ${old.userId}, 'bonus_clawback', ${-old.amount}::numeric,
                ${before}::numeric, ${after}::numeric,
                ${JSON.stringify({
                  kind: 'contest_replace',
                  contestId: id,
                  place,
                })}::jsonb, NOW())`;
          }
          // Credit new winner.
          {
            const balRows = await tx.$queryRaw<
              Array<{ amount: string }>
            >`SELECT amount::text FROM balances
                WHERE user_id = ${newUserId} LIMIT 1 FOR UPDATE`;
            const before = Number(balRows[0]?.amount ?? 0);
            const after = +(before + old.amount).toFixed(2);
            await tx.$executeRaw`
              UPDATE balances SET amount = ${after}::numeric,
                                  version = version + 1,
                                  last_synced_at = NOW(),
                                  updated_at = NOW()
                WHERE user_id = ${newUserId}`;
            await tx.$executeRaw`
              INSERT INTO transactions (id, user_id, type, amount,
                                         balance_before, balance_after,
                                         metadata, created_at)
              VALUES (
                ${(globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`},
                ${newUserId}, 'bonus', ${old.amount}::numeric,
                ${before}::numeric, ${after}::numeric,
                ${JSON.stringify({
                  kind: 'contest_replace',
                  contestId: id,
                  place,
                })}::jsonb, NOW())`;
          }

          winners[idx] = { ...old, userId: newUserId };
          await tx.$executeRaw`
            UPDATE contests SET resolved_winners = ${JSON.stringify(winners)}::jsonb,
                                updated_at = NOW()
              WHERE id = ${id}`;
          return { mode: 'paid', oldUserId: old.userId, newUserId } as const;
        });

        await audit({
          request: request as AuthenticatedRequest,
          action: 'contest.replace_winner',
          targetType: 'contest',
          targetId: id,
          payloadBefore: { place, oldUserId: result.oldUserId },
          payloadAfter: { place, newUserId: result.newUserId, mode: result.mode },
          reason,
        });
        return reply.send({ ok: true, ...result });
      } catch (err) {
        const msg = (err as Error).message ?? 'Bad Request';
        logger.error({ err }, 'Contest replace winner failed');
        return reply.code(400).send({ error: msg });
      }
    }
  );

  /* ----- contest delete ------------------------------------------- */

  /**
   * DELETE /api/_x/bonuses/contests/:id
   * Body: { reason }. Removes the contest along with its
   * `contest_participants` rows (CASCADE). Resolved/paid contests can
   * be deleted too — that's the admin's call.
   */
  app.delete<{ Params: { id: string }; Body: { reason?: string } }>(
    '/_x/bonuses/contests/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const { id } = request.params;
      try {
        await app.prisma.$executeRaw`DELETE FROM contests WHERE id = ${id}`;
        await audit({
          request: request as AuthenticatedRequest,
          action: 'contest.delete',
          targetType: 'contest',
          targetId: id,
          reason,
        });
        return reply.send({ ok: true });
      } catch (err) {
        logger.error(err, 'Contest delete failed');
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
      }
    }
  );

  /**
   * PATCH /api/_x/bonuses/contests/:id
   * Edit common contest fields. Body: any subset of
   *   title, description, bannerUrl, prizePool, winnersCount,
   *   prizeShares, rules, startsAt, endsAt, visibility.
   *
   * Doesn't allow flipping state directly — that's owned by `/draw`.
   */
  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string | null;
      bannerUrl?: string | null;
      prizePool?: number;
      winnersCount?: number;
      prizeShares?: unknown;
      rules?: unknown;
      startsAt?: number;
      endsAt?: number;
      visibility?: 'public' | 'private' | 'global';
      winnerWager?: number;
      reason?: string;
    };
  }>('/_x/bonuses/contests/:id', { preHandler: adminOnly }, async (request, reply) => {
    const reason = (request.body?.reason ?? '').trim();
    if (!reason || reason.length < 3) {
      return reply.code(400).send({ error: 'Reason required' });
    }
    const { id } = request.params;
    const fragments: Prisma.Sql[] = [];
    const b = request.body;
    if (typeof b.title === 'string') fragments.push(Prisma.sql`title = ${b.title.trim()}`);
    if (b.description !== undefined) fragments.push(Prisma.sql`description = ${b.description}`);
    if (b.bannerUrl !== undefined)
      fragments.push(Prisma.sql`banner_url = ${b.bannerUrl?.trim() || null}`);
    if (typeof b.prizePool === 'number')
      fragments.push(Prisma.sql`prize_pool = ${b.prizePool}::numeric`);
    if (typeof b.winnersCount === 'number')
      fragments.push(Prisma.sql`winners_count = ${Math.max(1, Math.floor(b.winnersCount))}`);
    if (b.prizeShares !== undefined)
      fragments.push(Prisma.sql`prize_shares = ${JSON.stringify(b.prizeShares)}::jsonb`);
    if (b.rules !== undefined)
      fragments.push(Prisma.sql`rules = ${JSON.stringify(Array.isArray(b.rules) ? b.rules : [])}::jsonb`);
    if (typeof b.startsAt === 'number')
      fragments.push(Prisma.sql`starts_at = ${new Date(b.startsAt)}`);
    if (typeof b.endsAt === 'number')
      fragments.push(Prisma.sql`ends_at = ${new Date(b.endsAt)}`);
    if (b.visibility) fragments.push(Prisma.sql`visibility = ${b.visibility}`);
    if (typeof b.winnerWager === 'number' && Number.isFinite(b.winnerWager))
      fragments.push(
        Prisma.sql`winner_wager = ${Math.max(0, +b.winnerWager.toFixed(2))}::numeric`
      );
    if (fragments.length === 0)
      return reply.code(400).send({ error: 'Nothing to update' });
    fragments.push(Prisma.sql`updated_at = NOW()`);

    try {
      await app.prisma.$executeRaw(Prisma.sql`
        UPDATE contests SET ${Prisma.join(fragments, ', ')} WHERE id = ${id}
      `);
      await audit({
        request: request as AuthenticatedRequest,
        action: 'contest.update',
        targetType: 'contest',
        targetId: id,
        payloadAfter: b,
        reason,
      });
      return reply.send({ ok: true });
    } catch (err) {
      logger.error(err, 'Contest update failed');
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  /* ---------------------------------------------------------------- security */

  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/_x/security/ips',
    { preHandler: adminOnly },
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(10, parseInt(request.query.limit ?? '50', 10)));
      const skip = (page - 1) * limit;

      try {
        // Find IPs that are shared among multiple users.
        const ipsWithMulti = await app.prisma.$queryRaw<Array<{ ip_address: string; accounts: bigint }>>`
          SELECT ip_address, COUNT(DISTINCT user_id) as accounts
          FROM user_ip_addresses
          GROUP BY ip_address
          HAVING COUNT(DISTINCT user_id) > 1
          ORDER BY accounts DESC
          LIMIT ${limit} OFFSET ${skip}
        `;

        const totalRows = await app.prisma.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*) as c FROM (
            SELECT ip_address
            FROM user_ip_addresses
            GROUP BY ip_address
            HAVING COUNT(DISTINCT user_id) > 1
          ) t
        `;
        const total = Number(totalRows[0]?.c ?? 0);

        if (ipsWithMulti.length === 0) {
          return reply.send({ ok: true, total, page, limit, ips: [] });
        }

        const ipStrings = ipsWithMulti.map((x) => x.ip_address);
        const relatedRecords = await app.prisma.userIpAddress.findMany({
          where: { ipAddress: { in: ipStrings } },
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
                username: true,
                firstName: true,
                lastName: true,
                isBlocked: true,
                withdrawalLocked: true,
                adminNote: true,
                createdAt: true,
              }
            }
          },
          orderBy: { firstSeen: 'asc' }
        });

        // Group by IP
        const grouped = ipsWithMulti.map((ipRow) => {
          const records = relatedRecords.filter((r) => r.ipAddress === ipRow.ip_address);
          return {
            ipAddress: ipRow.ip_address,
            accountsCount: Number(ipRow.accounts),
            users: records.map((r, index) => ({
              id: r.user.id,
              telegramId: Number(r.user.telegramId),
              name: r.user.firstName || r.user.username || `id${r.user.telegramId.toString().slice(-4)}`,
              isBlocked: r.user.isBlocked,
              withdrawalLocked: r.user.withdrawalLocked,
              createdAt: r.user.createdAt.getTime(),
              firstSeen: r.firstSeen.getTime(),
              lastSeen: r.lastSeen.getTime(),
              count: r.count,
              isRoot: r.isRoot,
              isVpn: r.isVpn,
              adminNote: r.user.adminNote,
              isMain: index === 0, // Oldest is considered main
            }))
          };
        });

        return reply.send({ ok: true, total, page, limit, ips: grouped });
      } catch (error) {
        logger.error(error, 'Admin security ips fetch failed');
        return reply.code(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  void isAdminTelegramId;
}


/* ===========================================================================
 * Global-contest helper
 * ===========================================================================
 *
 * Computes the participant set for a global-visibility contest. Players
 * are eligible if they pass every rule from `contests.rules` (same set
 * of types as promo activation conditions). The function returns the
 * full participant rows in the same shape as a regular query against
 * `contest_participants` so the contest detail UI can treat both
 * visibility kinds uniformly.
 *
 * Rules currently supported:
 *   { type: 'deposit_window', amount, days } - sum of deposits in last N days
 *   { type: 'wagered_window', amount, days } - sum of bets in last N days
 *   { type: 'deposit_total',  amount       } - lifetime deposits sum
 *   { type: 'registered_after', date       } - account created after date
 *   { type: 'referrals',      count        } - skipped (no referral system yet)
 *
 * Bans on a global contest are stored as a banned=true row in
 * `contest_participants`. Any user whose id is banned is still
 * returned in the list (so the admin sees them) but with banned=true,
 * so /draw can exclude them.
 */
async function collectGlobalContestParticipants(
  app: FastifyInstance,
  contestId: string,
  rules: unknown,
  startsAt: Date
): Promise<
  Array<{
    id: string;
    user_id: string;
    banned: boolean;
    joined_at: Date;
    first_name: string | null;
    username: string | null;
    photo_url: string | null;
  }>
> {
  const ruleArr = Array.isArray(rules) ? (rules as Array<Record<string, unknown>>) : [];

  // Read every user once and filter in JS — sub-1000-user accounts on
  // this casino make this trivially cheap, and the rule set spans
  // multiple disparate aggregates which is awkward to express as one
  // SQL statement.
  type UserRow = {
    id: string;
    first_name: string | null;
    username: string | null;
    photo_url: string | null;
    created_at: Date;
  };
  const users = await app.prisma.$queryRaw<UserRow[]>`
    SELECT id, first_name, username, photo_url, created_at
      FROM users WHERE is_blocked = FALSE
     ORDER BY created_at DESC LIMIT 5000`;

  // Pre-compute aggregates we'll need.
  const wagerSums = new Map<string, number>();
  const depositSums = new Map<string, number>();
  const depositSumsLifetime = new Map<string, number>();

  // Find the longest window we care about so we can issue one SQL pass.
  const maxWindowDays = ruleArr.reduce<number>((max, r) => {
    if (
      (r.type === 'deposit_window' || r.type === 'wagered_window') &&
      typeof r.days === 'number' &&
      r.days > max
    ) {
      return r.days;
    }
    return max;
  }, 0);

  if (maxWindowDays > 0) {
    const since = new Date(Date.now() - maxWindowDays * 24 * 60 * 60 * 1000);
    type AggRow = { user_id: string; type: string; sum: string };
    const aggRows = await app.prisma.$queryRaw<AggRow[]>`
      SELECT user_id, type, COALESCE(SUM(amount), 0)::text AS sum
        FROM transactions
       WHERE type IN ('deposit', 'bet') AND created_at >= ${since}
       GROUP BY user_id, type`;
    for (const r of aggRows) {
      const v = Math.abs(Number(r.sum));
      if (r.type === 'deposit') depositSums.set(r.user_id, v);
      else if (r.type === 'bet') wagerSums.set(r.user_id, v);
    }
  }
  if (ruleArr.some((r) => r.type === 'deposit_total')) {
    type AggRow = { user_id: string; sum: string };
    const aggRows = await app.prisma.$queryRaw<AggRow[]>`
      SELECT user_id, COALESCE(SUM(amount), 0)::text AS sum
        FROM transactions WHERE type = 'deposit'
       GROUP BY user_id`;
    for (const r of aggRows) {
      depositSumsLifetime.set(r.user_id, Number(r.sum));
    }
  }

  const passes = (u: UserRow): boolean => {
    for (const r of ruleArr) {
      const t = r.type;
      if (t === 'deposit_window') {
        const need = Number(r.amount);
        if (!Number.isFinite(need)) continue;
        if ((depositSums.get(u.id) ?? 0) < need) return false;
      } else if (t === 'wagered_window') {
        const need = Number(r.amount);
        if (!Number.isFinite(need)) continue;
        if ((wagerSums.get(u.id) ?? 0) < need) return false;
      } else if (t === 'deposit_total') {
        const need = Number(r.amount);
        if (!Number.isFinite(need)) continue;
        if ((depositSumsLifetime.get(u.id) ?? 0) < need) return false;
      } else if (t === 'registered_after') {
        const date = typeof r.date === 'string' ? new Date(r.date).getTime() : NaN;
        if (!Number.isFinite(date)) continue;
        if (u.created_at.getTime() < date) return false;
      }
      // 'referrals' currently passes — referral system isn't shipped.
    }
    // Auto-include users who registered before the contest starts and
    // pass every rule. Restricting to "registered after startsAt" is a
    // separate `registered_after` rule the admin can add explicitly.
    void startsAt;
    return true;
  };

  // Bans recorded in contest_participants for this contest.
  type BanRow = { user_id: string; id: string; joined_at: Date; banned: boolean };
  const banRows = await app.prisma.$queryRaw<BanRow[]>`
    SELECT id, user_id, joined_at, banned FROM contest_participants
     WHERE contest_id = ${contestId}`;
  const bans = new Map(banRows.map((b) => [b.user_id, b]));

  return users.filter(passes).map((u) => {
    const ban = bans.get(u.id);
    return {
      id: ban?.id ?? `auto_${u.id}`,
      user_id: u.id,
      banned: !!ban?.banned,
      joined_at: ban?.joined_at ?? u.created_at,
      first_name: u.first_name,
      username: u.username,
      photo_url: u.photo_url,
    };
  });
}
