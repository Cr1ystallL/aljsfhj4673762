import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { balanceRoutes } from './balance.js';
import { websocketRoutes } from './websocket.js';
import { gameRoutes } from './games.js';
import { adminRoutes } from './admin.js';
import { dbOpsRoutes } from './dbops.js';
import { maintenanceRoutes } from './maintenance.js';
import { foluxpayRoutes } from './foluxpay.js';
import { withdrawalRoutes } from './withdrawals.js';
import { bonusesRoutes } from './bonuses.js';
import { presenceRoutes, countOnlinePresence } from './presence.js';
import { tournamentRoutes } from './tournaments.js';
import { partnerRoutes } from './partner.js';
import { cryptoDepositRoutes } from './crypto-deposit.js';
import { cryptoWorker } from '../services/crypto-worker.js';

let luckFeedCache: {
  at: number;
  items: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    gameType: string;
    payout: number;
    multiplier: number;
    at: number;
  }>;
} | null = null;

/**
 * Register all application routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check & stats
  await app.register(healthRoutes, { prefix: '/health' });

  /**
   * Public lobby stats for the home ticker.
   * Online = live Redis presence keys (45s TTL), not a simulated walk.
   * Payouts = sum of paid withdrawals in the last 24 hours.
   */
  app.get('/api/stats', async () => {
    let online = 0;
    let payouts24h = 0;
    let feed: Array<{
      id: string;
      name: string;
      photoUrl: string | null;
      gameType: string;
      payout: number;
      multiplier: number;
      at: number;
    }> = [];
    try {
      online = await countOnlinePresence();
    } catch {
      online = 0;
    }
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const agg = await app.prisma.withdrawalRequest.aggregate({
        _sum: { amount: true },
        where: {
          status: 'paid',
          updatedAt: { gte: since },
        },
      });
      payouts24h = Number(agg._sum.amount ?? 0);
      if (!Number.isFinite(payouts24h) || payouts24h < 0) payouts24h = 0;
      payouts24h = Math.round(payouts24h * 100) / 100;
    } catch {
      payouts24h = 0;
    }
    const now = Date.now();
    if (luckFeedCache && now - luckFeedCache.at < 5_000) {
      feed = luckFeedCache.items;
    } else {
      try {
        const rows = await app.prisma.bet.findMany({
          where: {
            payout: { gt: 0 },
            state: { in: ['won', 'cashed_out'] },
            gameType: { notIn: ['plinko', 'bridges'] },
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: 16,
          select: {
            id: true,
            gameType: true,
            payout: true,
            multiplier: true,
            resolvedAt: true,
            placedAt: true,
            user: {
              select: {
                firstName: true,
                username: true,
                photoUrl: true,
                telegramId: true,
              },
            },
          },
        });
        feed = rows
          .map((b) => ({
            id: b.id,
            name:
              b.user.firstName?.trim() ||
              b.user.username?.trim() ||
              (b.user.telegramId
                ? `id${b.user.telegramId.toString().slice(-4)}`
                : 'Игрок'),
            photoUrl: b.user.photoUrl ?? null,
            gameType: b.gameType,
            payout: Math.round(Number(b.payout ?? 0) * 100) / 100,
            multiplier: Math.round(Number(b.multiplier ?? 0) * 100) / 100,
            at: (b.resolvedAt ?? b.placedAt).getTime(),
          }))
          .filter((x) => x.payout > 0 && x.multiplier >= 1);
        luckFeedCache = { at: now, items: feed };
      } catch {
        feed = luckFeedCache?.items ?? [];
      }
    }
    return {
      success: true,
      ok: true,
      online,
      onlinePlayers: online,
      payouts24h,
      feed,
      currency: 'zł',
    };
  });

  // Authentication
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Balance
  await app.register(balanceRoutes, { prefix: '/api/balance' });

  // Games
  await app.register(gameRoutes, { prefix: '/api/games' });

  // MacvPay deposits
  await app.register(foluxpayRoutes, { prefix: '/api/foluxpay' });

  // Direct Crypto deposits
  await app.register(cryptoDepositRoutes, { prefix: '/api/crypto-deposit' });

  // User withdrawal requests (admin-reviewed)
  await app.register(withdrawalRoutes, { prefix: '/api/withdrawals' });

  // Bonuses (promo codes, lucky wheel, contests)
  await app.register(bonusesRoutes, { prefix: '/api/bonuses' });

  // Tournaments (experimental)
  await app.register(tournamentRoutes, { prefix: '/api' });

  // Presence — heartbeat (player) + live list (admin). См. presence.ts.
  // Регистрируется до admin-роутов, чтобы /api/_x/presence резолвился
  // именно из этого файла, а не накладывался на admin-неймспейс.
  await app.register(presenceRoutes, { prefix: '/api' });

  // Admin (covert — see admin.ts for the security posture)
  await app.register(adminRoutes, { prefix: '/api' });

  // DB ops (export/import), gated by admin + per-section password
  await app.register(dbOpsRoutes, { prefix: '/api' });

  // Maintenance mode (public status + admin toggle)
  await app.register(maintenanceRoutes, { prefix: '/api' });

  // WebSocket (supports both /api/ws and /ws)
  await app.register(websocketRoutes, { prefix: '/api' });
  await app.register(websocketRoutes);

  // Partner (RevShare)
  await app.register(partnerRoutes, { prefix: '/api/partner' });

  // Start background blockchain worker
  cryptoWorker.start(app.prisma);
}
