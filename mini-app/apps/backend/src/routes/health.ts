import type { FastifyInstance } from 'fastify';

/**
 * Health check routes
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  app.get('/ready', async () => {
    // Check database, redis, etc.
    // For now, just return ok
    return {
      status: 'ready',
      services: {
        database: 'ok',
        redis: 'ok',
      },
    };
  });
}
