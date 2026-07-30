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
import { presenceRoutes } from './presence.js';
import { tournamentRoutes } from './tournaments.js';
import { partnerRoutes } from './partner.js';
import { cryptoDepositRoutes } from './crypto-deposit.js';
import { cryptoWorker } from '../services/crypto-worker.js';

/**
 * Register all application routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check
  await app.register(healthRoutes, { prefix: '/health' });

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

  // WebSocket
  await app.register(websocketRoutes, { prefix: '/api' });

  // Partner (RevShare)
  await app.register(partnerRoutes, { prefix: '/api/partner' });

  // Start background blockchain worker
  cryptoWorker.start(app.prisma);
}
