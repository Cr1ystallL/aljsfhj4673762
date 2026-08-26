import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { authenticate, isAdminTelegramIdAsync, type AuthenticatedRequest } from '../middleware/auth.js';
import { CrashGameEngine } from '../games/crash/crash-engine.js';
import { minesEngine } from '../games/mines/mines-engine.js';
import {
  coinflipEngine,
  type CoinSide,
} from '../games/coinflip/coinflip-engine.js';
import {
  wheelEngine,
  WHEEL_LAYOUT,
  WHEEL_VALUES,
  type WheelMultiplier,
} from '../games/wheel/wheel-engine.js';
import { hiloEngine } from '../games/hilo/hilo-engine.js';
import { casesEngine } from '../games/cases/cases-engine.js';
import { macvpotManager } from '../games/macvpot/macvpot-singleton.js';
import { CASES, getCases } from '../games/cases/config.js';
import { crashManager } from '../game-engine/crash-room-singleton.js';
import { logger } from '../utils/logger.js';
import { gameConfig, type GameType } from '../services/game-config.js';
import { bettingPipeline } from '../game-engine/betting-pipeline.js';
import { prisma } from '../lib/prisma.js';

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
const RATE_LIMIT_MAX = 500; // Hardcoded soft limit instead of env to avoid misconfiguration

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

