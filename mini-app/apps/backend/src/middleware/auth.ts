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

/**
 * Parse the admin Telegram ID allow-list from the env. Comma-separated,
 * whitespace-tolerant, ignores blank entries. We compute it once at
 * module load — flipping seed admins live requires a backend restart,
 * which is intentional: the .env value should only ever change in
 * deployment.
 *
 * Runtime admins (added via the admin UI) live in Redis set
 * `admins:dynamic` and are checked dynamically in `isAdminTelegramId`.
 */
const ADMIN_TELEGRAM_IDS: ReadonlySet<number> = (() => {
  const raw = process.env.ADMIN_TELEGRAM_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return new Set(ids);
})();

/**
 * Cache for runtime (Redis-backed) admin set. We avoid hitting Redis
 * on every request by caching the set with a short TTL.
 */
let dynamicCache: { ids: Set<number>; expiresAt: number } | null = null;
const DYNAMIC_TTL_MS = 5_000;

async function getDynamicAdmins(): Promise<Set<number>> {
  const now = Date.now();
  if (dynamicCache && dynamicCache.expiresAt > now) return dynamicCache.ids;
  try {
    // Lazy import — avoids a circular dep with redis when the auth file
    // is loaded before the redis client connects.
    const { redisClient } = await import('../lib/redis.js');
    const raw = await redisClient.getClient().smembers('admins:dynamic');
    const ids = new Set(
      raw
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    dynamicCache = { ids, expiresAt: now + DYNAMIC_TTL_MS };
    return ids;
  } catch (err) {
    logger.warn({ err }, 'Failed to read dynamic admin set');
    return new Set();
  }
}

export function isAdminTelegramId(telegramId: number): boolean {
  return ADMIN_TELEGRAM_IDS.has(telegramId);
}

/**
 * Async version that also consults the runtime Redis set. Called from
 * the `adminOnly` guard.
 */
async function isAdminTelegramIdAsync(telegramId: number): Promise<boolean> {
  if (ADMIN_TELEGRAM_IDS.has(telegramId)) return true;
  const dyn = await getDynamicAdmins();
  return dyn.has(telegramId);
}

/**
 * Cache for the withdrawal-only admin set. Same TTL as `admins:dynamic`.
 * Members of `admins:withdrawal` can review withdrawal requests but
 * have no powers anywhere else in the admin panel — useful for ops
 * staff that should be able to pay out players without having full
 * casino-config access.
 */
let withdrawalAdminCache: { ids: Set<number>; expiresAt: number } | null = null;

async function getWithdrawalAdmins(): Promise<Set<number>> {
  const now = Date.now();
  if (withdrawalAdminCache && withdrawalAdminCache.expiresAt > now) {
    return withdrawalAdminCache.ids;
  }
  try {
    const { redisClient } = await import('../lib/redis.js');
    const raw = await redisClient.getClient().smembers('admins:withdrawal');
    const ids = new Set(
      raw
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    withdrawalAdminCache = { ids, expiresAt: now + DYNAMIC_TTL_MS };
    return ids;
  } catch (err) {
    logger.warn({ err }, 'Failed to read withdrawal admin set');
    return new Set();
  }
}

/**
 * Resolve a Telegram ID's admin scope. Returns `'full'` for full admins
 * (env list + dynamic set), `'withdrawal'` for withdrawal-only admins,
 * or `null` for non-admins.
 */
export async function resolveAdminScope(
  telegramId: number
): Promise<'full' | 'withdrawal' | null> {
  if (await isAdminTelegramIdAsync(telegramId)) return 'full';
  const w = await getWithdrawalAdmins();
  if (w.has(telegramId)) return 'withdrawal';
  return null;
}

/**
 * Admin gate.
 *
 * SECURITY POSTURE: this guard is the *only* control that exposes admin
 * surfaces. The endpoint paths are intentionally unguessable (`/api/_x/`
 * prefix), responses pretend the route doesn't exist for non-admins
 * (404, never 401/403), and the authoritative check is the Telegram ID
 * decoded from the verified JWT — not any client-supplied header.
 *
 *   - Auth must succeed first (cookie + Redis session).
 *   - Telegram ID must be in `ADMIN_TELEGRAM_IDS` (env, comma-separated).
 *   - Any failure returns a generic 404 so the route is undiscoverable.
 *
 * Doing the auth check + admin check in two visibly different ways
 * (401 for missing cookie, 404 for wrong id) would leak existence; we
 * collapse both into 404 by gating on admin first and returning 404
 * unconditionally on failure.
 */
export async function adminOnly(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Run authentication silently — failures pretend the route is missing.
  try {
    const token = request.cookies.access_token;
    if (!token) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    const decoded = await request.server.jwt.verify<{
      userId: string;
      telegramId: number;
      sessionId: string;
      type: string;
    }>(token);
    if (decoded.type !== 'access') {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    const session = await sessionManager.getSession(decoded.sessionId);
    if (!session || session.userId !== decoded.userId) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    if (!(await isAdminTelegramIdAsync(decoded.telegramId))) {
      // Log silently — this *can* be a probe — but never tell the caller.
      logger.warn(
        { telegramId: decoded.telegramId, ip: request.ip, url: request.url },
        'Non-admin attempted admin endpoint'
      );
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    await sessionManager.updateActivity(decoded.sessionId);
    (request as AuthenticatedRequest).user = {
      userId: decoded.userId,
      telegramId: decoded.telegramId,
      sessionId: decoded.sessionId,
    };
  } catch {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
  }
}

/**
 * Withdrawal-admin gate.
 *
 * Permits both full admins (`adminOnly`) AND withdrawal-only admins.
 * Same 404-on-failure posture as `adminOnly`. Use on routes that pay
 * out withdrawals so an ops account doesn't need full admin powers.
 */
export async function withdrawalAdminOnly(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.cookies.access_token;
    if (!token) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    const decoded = await request.server.jwt.verify<{
      userId: string;
      telegramId: number;
      sessionId: string;
      type: string;
    }>(token);
    if (decoded.type !== 'access') {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    const session = await sessionManager.getSession(decoded.sessionId);
    if (!session || session.userId !== decoded.userId) {
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    const scope = await resolveAdminScope(decoded.telegramId);
    if (scope === null) {
      logger.warn(
        { telegramId: decoded.telegramId, ip: request.ip, url: request.url },
        'Non-admin attempted withdrawal-admin endpoint'
      );
      return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
    }
    await sessionManager.updateActivity(decoded.sessionId);
    (request as AuthenticatedRequest).user = {
      userId: decoded.userId,
      telegramId: decoded.telegramId,
      sessionId: decoded.sessionId,
    };
  } catch {
    return reply.code(404).send({ statusCode: 404, error: 'Not Found' });
  }
}
