import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import fp from 'fastify-plugin';

/**
 * Prisma plugin
 */
const prismaPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('prisma', prisma);
  
  app.addHook('onClose', async (app) => {
    await app.prisma.$disconnect();
  });
});

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

/**
 * Register all Fastify plugins
 * 
 * SECURITY:
 * - CORS with credentials support
 * - Security headers (Helmet)
 * - Rate limiting
 * - JWT authentication
 * - Cookie support for httpOnly tokens
 * - WebSocket support
 */
export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Prisma database client
  await app.register(prismaPlugin);
  // Cookie support (required for httpOnly cookies)
  await app.register(cookie, {
    secret: config.jwtSecret,
    parseOptions: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
    },
  });

  // CORS with credentials
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Multipart (needed for DB import uploads)
  await app.register(multipart, {
    limits: {
      fileSize: 512 * 1024 * 1024, // 512MB
    },
  });

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for WebSocket
    crossOriginEmbedderPolicy: false, // Required for Telegram Mini Apps
  });

  // Rate limiting
  await app.register(rateLimit, {
    global: true,
    max: 50000, // Increased heavily to prevent 429s for active players
    timeWindow: config.rateLimitWindowMs,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
    }),
  });

  // JWT authentication
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  });

  // WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      clientTracking: true,
    },
  });
}
