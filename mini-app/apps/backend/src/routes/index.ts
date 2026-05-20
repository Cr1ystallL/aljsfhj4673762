import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { balanceRoutes } from './balance.js';
import { websocketRoutes } from './websocket.js';
import { gameRoutes } from './games.js';
import { adminRoutes } from './admin.js';
import { macvpayRoutes } from './macvpay.js';
import { withdrawalRoutes } from './withdrawals.js';
import { bonusesRoutes } from './bonuses.js';

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
  await app.register(macvpayRoutes, { prefix: '/api/macvpay' });

  // User withdrawal requests (admin-reviewed)
  await app.register(withdrawalRoutes, { prefix: '/api/withdrawals' });

  // Bonuses (promo codes, lucky wheel, contests)
  await app.register(bonusesRoutes, { prefix: '/api/bonuses' });

  // Admin (covert — see admin.ts for the security posture)
  await app.register(adminRoutes, { prefix: '/api' });

  // WebSocket
  await app.register(websocketRoutes);
}
