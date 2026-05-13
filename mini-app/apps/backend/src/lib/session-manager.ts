import { randomBytes } from 'crypto';
import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Session Manager
 * 
 * SECURITY:
 * - Sessions stored in Redis (fast, distributed)
 * - Session IDs are cryptographically random
 * - Automatic expiration
 * - Support for session invalidation
 * - Refresh token rotation
 */

export interface SessionData {
  userId: string;
  telegramId: number;
  sessionId: string;
  refreshToken: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  ipAddress?: string;
  userAgent?: string;
}

export class SessionManager {
  private readonly SESSION_PREFIX = 'session:';
  private readonly REFRESH_PREFIX = 'refresh:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  
  // Session duration: 7 days
  private readonly SESSION_TTL = 7 * 24 * 60 * 60;
  
  // Refresh token duration: 30 days
  private readonly REFRESH_TTL = 30 * 24 * 60 * 60;
  
  // Max sessions per user
  private readonly MAX_SESSIONS_PER_USER = 5;

  /**
   * Generate cryptographically secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate cryptographically secure refresh token
   */
  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    telegramId: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const sessionId = this.generateSessionId();
    const refreshToken = this.generateRefreshToken();
    const now = Date.now();

    const sessionData: SessionData = {
      userId,
      telegramId,
      sessionId,
      refreshToken,
      createdAt: now,
      expiresAt: now + this.SESSION_TTL * 1000,
      lastActivity: now,
      ipAddress,
      userAgent,
    };

    try {
      const redis = redisClient.getClient();

      // Store session data
      await redis.setex(
        `${this.SESSION_PREFIX}${sessionId}`,
        this.SESSION_TTL,
        JSON.stringify(sessionData)
      );

      // Store refresh token mapping
      await redis.setex(
        `${this.REFRESH_PREFIX}${refreshToken}`,
        this.REFRESH_TTL,
        sessionId
      );

      // Track user sessions
      await redis.sadd(`${this.USER_SESSIONS_PREFIX}${userId}`, sessionId);
      await redis.expire(`${this.USER_SESSIONS_PREFIX}${userId}`, this.REFRESH_TTL);

      // Enforce max sessions per user
      await this.enforceMaxSessions(userId);

      logger.info({ userId, sessionId }, 'Session created');

      return { sessionId, refreshToken };
    } catch (error) {
      logger.error(error, 'Failed to create session');
      throw new Error('Failed to create session');
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const redis = redisClient.getClient();
      const data = await redis.get(`${this.SESSION_PREFIX}${sessionId}`);

      if (!data) {
        return null;
      }

      const session: SessionData = JSON.parse(data);

      // Check if expired
      if (Date.now() > session.expiresAt) {
        await this.deleteSession(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error(error, 'Failed to get session');
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return;
      }

      session.lastActivity = Date.now();

      const redis = redisClient.getClient();
      await redis.setex(
        `${this.SESSION_PREFIX}${sessionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      );
    } catch (error) {
      logger.error(error, 'Failed to update session activity');
    }
  }

  /**
   * Refresh session using refresh token
   * Implements refresh token rotation for security
   */
  async refreshSession(
    oldRefreshToken: string
  ): Promise<{ sessionId: string; refreshToken: string } | null> {
    try {
      const redis = redisClient.getClient();

      // Get session ID from refresh token
      const sessionId = await redis.get(`${this.REFRESH_PREFIX}${oldRefreshToken}`);
      if (!sessionId) {
        logger.warn('Invalid refresh token');
        return null;
      }

      // Get session data
      const session = await this.getSession(sessionId);
      if (!session) {
        logger.warn('Session not found for refresh token');
        return null;
      }

      // Delete old refresh token (rotation)
      await redis.del(`${this.REFRESH_PREFIX}${oldRefreshToken}`);

      // Generate new refresh token
      const newRefreshToken = this.generateRefreshToken();

      // Update session
      session.refreshToken = newRefreshToken;
      session.lastActivity = Date.now();
      session.expiresAt = Date.now() + this.SESSION_TTL * 1000;

      // Store updated session
      await redis.setex(
        `${this.SESSION_PREFIX}${sessionId}`,
        this.SESSION_TTL,
        JSON.stringify(session)
      );

      // Store new refresh token
      await redis.setex(
        `${this.REFRESH_PREFIX}${newRefreshToken}`,
        this.REFRESH_TTL,
        sessionId
      );

      logger.info({ userId: session.userId, sessionId }, 'Session refreshed');

      return { sessionId, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error(error, 'Failed to refresh session');
      return null;
    }
  }

  /**
   * Delete session (logout)
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const redis = redisClient.getClient();

      // Get session data to clean up refresh token
      const session = await this.getSession(sessionId);
      if (session) {
        // Delete refresh token
        await redis.del(`${this.REFRESH_PREFIX}${session.refreshToken}`);

        // Remove from user sessions
        await redis.srem(`${this.USER_SESSIONS_PREFIX}${session.userId}`, sessionId);
      }

      // Delete session
      await redis.del(`${this.SESSION_PREFIX}${sessionId}`);

      logger.info({ sessionId }, 'Session deleted');
    } catch (error) {
      logger.error(error, 'Failed to delete session');
    }
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    try {
      const redis = redisClient.getClient();

      // Get all user sessions
      const sessionIds = await redis.smembers(`${this.USER_SESSIONS_PREFIX}${userId}`);

      // Delete each session
      for (const sessionId of sessionIds) {
        await this.deleteSession(sessionId);
      }

      // Delete user sessions set
      await redis.del(`${this.USER_SESSIONS_PREFIX}${userId}`);

      logger.info({ userId, count: sessionIds.length }, 'All user sessions deleted');
    } catch (error) {
      logger.error(error, 'Failed to delete user sessions');
    }
  }

  /**
   * Enforce max sessions per user
   * Deletes oldest sessions if limit exceeded
   */
  private async enforceMaxSessions(userId: string): Promise<void> {
    try {
      const redis = redisClient.getClient();
      const sessionIds = await redis.smembers(`${this.USER_SESSIONS_PREFIX}${userId}`);

      if (sessionIds.length <= this.MAX_SESSIONS_PER_USER) {
        return;
      }

      // Get all sessions with timestamps
      const sessions = await Promise.all(
        sessionIds.map(async (id) => ({
          id,
          data: await this.getSession(id),
        }))
      );

      // Sort by creation time (oldest first)
      const validSessions = sessions
        .filter((s) => s.data !== null)
        .sort((a, b) => a.data!.createdAt - b.data!.createdAt);

      // Delete oldest sessions
      const toDelete = validSessions.length - this.MAX_SESSIONS_PER_USER;
      for (let i = 0; i < toDelete; i++) {
        await this.deleteSession(validSessions[i].id);
      }

      logger.info({ userId, deleted: toDelete }, 'Enforced max sessions per user');
    } catch (error) {
      logger.error(error, 'Failed to enforce max sessions');
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const redis = redisClient.getClient();
      const sessionIds = await redis.smembers(`${this.USER_SESSIONS_PREFIX}${userId}`);

      const sessions = await Promise.all(
        sessionIds.map((id) => this.getSession(id))
      );

      return sessions.filter((s): s is SessionData => s !== null);
    } catch (error) {
      logger.error(error, 'Failed to get user sessions');
      return [];
    }
  }
}

export const sessionManager = new SessionManager();
