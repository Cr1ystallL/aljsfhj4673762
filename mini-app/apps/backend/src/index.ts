import Fastify from 'fastify';
import { config, validateConfig } from './config/index.js';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';
import { redisClient } from './lib/redis.js';
import { disconnectPrisma } from './lib/prisma.js';
import { wsManager } from './lib/websocket-manager.js';

/**
 * Main application entry point
 */

async function start() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    logger.error(error, 'Configuration validation failed');
    process.exit(1);
  }

  // Create Fastify instance
  const app = Fastify({
    logger: logger,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    bodyLimit: 104857600, // 100MB
  });

  try {
    // Connect to Redis
    await redisClient.connect();
    await wsManager.init();

    // Register plugins (CORS, JWT, WebSocket, etc.)
    await registerPlugins(app as any);

    // Register routes
    await registerRoutes(app as any);

    // Bootstrap singletons that own perpetual game rooms — Wheel
    // engine is loaded eagerly here so it starts its round loop on
    // worker start. Crash engine is bootstrapped through a separate
    // singleton imported by the routes module.
    await import('./games/wheel/wheel-singleton.js');
    
    // Start automated background jobs
    const { startTournamentCron } = await import('./services/tournament-cron.js');
    startTournamentCron();

    // Start server
    await app.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(
      `Server running on http://${config.host}:${config.port}`
    );
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully');
  try {
    const { stopTournamentCron } = await import('./services/tournament-cron.js');
    stopTournamentCron();
    await redisClient.disconnect();
    await disconnectPrisma();
  } catch (error) {
    logger.error(error, 'Error during shutdown');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start application
start();
