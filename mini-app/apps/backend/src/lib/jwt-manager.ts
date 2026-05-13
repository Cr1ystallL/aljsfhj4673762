import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

/**
 * JWT Manager
 * 
 * SECURITY:
 * - Short-lived access tokens (15 minutes)
 * - Tokens stored in httpOnly cookies (XSS protection)
 * - CSRF protection via SameSite=Strict
 * - Refresh token rotation
 */

export interface JWTPayload {
  userId: string;
  telegramId: number;
  sessionId: string;
  type: 'access' | 'refresh';
}

export class JWTManager {
  private app: FastifyInstance;

  // Access token duration: 15 minutes
  private readonly ACCESS_TOKEN_TTL = 15 * 60; // seconds

  // Refresh token duration: 30 days
  private readonly REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // seconds

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  /**
   * Generate access token
   */
  generateAccessToken(userId: string, telegramId: number, sessionId: string): string {
    const payload: JWTPayload = {
      userId,
      telegramId,
      sessionId,
      type: 'access',
    };

    return this.app.jwt.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_TTL,
    });
  }

  /**
   * Generate refresh token (JWT for validation, but actual token stored in Redis)
   */
  generateRefreshToken(userId: string, telegramId: number, sessionId: string): string {
    const payload: JWTPayload = {
      userId,
      telegramId,
      sessionId,
      type: 'refresh',
    };

    return this.app.jwt.sign(payload, {
      expiresIn: this.REFRESH_TOKEN_TTL,
    });
  }

  /**
   * Verify and decode token
   */
  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = await this.app.jwt.verify<JWTPayload>(token);
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set access token cookie
   */
  setAccessTokenCookie(reply: any, token: string): void {
    reply.setCookie('access_token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: this.ACCESS_TOKEN_TTL,
    });
  }

  /**
   * Set refresh token cookie
   */
  setRefreshTokenCookie(reply: any, token: string): void {
    reply.setCookie('refresh_token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.REFRESH_TOKEN_TTL,
    });
  }

  /**
   * Clear auth cookies (logout)
   */
  clearAuthCookies(reply: any): void {
    reply.clearCookie('access_token', {
      path: '/',
    });
    reply.clearCookie('refresh_token', {
      path: '/api/auth',
    });
  }
}