// Game room manager + default crash room are imported from
// `crash-room-singleton.ts` so the admin "Restart engine" action can
// rebuild the room without bouncing the whole Node process.

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  async function ensureVisible(
    gameType: GameType,
    request: AuthenticatedRequest,
    reply: any
  ): Promise<boolean> {
    const cfg = await gameConfig.get(gameType);
    const isAdmin = await isAdminTelegramIdAsync(request.user.telegramId);
    if (cfg.hidden && !isAdmin) {
      await logger.warn({ gameType, userId: request.user.userId }, 'Hidden game access blocked');
      await reply.code(404).send({ error: 'Not Found' });
      return false;
    }
    return true;
  }

  const gameTypes: GameType[] = [
    'crash',
    'mines',
    'coinflip',
    'wheel',
    'blackjack',
    'hilo',
    'cases',
    'macvpot',
  ];

  app.get('/availability', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as AuthenticatedRequest;
    const isAdmin = await isAdminTelegramIdAsync(user.telegramId);
    const games = await Promise.all(
      gameTypes.map(async (t) => {
        const cfg = await gameConfig.get(t);
        return { gameType: t, hidden: !!cfg.hidden, paused: !!cfg.paused };
      })
    );
    return reply.send({ ok: true, isAdmin, games });
  });

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
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, slot = 0, autoCashout = null } = request.body;

      if (!(await ensureVisible('crash', request as AuthenticatedRequest, reply))) return;

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
        const bet = await engine.placeCrashBet(userId, slot, amount, autoCashout, false);

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

      if (!(await ensureVisible('crash', request as AuthenticatedRequest, reply))) return;

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

      if (!(await ensureVisible('crash', request as AuthenticatedRequest, reply))) return;

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
      if (!(await ensureVisible('crash', request as AuthenticatedRequest, reply))) return;
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
    if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;
    const state = minesEngine.getState(userId);
    return reply.send({ state });
  });

  /**
   * POST /api/games/mines/start
   * Start a new mines round.
   */
  app.post<{
    Body: { amount: number; mineCount: number };
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
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, mineCount } = request.body;

      if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;

      if (!checkRateLimit(userId, 'mines:start')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const state = await minesEngine.start(userId, amount, mineCount, false);
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

      if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;

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

    if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;

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
    if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;
    minesEngine.forget(userId);
    return reply.send({ success: true });
  });

  /**
   * GET /api/games/mines/my-history
   * The current player's last completed mines bets — used by the page
   * to render the horizontal "last 5" strip under the bet panel.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/mines/my-history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: { limit: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const limit = Math.min(parseInt(request.query.limit || '5', 10), 20);
      if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            userId,
            gameType: 'mines',
            payout: { not: null },
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: limit,
          select: {
            id: true,
            amount: true,
            payout: true,
            multiplier: true,
            placedAt: true,
            resolvedAt: true,
          },
        });
        const history = bets.map((b) => ({
          id: b.id,
          betAmount: Number(b.amount),
          multiplier: Number(b.multiplier ?? 0),
          payout: Number(b.payout ?? 0),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));
        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch mines my-history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'history fetch failed',
        });
      }
    }
  );

  /**
   * GET /api/games/mines/history
   * Recent mines bets across all players — sampled live ticker for the
   * lobby strip.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/mines/history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: { limit: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      if (!(await ensureVisible('mines', request as AuthenticatedRequest, reply))) return;
      const limit = Math.min(parseInt(request.query.limit || '20', 10), 50);
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            gameType: 'mines',
            payout: { not: null },
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: limit,
          select: {
            id: true,
            amount: true,
            payout: true,
            multiplier: true,
            placedAt: true,
            resolvedAt: true,
            user: {
              select: {
                firstName: true,
                username: true,
                photoUrl: true,
                telegramId: true,
              },
            },
          },
        });
        const history = bets.map((b) => ({
          id: b.id,
          name:
            b.user.firstName ||
            b.user.username ||
            `id${b.user.telegramId.toString().slice(-4)}`,
          photoUrl: b.user.photoUrl ?? null,
          betAmount: Number(b.amount),
          multiplier: Number(b.multiplier ?? 0),
          payout: Number(b.payout ?? 0),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));
        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch mines history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'history fetch failed',
        });
      }
    }
  );

  /* ----------------------------------------------------------- coinflip */

  /**
   * GET /api/games/coinflip/config
   * Public-facing constants for the multiply mode UI.
   */
  app.get('/coinflip/config', { preHandler: authenticate }, async (request, reply) => {
    if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
    return reply.send({
      multipliers: coinflipEngine.getMultipliers(),
      modes: ['quick', 'multiply'],
    });
  });

  /**
   * GET /api/games/coinflip/state
   * Resume the user's active multiply session if any.
   */
  app.get(
    '/coinflip/state',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
      const state = coinflipEngine.getState(userId);
      return reply.send({ state });
    }
  );

  /**
   * POST /api/games/coinflip/quick
   * Single-shot toss. Returns the outcome immediately.
   */
  app.post<{ Body: { amount: number; choice: CoinSide } }>(
    '/coinflip/quick',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'choice'],
          properties: {
            amount: { type: 'number' },
            choice: { type: 'string', enum: ['heads', 'tails'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, choice } = request.body;

      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;

      if (!checkRateLimit(userId, 'coinflip:quick')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const result = await coinflipEngine.playQuick(userId, amount, choice);
        return reply.send({ success: true, result });
      } catch (error) {
        logger.error(error, 'coinflip quick failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'COINFLIP_QUICK_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/coinflip/start
   * Start a multiply session. The first call also picks the first side
   * and resolves the first toss in one round-trip.
   */
  app.post<{ Body: { amount: number; choice: CoinSide } }>(
    '/coinflip/start',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'choice'],
          properties: {
            amount: { type: 'number' },
            choice: { type: 'string', enum: ['heads', 'tails'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, choice } = request.body;

      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
      if (!checkRateLimit(userId, 'coinflip:start')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const result = await coinflipEngine.startMultiply(userId, amount, choice);
        return reply.send({ success: true, ...result });
      } catch (error) {
        logger.error(error, 'coinflip start failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'COINFLIP_START_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/coinflip/flip
   * Pick a side for the next round of an active multiply session.
   */
  app.post<{ Body: { choice: CoinSide } }>(
    '/coinflip/flip',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['choice'],
          properties: {
            choice: { type: 'string', enum: ['heads', 'tails'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { choice } = request.body;

      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;

      if (!checkRateLimit(userId, 'coinflip:flip')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const result = await coinflipEngine.flip(userId, choice);
        return reply.send({ success: true, ...result });
      } catch (error) {
        logger.error(error, 'coinflip flip failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'COINFLIP_FLIP_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/coinflip/cashout
   * Lock in the current cumulative multiplier and pay out.
   */
  app.post(
    '/coinflip/cashout',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      if (!checkRateLimit(userId, 'coinflip:cashout')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
        const state = await coinflipEngine.cashout(userId);
        return reply.send({ success: true, state });
      } catch (error) {
        logger.error(error, 'coinflip cashout failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'COINFLIP_CASHOUT_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/coinflip/dismiss
   * Forget a finished multiply session so the UI can start a fresh one.
   */
  app.post(
    '/coinflip/dismiss',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
      coinflipEngine.forget(userId);
      return reply.send({ success: true });
    }
  );

  /**
   * GET /api/games/coinflip/history
   * Recent drops across all players. Sampled live ticker for the lobby.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/coinflip/history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: { limit: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      if (!(await ensureVisible('coinflip', request as AuthenticatedRequest, reply))) return;
      const limit = Math.min(parseInt(request.query.limit || '40', 10), 60);
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            gameType: 'coinflip',
            payout: { not: null },
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: limit,
          select: {
            id: true,
            amount: true,
            payout: true,
            multiplier: true,
            placedAt: true,
            resolvedAt: true,
            user: {
              select: {
                firstName: true,
                username: true,
                photoUrl: true,
                telegramId: true,
              },
            },
          },
        });

        const history = bets.map((b) => ({
          id: b.id,
          name:
            b.user.firstName ||
            b.user.username ||
            `id${b.user.telegramId.toString().slice(-4)}`,
          photoUrl: b.user.photoUrl ?? null,
          betAmount: Number(b.amount),
          multiplier: Number(b.multiplier ?? 0),
          payout: Number(b.payout ?? 0),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));

        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch coinflip history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'history fetch failed',
        });
      }
    }
  );

  /* ================================================================ Wheel */

  /**
   * GET /api/games/wheel/state — live snapshot used by the page.
   * Polled every 1 s while waiting / completed, every 250 ms while
   * spinning so the wheel locks onto its segment crisply.
   */
  app.get('/wheel/state', { preHandler: authenticate }, async (request, reply) => {
    if (!(await ensureVisible('wheel', request as AuthenticatedRequest, reply))) return;
    return reply.send({
      success: true,
      state: wheelEngine.getSnapshot(),
      layout: WHEEL_LAYOUT,
      values: WHEEL_VALUES,
      serverTime: Date.now(),
    });
  });

  /**
   * POST /api/games/wheel/bet — pick a multiplier slot for the round.
   * Body: { amount: number; pick: 1 | 2 | 3 | 5 | 30 }
   */
  app.post<{ Body: { amount: number; pick: WheelMultiplier } }>(
    '/wheel/bet',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'pick'],
          properties: {
            amount: { type: 'number' },
            pick: { type: 'number', enum: [1, 2, 3, 5, 30] },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, pick } = request.body;

      if (!(await ensureVisible('wheel', request as AuthenticatedRequest, reply))) return;

      if (!checkRateLimit(userId, 'wheel:bet')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const u = await app.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, username: true, photoUrl: true },
        });
        const out = await wheelEngine.placeBet(userId, amount, pick, u);
        return reply.send({ success: true, ...out });
      } catch (error) {
        logger.error(error, 'wheel:bet failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'WHEEL_BET_FAILED',
        });
      }
    }
  );

  // ==========================================
  // HI-LO API
  // ==========================================

  app.get('/hilo/state', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    const state = await hiloEngine.getState(userId);
    return reply.send({ ok: true, state });
  });

  app.post('/hilo/swap', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:swap')) return reply.status(429).send({ error: 'Too many requests' });
    try {
      const state = await hiloEngine.swap(userId);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      console.error('Hilo Swap Error:', err);
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/hilo/start', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:start')) return reply.status(429).send({ error: 'Too many requests' });

    const { amount } = request.body as { amount: number };
    try {
      const state = await hiloEngine.start(userId, amount);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/hilo/guess', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:guess')) return reply.status(429).send({ error: 'Too many requests' });

    const { choice } = request.body as { choice: 'red' | 'black' | 'higher' | 'lower' };
    if (!['red', 'black', 'higher', 'lower'].includes(choice)) {
      return reply.status(400).send({ error: 'Invalid choice' });
    }

    try {
      const state = await hiloEngine.guess(userId, choice);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/hilo/cashout', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:cashout')) return reply.status(429).send({ error: 'Too many requests' });

    try {
      const state = await hiloEngine.cashout(userId);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      console.error('Hilo Cashout Error:', err);
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/hilo/my-history', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { limit = '10' } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);

    try {
      const bets = await app.prisma.bet.findMany({
        where: { userId, gameType: 'hilo', payout: { not: null } },
        orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
        take: parsedLimit,
        select: { id: true, amount: true, payout: true, multiplier: true, placedAt: true, resolvedAt: true }
      });
      const history = bets.map((b) => ({
        id: b.id, name: 'You', photoUrl: null,
        betAmount: Number(b.amount), multiplier: Number(b.multiplier ?? 0), payout: Number(b.payout ?? 0), timestamp: (b.resolvedAt ?? b.placedAt).getTime()
      }));
      return reply.send({ success: true, history });
    } catch (error) {
      logger.error(error, 'Failed to fetch hilo my-history');
      return reply.status(500).send({ success: false, message: 'history fetch failed' });
    }
  });

  app.get('/hilo/history', { preHandler: authenticate }, async (request, reply) => {
    const { limit = '20' } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

    try {
      const bets = await app.prisma.bet.findMany({
        where: { gameType: 'hilo', payout: { not: null } },
        orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
        take: parsedLimit,
        select: {
          id: true, amount: true, payout: true, multiplier: true, placedAt: true, resolvedAt: true,
          user: { select: { firstName: true, username: true, photoUrl: true, telegramId: true } }
        }
      });
      const history = bets.map((b) => ({
        id: b.id, name: b.user.firstName || b.user.username || `id${b.user.telegramId.toString().slice(-4)}`, photoUrl: b.user.photoUrl ?? null,
        betAmount: Number(b.amount), multiplier: Number(b.multiplier ?? 0), payout: Number(b.payout ?? 0), timestamp: (b.resolvedAt ?? b.placedAt).getTime()
      }));
      return reply.send({ success: true, history });
    } catch (error) {
      logger.error(error, 'Failed to fetch hilo history');
      return reply.status(500).send({ success: false, message: 'history fetch failed' });
    }
  });

  /* -------------------------------------------------------------------------
   * Keno
   * ---------------------------------------------------------------------- */
  app.post<{
    Body: { betAmount: number; picks: number[]; risk: 'classic' | 'low' | 'medium' | 'high' };
  }>('/keno/bet', { preHandler: authenticate }, async (req, reply) => {
    const request = req as AuthenticatedRequest;
    const { betAmount, picks, risk } = request.body as { betAmount: number; picks: number[]; risk: 'classic' | 'low' | 'medium' | 'high' };
    if (!await ensureVisible('keno', request, reply)) return;
    if (!checkRateLimit(request.user.userId, 'keno_bet')) {
      return reply.status(429).send({ error: 'Too many requests' });
    }

    try {
      const { kenoEngine } = await import('../games/keno/keno-engine.js');
      const result = await kenoEngine.processBet(request.user.userId, {
        amount: betAmount,
        currency: 'TON', // Defaulting to TON as per platform standard, could be passed in
        picks,
        risk,
      });
      return reply.send({ success: true, result });
    } catch (error: any) {
      logger.error({ err: error, userId: request.user.userId }, 'Keno bet failed');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Bet failed',
      });
    }
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/keno/history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: { limit: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      if (!(await ensureVisible('keno', request as AuthenticatedRequest, reply))) return;
      const limit = Math.min(parseInt(request.query.limit || '20', 10), 50);
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            gameType: 'keno',
            payout: { not: null },
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: limit,
          select: {
            id: true,
            amount: true,
            payout: true,
            multiplier: true,
            placedAt: true,
            resolvedAt: true,
            user: {
              select: {
                firstName: true,
                username: true,
                photoUrl: true,
                telegramId: true,
              },
            },
          },
        });

        const history = bets.map((b) => ({
          id: b.id,
          name:
            b.user.firstName ||
            b.user.username ||
            `id${b.user.telegramId.toString().slice(-4)}`,
          photoUrl: b.user.photoUrl ?? null,
          betAmount: Number(b.amount),
          multiplier: Number(b.multiplier ?? 0),
          payout: Number(b.payout ?? 0),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));

        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch keno history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'history fetch failed',
        });
      }
    }
  );

  /* -------------------------------------------------------------------------
   * Provably Fair Round Info
   * ---------------------------------------------------------------------- */
  app.get<{ Params: { id: string } }>(
    '/round/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { prisma } = await import('../lib/prisma.js');
        const round = await prisma.gameRound.findUnique({
          where: { id },
        });

        if (!round) {
          return reply.status(404).send({ message: 'Раунд не найден' });
        }

        // Only return sensitive data if round is completed
        const isCompleted = round.state === 'completed' || round.gameType === 'crash'; // crash doesn't strictly update GameRound on completion right now? Oh wait, it does not use prisma.gameRound. Wait, does Crash use GameRound?

        return reply.send({
          id: round.id,
          gameType: round.gameType,
          state: round.state,
          serverSeedHash: round.serverSeedHash,
          clientSeed: round.clientSeed,
          nonce: round.nonce,
          startedAt: round.startedAt,
          endedAt: round.endedAt,
          serverSeed: round.state === 'completed' ? round.serverSeed : null,
          result: round.result,
        });
      } catch (err) {
        request.log.error(err, 'Failed to fetch round details');
        return reply.status(500).send({ message: 'Internal server error' });
      }
    }
  );

  /* -------------------------------------------------------------- cases */
  
  app.get('/cases/config', { preHandler: authenticate }, async (request, reply) => {
    const cfg = await gameConfig.get('cases');
    const customWeights = cfg.extras?.casesWeights as Record<string, number[]> | undefined;
    const customPrices = cfg.extras?.casesPrices as number[] | undefined;
    return reply.send({ cases: getCases(customWeights, customPrices) });
  });

  app.post<{ Body: { caseId: string; count: number; clientSeed?: string } }>(
    '/cases/open',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['caseId', 'count'],
          properties: {
            caseId: { type: 'string' },
            count: { type: 'number', minimum: 1, maximum: 3 },
            clientSeed: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { caseId, count, clientSeed } = request.body;

      if (!checkRateLimit(userId, 'cases:open')) {
        return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
      }

      try {
        const cSeed = clientSeed || `cases_${Date.now()}`;
        const result = await casesEngine.openCases(userId, caseId, count, cSeed);
        return reply.send({ success: true, result });
      } catch (error) {
        logger.error(error, 'Failed to open cases');
        return reply.code(400).send({ error: 'Bad Request', message: (error as Error).message });
      }
    }
  );

  app.get<{ Querystring: { limit?: string } }>(
    '/cases/history',
    {
      preHandler: authenticate,
      schema: { querystring: { type: 'object', properties: { limit: { type: 'string' } } } }
    },
    async (request, reply) => {
      const limit = Math.min(parseInt(request.query.limit || '20', 10), 50);
      try {
        const bets = await app.prisma.bet.findMany({
          where: { 
            gameType: 'cases', 
            payout: { not: null },
            resolvedAt: { lte: new Date(Date.now() - 6000) }
          },
          orderBy: [{ resolvedAt: 'desc' }, { placedAt: 'desc' }],
          take: limit,
          select: {
            id: true, amount: true, payout: true, placedAt: true, resolvedAt: true,
            metadata: true,
            user: { select: { firstName: true, username: true, photoUrl: true, telegramId: true } },
          },
        });
        
        // Read the live tiers rather than the module-level defaults, otherwise
        // renamed or repriced cases show stale names in the feed.
        const cfg = await gameConfig.get('cases');
        const cases = getCases(
          cfg.extras?.casesWeights as Record<string, number[]> | undefined,
          cfg.extras?.casesPrices as number[] | undefined
        );

        const history = bets.map(b => {
          const meta = b.metadata as any;
          const caseData = cases.find(c => c.id === meta?.caseId);
          const prizeData = caseData?.prizes.find(p => p.id === meta?.prizeId);

          return {
            id: b.id,
            name: b.user.firstName || b.user.username || `id${b.user.telegramId.toString().slice(-4)}`,
            photoUrl: b.user.photoUrl ?? null,
            betAmount: Number(b.amount),
            payout: Number(b.payout ?? 0),
            timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
            caseId: meta?.caseId,
            caseName: caseData?.name,
            casePrice: caseData?.price,
            prizeId: meta?.prizeId,
            prizeColor: prizeData?.color
          };
        });
        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch cases history');
        return reply.code(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  /* -------------------------------------------------------------------------- */
  /* MacvPot (Jackpot) endpoints                                                */
  /* -------------------------------------------------------------------------- */

  app.get('/macvpot/state', async (request, reply) => {
    return reply.send({ success: true, state: macvpotManager.getSnapshot() });
  });

  app.post('/macvpot/bet', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { amount } = request.body as { amount: number };

    if (!(await ensureVisible('macvpot', request as AuthenticatedRequest, reply))) return;

    if (!checkRateLimit(userId, 'macvpot:bet')) {
      return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
    }

    const res = await macvpotManager.placeBet(userId, Number(amount), false);
    if (!res.success) {
      return reply.code(400).send({ error: res.error });
    }

    return reply.send({ success: true, participant: res.participant });
  });

  app.post('/macvpot/cancel-bet', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    if (!(await ensureVisible('macvpot', request as AuthenticatedRequest, reply))) return;

    if (!checkRateLimit(userId, 'macvpot:cancel-bet')) {
      return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
    }

    const res = await macvpotManager.cancelBet(userId, false);
    if (!res.success) {
      return reply.code(400).send({ error: res.error });
    }

    return reply.send({ success: true });
  });

  /* -------------------------------------------------------------------------- */
  /* Blackjack state snapshot endpoint                                          */
  /* -------------------------------------------------------------------------- */

  app.get('/blackjack/state', async (request, reply) => {
    const { roomId = 'bj_table_1' } = (request.query as { roomId?: string }) || {};
    const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
    const table = blackjackSingleton.getTable(roomId);
    if (!table) {
      return reply.code(404).send({ error: 'Table not found' });
    }
    return reply.send({ success: true, roomId: table.getRoomId(), state: table.getState(), chat: table.getChatHistory() });
  });

  // Blackjack automatic room matchmaking (routes to free table or creates new one if full)
  app.get('/blackjack/matchmake', async (request, reply) => {
    try {
      const { userId } = await resolveBjUser(request);
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const table = blackjackSingleton.findAvailableTable(userId);
      return reply.send({
        success: true,
        roomId: table.getRoomId(),
        state: table.getState(),
        chat: table.getChatHistory(),
      });
    } catch (err: any) {
      logger.error({ err }, 'Blackjack matchmake error, fallback to main table');
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const main = blackjackSingleton.getMainTable();
      return reply.send({
        success: true,
        roomId: 'bj_table_1',
        state: main.getState(),
        chat: main.getChatHistory(),
      });
    }
  });

  // Blackjack Table History (Provably Fair recent rounds)
  app.get('/blackjack/history', async (request, reply) => {
    try {
      const { roomId = 'bj_table_1' } = (request.query as { roomId?: string }) || {};
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const table = blackjackSingleton.getTable(roomId);
      if (!table) {
        return reply.code(404).send({ ok: false, error: 'Table not found' });
      }
      return reply.send({ ok: true, roomId, history: table.getHistory() });
    } catch (err: any) {
      logger.error({ err }, 'Failed to fetch blackjack history');
      return reply.send({ ok: true, history: [] });
    }
  });

  // Blackjack Public / Admin Tables List
  app.get('/blackjack/tables', async (_request, reply) => {
    try {
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const tables = blackjackSingleton.getAllTablesSummary();
      return reply.send({ ok: true, tables });
    } catch (err: any) {
      logger.error({ err }, 'Blackjack tables list failed');
      return reply.send({ ok: true, tables: [] });
    }
  });

  // Blackjack Admin Live Tables Monitor
  app.get('/blackjack/admin/tables', async (_request, reply) => {
    try {
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const tables = blackjackSingleton.getAllTablesSummary();
      return reply.send({ ok: true, tables });
    } catch (err: any) {
      logger.error({ err }, 'Blackjack admin tables failed');
      return reply.send({ ok: true, tables: [] });
    }
  });

  // Blackjack Admin Create New Table
  app.post('/blackjack/admin/create-table', async (request, reply) => {
    try {
      const { roomId } = (request.body as { roomId?: string }) || {};
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      let targetRoomId = roomId;
      if (!targetRoomId) {
        let idx = 1;
        const all = blackjackSingleton.getAllRooms();
        while (all.some((r) => r.getRoomId() === `bj_table_${idx}`)) {
          idx++;
        }
        targetRoomId = `bj_table_${idx}`;
      }
      const table = blackjackSingleton.getTable(targetRoomId);
      return reply.send({ ok: true, roomId: table.getRoomId(), state: table.getState() });
    } catch (err: any) {
      logger.error({ err }, 'Blackjack create table failed');
      return reply.code(500).send({ ok: false, error: err.message || 'Failed to create table' });
    }
  });

  // Blackjack Admin Reset Table
  app.post('/blackjack/admin/reset-table', async (request, reply) => {
    try {
      const { roomId = 'bj_table_1' } = (request.body as { roomId?: string }) || {};
      const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
      const table = blackjackSingleton.getTable(roomId);
      if (table) {
        table.destroy();
      }
      const freshTable = blackjackSingleton.getTable(roomId);
      return reply.send({ ok: true, roomId: freshTable.getRoomId(), state: freshTable.getState() });
    } catch (err: any) {
      logger.error({ err }, 'Blackjack reset table failed');
      return reply.code(500).send({ ok: false, error: err.message || 'Failed to reset table' });
    }
  });

  // Helper to resolve user in blackjack routes
  async function resolveBjUser(request: any): Promise<{ userId: string; name: string; avatar?: string }> {
    let userId: string | undefined = request.user?.userId;
    const body = request.body || {};

    if (!userId && body.userId) {
      userId = body.userId;
    }

    if (!userId) {
      try {
        const authHeader = request.headers.authorization;
        if (authHeader) {
          const token = authHeader.replace(/^Bearer\s+/i, '');
          const decoded = (request.server.jwt as any)?.verify(token) as any;
          if (decoded?.userId) userId = decoded.userId;
        }
      } catch {}
    }

    const finalUserId = userId || 'anon_' + randomUUID().slice(0, 8);
    let name = 'Игрок';
    let avatar: string | undefined;

    if (userId && !userId.startsWith('guest_') && !userId.startsWith('anon_')) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, username: true, photoUrl: true },
        });
        if (dbUser) {
          name = dbUser.firstName || dbUser.username || 'Игрок';
          avatar = dbUser.photoUrl || undefined;
        }
      } catch {}
    }

    return { userId: finalUserId, name, avatar };
  }

  // Blackjack REST Join Seat
  app.post('/blackjack/join', async (request, reply) => {
    const { userId, name, avatar } = await resolveBjUser(request);
    const { roomId = 'bj_table_1', seatId, bet = 0 } = (request.body as {
      roomId?: string;
      seatId: number;
      bet?: number;
    }) || {};

    const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
    const table = blackjackSingleton.getTable(roomId);
    const success = table.join(userId, name, avatar, seatId, bet);

    return reply.send({ success, state: table.getState() });
  });

  // Blackjack REST Leave Seat
  app.post('/blackjack/leave', async (request, reply) => {
    const { userId } = await resolveBjUser(request);
    const { roomId = 'bj_table_1' } = (request.body as { roomId?: string }) || {};

    const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
    const table = blackjackSingleton.getTable(roomId);
    table.leave(userId);

    return reply.send({ success: true, state: table.getState() });
  });

  // Blackjack REST Update Bet
  app.post('/blackjack/bet', async (request, reply) => {
    const { userId } = await resolveBjUser(request);
    const { roomId = 'bj_table_1', bet = 0 } = (request.body as { roomId?: string; bet: number }) || {};

    const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
    const table = blackjackSingleton.getTable(roomId);
    const success = table.updateBet(userId, bet);

    return reply.send({ success, state: table.getState() });
  });

  // Blackjack REST Action
  app.post('/blackjack/action', async (request, reply) => {
    const { userId } = await resolveBjUser(request);
    const { roomId = 'bj_table_1', action } = (request.body as { roomId?: string; action: 'hit' | 'stand' | 'double' }) || {};

    const { blackjackSingleton } = await import('../games/blackjack/blackjack-singleton.js');
    const table = blackjackSingleton.getTable(roomId);
    let success = false;
    if (action === 'hit') success = await table.hit(userId);
    else if (action === 'stand') success = await table.stand(userId);
    else if (action === 'double') success = await table.double(userId);

    return reply.send({ success, state: table.getState() });
  });
}


