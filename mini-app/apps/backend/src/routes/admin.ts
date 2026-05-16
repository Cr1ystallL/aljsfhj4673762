import type { FastifyInstance } from 'fastify';
import { adminOnly, isAdminTelegramId } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Admin Routes — covert.
 *
 * The mini-app exposes admin telemetry through endpoints that look like
 * generic internal pings. The path prefix `/api/_x/` is intentionally
 * obscure, the responses to non-admins are flat 404s, and the only way
 * to even *find out* admin functionality exists is to be one of the
 * Telegram IDs whitelisted in `ADMIN_TELEGRAM_IDS`.
 *
 * Every endpoint here:
 *   - Runs through the `adminOnly` guard which returns 404 on failure.
 *   - Validates that the Telegram ID in the JWT is in the env-defined
 *     admin set. Server-side only — no client-side flag is trusted.
 *   - Returns aggregate, read-only data. There is no mutating endpoint
 *     here yet; future actions (ban, freeze balance, etc.) must go
 *     through their own audit trail.
 */

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/_x/probe
   *
   * Discoverability check used by the frontend to decide whether to
   * render the "Админ" button on the profile screen. Non-admins get a
   * generic 404 (same as any unmatched route on Fastify), so probing
   * this endpoint is uninformative — even an admin only learns whether
   * *they* are an admin, not whether the system has admins.
   */
  app.get('/_x/probe', { preHandler: adminOnly }, async (_request, reply) => {
    return reply.send({ ok: true });
  });

  /**
   * GET /api/_x/stats
   *
   * Aggregate read-only stats. Pulls only what's needed for the panel:
   *   - users      : total count, new this 24h / 7d
   *   - balances   : total liability + total demo + currency split
   *   - bets       : total wagered, total paid out, gross gaming revenue
   *   - per-game   : count, wagered, payout, GGR, max multiplier
   *   - timeline   : daily totals for the last 14 days
   *   - top players: top 10 by total wagered
   */
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
        // Per-game aggregate. Prisma doesn't support COUNT + SUM + MAX
        // in a single groupBy result on Decimal columns reliably across
        // versions, so we groupBy with sum/count/max.
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
          select: {
            placedAt: true,
            amount: true,
            payout: true,
          },
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

      // Hydrate top players with user info in a second pass — groupBy
      // can't include relations.
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

      // Daily timeline: bucket the 14-day window by date string.
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
        users: {
          total: userCount,
          new24h: users24h,
          new7d: users7d,
        },
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
      // Even errors masquerade as generic — no internal-server-error
      // body shape that hints at admin endpoints.
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
  });

  // Re-export the helper so other modules can detect admin status.
  void isAdminTelegramId;
}
