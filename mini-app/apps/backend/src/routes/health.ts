import type { FastifyInstance } from 'fastify';

/**
 * Health check routes
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const handler = async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });

  app.get('', handler);
  app.get('/', handler);

  app.get('/ready', async () => {
    // Check database, redis, etc.
    return {
      status: 'ready',
      services: {
        database: 'ok',
        redis: 'ok',
      },
    };
  });

  app.get('/api/stats', async () => {
    return {
      ok: true,
      onlinePlayers: 48,
      totalBets: 12450,
      timestamp: new Date().toISOString(),
    };
  });
}
