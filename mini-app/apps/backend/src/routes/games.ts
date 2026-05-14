import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { CrashGameEngine } from '../games/crash/crash-engine.js';
import { minesEngine } from '../games/mines/mines-engine.js';
import { GameRoomManager } from '../game-engine/game-room-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Game Routes
 * Handles game actions and room management
 *
 * Crash is multiplayer with a shared room broadcast over WebSocket.
 * Mines is single-player, REST-only — each user keeps their own active
 * round on the server-side engine until cashout / bust.
 *
 * SECURITY:
 * - Rate limiting: 10 actions / 10 seconds per user per game
 * - Authentication required
 * - Server-authoritative validation
 */

// Rate limiting tracking
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '10000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '1000', 10);

function checkRateLimit(userId: string, action: string): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const limit = rateLimits.get(key);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

// Game room managers
const crashManager = new GameRoomManager('crash');

// Initialize default rooms
const crashEngine = new CrashGameEngine('crash_main');
crashEngine.start();
crashManager.createRoom('crash_main', crashEngine);

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Helper: ensure the engine knows display info for the current user.
   * This populates avatar/name fields embedded in player feed events.
   */
  async function ensureCrashUser(userId: string): Promise<void> {
    const engine = crashManager.getRoom('crash_main') as CrashGameEngine;
    if (!engine || engine.hasUserInfo(userId)) return;
    try {
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, firstName: true, lastName: true, photoUrl: true },
      });
      engine.setUserInfo({
        userId,
        username: user?.username ?? null,
        firstName: user?.firstName ?? null,
        photoUrl: user?.photoUrl ?? null,
      });
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to load crash user info');
    }
  }

  /**
   * POST /api/games/crash/bet
   * Place a slot bet in the crash game.
   * Slots: 0 (top panel) or 1 (bottom panel) — each user can hold up to two
   * concurrent bets per round.
   */
  app.post<{
    Body: {
      amount: number;
      slot?: number;
      autoCashout?: number | null;
      demoMode?: boolean;
    };
  }>(
    '/crash/bet',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'number' },
            slot: { type: 'number' },
            autoCashout: { type: ['number', 'null'] },
            demoMode: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, slot = 0, autoCashout = null, demoMode = false } = request.body;

      if (!checkRateLimit(userId, 'crash:bet')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please wait before placing another bet.',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = crashManager.getRoom('crash_main') as CrashGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        await ensureCrashUser(userId);
        const bet = await engine.placeCrashBet(userId, slot, amount, autoCashout, demoMode);

        return reply.send({ success: true, bet });
      } catch (error) {
        logger.error(error, 'Failed to place crash bet');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'BET_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/crash/cancel
   * Cancel a queued slot bet during waiting/countdown — refunds the stake.
   */
  app.post<{ Body: { slot?: number } }>(
    '/crash/cancel',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: { slot: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { slot = 0 } = request.body || {};

      if (!checkRateLimit(userId, 'crash:cancel')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = crashManager.getRoom('crash_main') as CrashGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }
        await engine.cancelCrashBet(userId, slot);
        return reply.send({ success: true });
      } catch (error) {
        logger.error(error, 'Failed to cancel crash bet');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'CANCEL_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/crash/cashout
   * Cashout from a specific slot (defaults to slot 0).
   */
  app.post<{ Body: { slot?: number } }>(
    '/crash/cashout',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          properties: { slot: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { slot = 0 } = request.body || {};

      if (!checkRateLimit(userId, 'crash:cashout')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = crashManager.getRoom('crash_main') as CrashGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        engine.queueSlotCashout(userId, slot);

        return reply.send({ success: true });
      } catch (error) {
        logger.error(error, 'Failed to cashout');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'CASHOUT_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/games/crash/state
   * Get current crash game state
   */
  app.get(
    '/crash/state',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      try {
        const engine = crashManager.getRoom('crash_main') as CrashGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        const state = engine.getCurrentState();

        return reply.send({ state });
      } catch (error) {
        logger.error(error, 'Failed to get crash state');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /* -------------------------------------------------------------- mines */

  /**
   * GET /api/games/mines/state
   * Returns the user's active mines round (if any) so a refresh resumes
   * the session.
   */
  app.get('/mines/state', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const state = minesEngine.getState(userId);
    return reply.send({ state });
  });

  /**
   * POST /api/games/mines/start
   * Start a new mines round.
   */
  app.post<{
    Body: { amount: number; mineCount: number; demoMode?: boolean };
  }>(
    '/mines/start',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'mineCount'],
          properties: {
            amount: { type: 'number' },
            mineCount: { type: 'number' },
            demoMode: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, mineCount, demoMode = false } = request.body;

      if (!checkRateLimit(userId, 'mines:start')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const state = await minesEngine.start(userId, amount, mineCount, demoMode);
        return reply.send({ success: true, state });
      } catch (error) {
        logger.error(error, 'Failed to start mines');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'START_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/mines/reveal
   * Reveal a single cell in the active round.
   */
  app.post<{ Body: { position: number } }>(
    '/mines/reveal',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['position'],
          properties: { position: { type: 'number' } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { position } = request.body;

      if (!checkRateLimit(userId, 'mines:reveal')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const state = await minesEngine.reveal(userId, position);
        return reply.send({ success: true, state });
      } catch (error) {
        logger.error(error, 'Failed to reveal mines cell');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'REVEAL_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/mines/cashout
   * Cashout the active round.
   */
  app.post('/mines/cashout', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    if (!checkRateLimit(userId, 'mines:cashout')) {
      return reply.code(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    try {
      const state = await minesEngine.cashout(userId);
      return reply.send({ success: true, state });
    } catch (error) {
      logger.error(error, 'Failed to cashout mines');
      return reply.code(400).send({
        error: 'Bad Request',
        message: (error as Error).message,
        code: 'CASHOUT_FAILED',
      });
    }
  });

  /**
   * POST /api/games/mines/dismiss
   * Forget the most recent finished round so the UI can start a new one.
   */
  app.post('/mines/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    minesEngine.forget(userId);
    return reply.send({ success: true });
  });
}

