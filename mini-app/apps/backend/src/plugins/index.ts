import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import { config } from '../config/index.js';

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

  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for WebSocket
    crossOriginEmbedderPolicy: false, // Required for Telegram Mini Apps
  });

  // Rate limiting
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    errorResponseBuilder: () => ({
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
