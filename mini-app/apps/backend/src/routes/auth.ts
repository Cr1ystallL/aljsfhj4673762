import type { FastifyInstance } from 'fastify';
import { validateTelegramInitData, validateTelegramWebAuth } from '../lib/telegram-auth.js';
import { sessionManager } from '../lib/session-manager.js';
import { JWTManager } from '../lib/jwt-manager.js';
import { userService } from '../services/user-service.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication Routes
 * 
 * SECURITY:
 * - Server-side Telegram validation (HMAC-SHA256)
 * - httpOnly cookies for tokens
 * - Refresh token rotation
 * - Rate limiting applied
 * - CSRF protection via SameSite=Strict
 */

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const jwtManager = new JWTManager(app);

  /**
   * POST /api/auth/telegram
   * Authenticate using Telegram Mini App initData
   * 
   * SECURITY: Server validates initData using HMAC-SHA256
   */
  app.post<{
    Body: {
      initData: string;
    };
  }>(
    '/telegram',
    {
      schema: {
        body: {
          type: 'object',
          required: ['initData'],
          properties: {
            initData: { type: 'string' },
          },
        },
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { initData } = request.body;

      // Validate Telegram initData
      const validatedData = validateTelegramInitData(initData);

      if (!validatedData || !validatedData.user) {
        logger.warn({ ip: request.ip }, 'Invalid Telegram initData');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid Telegram authentication data',
          code: 'INVALID_INIT_DATA',
        });
      }

      try {
        // Create or update user
        const user = await userService.upsertFromTelegram(validatedData.user);

        // Create session
        const { sessionId, refreshToken } = await sessionManager.createSession(
          user.id,
          Number(user.telegramId),
          request.ip,
          request.headers['user-agent']
        );

        // Security / Multi-account IP analysis (non-blocking)
        import('../services/security-service.js').then(({ securityService }) => {
          const deviceId = request.headers['x-device-id'] as string | undefined;
          securityService.analyzeIpLogin(user.id, Number(user.telegramId), request.ip, deviceId).catch(err => {
            logger.error({ err }, 'Security service async failure');
          });
        });

        // Generate tokens
        const accessToken = jwtManager.generateAccessToken(
          user.id,
          Number(user.telegramId),
          sessionId
        );

        // Set cookies
        jwtManager.setAccessTokenCookie(reply, accessToken);
        jwtManager.setRefreshTokenCookie(reply, refreshToken);

        logger.info(
          { userId: user.id, telegramId: user.telegramId },
          'User authenticated via Telegram'
        );

        return reply.send({
          success: true,
          sessionId,
          accessToken,
          user: {
            id: user.id,
            telegramId: Number(user.telegramId),
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            isPremium: user.isPremium,
          },
        });
      } catch (error) {
        logger.error(error, 'Failed to authenticate user');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to authenticate',
          code: 'AUTH_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/auth/web
   * Authenticate using Telegram Login Widget (web fallback)
   */
  app.post<{
    Body: Record<string, string>;
  }>(
    '/web',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      // Validate Telegram web auth
      const validatedUser = validateTelegramWebAuth(request.body);

      if (!validatedUser) {
        logger.warn({ ip: request.ip }, 'Invalid Telegram web auth');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid Telegram authentication data',
          code: 'INVALID_WEB_AUTH',
        });
      }

      try {
        // Create or update user
        const user = await userService.upsertFromTelegram(validatedUser);

        // Create session
        const { sessionId, refreshToken } = await sessionManager.createSession(
          user.id,
          Number(user.telegramId),
          request.ip,
          request.headers['user-agent']
        );

        // Security / Multi-account IP analysis
        import('../services/security-service.js').then(({ securityService }) => {
          const deviceId = request.headers['x-device-id'] as string | undefined;
          securityService.analyzeIpLogin(user.id, Number(user.telegramId), request.ip, deviceId).catch(err => {
            logger.error({ err }, 'Security service async failure');
          });
        });

        // Generate tokens
        const accessToken = jwtManager.generateAccessToken(
          user.id,
          Number(user.telegramId),
          sessionId
        );

        // Set cookies
        jwtManager.setAccessTokenCookie(reply, accessToken);
        jwtManager.setRefreshTokenCookie(reply, refreshToken);

        logger.info(
          { userId: user.id, telegramId: user.telegramId },
          'User authenticated via web'
        );

        return reply.send({
          success: true,
          sessionId,
          accessToken,
          user: {
            id: user.id,
            telegramId: Number(user.telegramId),
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            isPremium: user.isPremium,
          },
        });
      } catch (error) {
        logger.error(error, 'Failed to authenticate user via web');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to authenticate',
          code: 'AUTH_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   * 
   * SECURITY: Implements refresh token rotation
   */
  app.post(
    '/refresh',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies.refresh_token;

      if (!refreshToken) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'No refresh token provided',
          code: 'NO_REFRESH_TOKEN',
        });
      }

      try {
        // Refresh session (with token rotation)
        const result = await sessionManager.refreshSession(refreshToken);

        if (!result) {
          jwtManager.clearAuthCookies(reply);
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired refresh token',
            code: 'INVALID_REFRESH_TOKEN',
          });
        }

        // Get session data
        const session = await sessionManager.getSession(result.sessionId);

        if (!session) {
          jwtManager.clearAuthCookies(reply);
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Session not found',
            code: 'SESSION_NOT_FOUND',
          });
        }

        // Generate new access token
        const accessToken = jwtManager.generateAccessToken(
          session.userId,
          session.telegramId,
          session.sessionId
        );

        // Set new cookies
        jwtManager.setAccessTokenCookie(reply, accessToken);
        jwtManager.setRefreshTokenCookie(reply, result.refreshToken);

        logger.info({ userId: session.userId }, 'Token refreshed');

        return reply.send({
          success: true,
        });
      } catch (error) {
        logger.error(error, 'Failed to refresh token');
        jwtManager.clearAuthCookies(reply);
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Failed to refresh token',
          code: 'REFRESH_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  app.get(
    '/me',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      try {
        const user = await userService.getUserWithBalance(userId);

        if (!user) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
            code: 'USER_NOT_FOUND',
          });
        }

        return reply.send({
          user: {
            id: user.id,
            telegramId: Number(user.telegramId),
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            isPremium: user.isPremium,
            languageCode: user.languageCode,
            createdAt: user.createdAt,
          },
          balance: user.balance
            ? {
                amount: Number(user.balance.amount),
                currency: user.balance.currency,
                demoMode: user.balance.demoMode,
              }
            : null,
        });
      } catch (error) {
        logger.error(error, 'Failed to get user');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user',
          code: 'GET_USER_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/auth/logout
   * Logout and invalidate session
   */
  app.post(
    '/logout',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { sessionId, userId } = (request as AuthenticatedRequest).user;

      try {
        // Delete session
        await sessionManager.deleteSession(sessionId);

        // Clear cookies
        jwtManager.clearAuthCookies(reply);

        logger.info({ userId, sessionId }, 'User logged out');

        return reply.send({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        logger.error(error, 'Failed to logout');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to logout',
          code: 'LOGOUT_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/auth/logout-all
   * Logout from all devices
   */
  app.post(
    '/logout-all',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      try {
        // Delete all user sessions
        await sessionManager.deleteUserSessions(userId);

        // Clear cookies
        jwtManager.clearAuthCookies(reply);

        logger.info({ userId }, 'User logged out from all devices');

        return reply.send({
          success: true,
          message: 'Logged out from all devices',
        });
      } catch (error) {
        logger.error(error, 'Failed to logout from all devices');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to logout',
          code: 'LOGOUT_ALL_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/auth/sessions
   * Get all active sessions
   */
  app.get(
    '/sessions',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      try {
        const sessions = await sessionManager.getUserSessions(userId);

        return reply.send({
          sessions: sessions.map((session) => ({
            sessionId: session.sessionId,
            createdAt: new Date(session.createdAt).toISOString(),
            lastActivity: new Date(session.lastActivity).toISOString(),
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          })),
        });
      } catch (error) {
        logger.error(error, 'Failed to get sessions');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get sessions',
          code: 'GET_SESSIONS_FAILED',
        });
      }
    }
  );
}
