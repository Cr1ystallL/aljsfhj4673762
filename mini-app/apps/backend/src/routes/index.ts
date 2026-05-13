import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { balanceRoutes } from './balance.js';
import { websocketRoutes } from './websocket.js';
import { gameRoutes } from './games.js';

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

  // WebSocket
  await app.register(websocketRoutes);
}
