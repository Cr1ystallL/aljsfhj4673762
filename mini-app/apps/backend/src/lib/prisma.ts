import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

/**
 * Prisma Client Singleton
 * Shared database connection across the application
 */

export const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

// Log warnings and errors
prisma.$on('warn', (e) => {
  logger.warn(e, 'Prisma warning');
});

prisma.$on('error', (e) => {
  logger.error(e, 'Prisma error');
});

// Graceful shutdown
export async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}
