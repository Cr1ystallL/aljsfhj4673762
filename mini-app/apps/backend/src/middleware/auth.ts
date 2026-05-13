import type { FastifyRequest, FastifyReply } from 'fastify';
import { sessionManager } from '../lib/session-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication Middleware
 * 
 * SECURITY:
 * - Validates JWT from httpOnly cookie
 * - Verifies session exists in Redis
 * - Updates session activity
 * - Attaches user data to request
 */

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    userId: string;
    telegramId: number;
    sessionId: string;
  };
}

/**
 * Authenticate request using JWT from cookie
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get access token from cookie
    const token = request.cookies.access_token;

    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No access token provided',
        code: 'NO_TOKEN',
      });
    }

    // Verify JWT
    const decoded = await request.server.jwt.verify<{
      userId: string;
      telegramId: number;
      sessionId: string;
      type: string;
    }>(token);

    if (decoded.type !== 'access') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    // Verify session exists in Redis
    const session = await sessionManager.getSession(decoded.sessionId);

    if (!session) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Session not found or expired',
        code: 'SESSION_EXPIRED',
      });
    }

    // Verify user ID matches
    if (session.userId !== decoded.userId) {
      logger.warn(
        { sessionUserId: session.userId, tokenUserId: decoded.userId },
        'User ID mismatch'
      );
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid session',
        code: 'INVALID_SESSION',
      });
    }

    // Update session activity
    await sessionManager.updateActivity(decoded.sessionId);

    // Attach user to request
    (request as AuthenticatedRequest).user = {
      userId: decoded.userId,
      telegramId: decoded.telegramId,
      sessionId: decoded.sessionId,
    };
  } catch (error) {
    logger.error(error, 'Authentication failed');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }
}

/**
 * Optional authentication
 * Attaches user if authenticated, but doesn't reject if not
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.cookies.access_token;

    if (!token) {
      return;
    }

    const decoded = await request.server.jwt.verify<{
      userId: string;
      telegramId: number;
      sessionId: string;
      type: string;
    }>(token);

    if (decoded.type !== 'access') {
      return;
    }

    const session = await sessionManager.getSession(decoded.sessionId);

    if (!session || session.userId !== decoded.userId) {
      return;
    }

    await sessionManager.updateActivity(decoded.sessionId);

    (request as AuthenticatedRequest).user = {
      userId: decoded.userId,
      telegramId: decoded.telegramId,
      sessionId: decoded.sessionId,
    };
  } catch (error) {
    // Silently fail for optional auth
    return;
  }
}
