import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { authenticate, isAdminTelegramIdAsync, type AuthenticatedRequest } from '../middleware/auth.js';
import { CrashGameEngine } from '../games/crash/crash-engine.js';
import { minesEngine } from '../games/mines/mines-engine.js';
import {
  plinkoEngine,
  PLINKO_MULTIPLIERS,
  type PlinkoRisk,
} from '../games/plinko/plinko-engine.js';
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
import {
  bridgesEngine,
  BRIDGES_LEVELS,
  type BridgesLevel,
} from '../games/bridges/bridges-engine.js';
import { crashManager } from '../game-engine/crash-room-singleton.js';
import { logger } from '../utils/logger.js';
import { gameConfig, type GameType } from '../services/game-config.js';
import { getBlackjackRooms } from '../services/blackjack-room-store.js';
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
    'plinko',
    'coinflip',
    'wheel',
    'bridges',
    'blackjack',
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

  /**
   * GET /api/games/blackjack/rooms
   * Get list of blackjack rooms with current occupants
   */
  app.get(
    '/blackjack/rooms',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      if (!(await ensureVisible('blackjack', request as AuthenticatedRequest, reply))) return;
      try {
        const rooms = await getBlackjackRooms();
        return reply.send({ success: true, rooms });
      } catch (error) {
        logger.error(error, 'Failed to get blackjack rooms');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/games/blackjack/result
   * Save blackjack game result and update balance
   */
  app.post(
    '/blackjack/result',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const body = request.body as {
        bet: number;
        result: 'win' | 'lose' | 'push' | 'blackjack';
        payout: number;
        playerHand: { suit: string; rank: string }[];
        dealerHand: { suit: string; rank: string }[];
        mode: 'solo' | 'multi';
        roundId: string;
      };

      try {
        // Validate input
        if (!body.bet || !body.result || body.payout === undefined) {
          return reply.code(400).send({ error: 'Missing required fields' });
        }

        const bet = Math.max(0, Math.min(1_000_000, body.bet));
        const payout = Math.max(0, body.payout);

        // Create bet record
        const betRecord = {
          id: `bj_${Date.now()}_${randomUUID()}`,
          userId,
          gameId: body.roundId,
          roundId: body.roundId,
          amount: bet,
          state: 'pending' as const,
          placedAt: Date.now(),
          metadata: { gameType: 'blackjack', mode: body.mode },
        };

        // Process bet (deduct from balance)
        await bettingPipeline.processBet(betRecord, false);

        // Save game round
        await prisma.gameRound.create({
          data: {
            id: body.roundId,
            gameType: 'blackjack',
            state: 'completed',
            serverSeedHash: 'card_game_no_seed',
            startedAt: new Date(),
            endedAt: new Date(),
            metadata: { mode: body.mode, betAmount: bet },
            result: {
              result: body.result,
              payout,
              playerHand: body.playerHand,
              dealerHand: body.dealerHand,
            } as any,
          },
        }).catch((err) => logger.warn(err, 'Failed to record blackjack round'));

        // Process payout if won
        if (payout > 0) {
          await bettingPipeline.processPayout(betRecord, payout, false);
        } else if (body.result === 'push') {
          // Return bet on push
          await bettingPipeline.processPayout(betRecord, bet, false);
        } else {
          await bettingPipeline.processLoss(betRecord);
        }

        logger.info(
          { userId, roundId: body.roundId, result: body.result, bet, payout },
          'Blackjack round completed'
        );

        return reply.send({
          success: true,
          result: body.result,
          bet,
          payout,
        });
      } catch (error) {
        logger.error(error, 'Failed to process blackjack result');
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
   * lobby strip. Mirrors `/plinko/history`.
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

  /* ------------------------------------------------------------- plinko */

  /**
   * GET /api/games/plinko/config
   * Public-facing constants the UI needs to lay out the board (rows,
   * bucket count) and the multiplier table per risk tier.
   */
  app.get('/plinko/config', { preHandler: authenticate }, async (request, reply) => {
    if (!(await ensureVisible('plinko', request as AuthenticatedRequest, reply))) return;
    return reply.send({
      rows: 16,
      buckets: 17,
      risks: ['low', 'medium', 'high'],
      multipliers: PLINKO_MULTIPLIERS,
    });
  });

  /**
   * POST /api/games/plinko/drop
   * Resolve a single drop server-side and return the deterministic path
   * + bucket + payout. The frontend uses the path to animate the ball
   * along the same trajectory the server already committed to.
   */
  app.post<{
    Body: { amount: number; risk: PlinkoRisk };
  }>(
    '/plinko/drop',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'risk'],
          properties: {
            amount: { type: 'number' },
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, risk } = request.body;

      if (!(await ensureVisible('plinko', request as AuthenticatedRequest, reply))) return;

      if (!checkRateLimit(userId, 'plinko:drop')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const result = await plinkoEngine.drop(userId, amount, risk);
        return reply.send({ success: true, result });
      } catch (error) {
        logger.error(error, 'Failed to drop plinko ball');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'PLINKO_DROP_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/plinko/settle
   * Phase 2 of the plinko flow — credits the payout once the client
   * has finished animating the ball into its bucket. Idempotent: a
   * client that has already settled a roundId gets `alreadySettled:
   * true` and the previously-credited payout, no double-credit.
   */
  app.post<{ Body: { roundId: string } }>(
    '/plinko/settle',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['roundId'],
          properties: { roundId: { type: 'string', minLength: 8 } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { roundId } = request.body;

      if (!(await ensureVisible('plinko', request as AuthenticatedRequest, reply))) return;

      try {
        const result = await plinkoEngine.settle(userId, roundId);
        return reply.send({ success: true, ...result });
      } catch (error) {
        logger.error(error, 'Failed to settle plinko round');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'PLINKO_SETTLE_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/games/plinko/history
   * Recent winning drops across all players (live ticker on the lobby).
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/plinko/history',
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
      if (!(await ensureVisible('plinko', request as AuthenticatedRequest, reply))) return;
      const limit = Math.min(parseInt(request.query.limit || '20', 10), 50);
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            gameType: 'plinko',
            payout: { not: null },
            multiplier: { not: null },
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
          multiplier: Number(b.multiplier),
          payout: Number(b.payout),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));

        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch plinko history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'history fetch failed',
        });
      }
    }
  );

  /**
   * GET /api/games/plinko/my-big-wins
   * The current player's recent drops with multiplier ≥ 5x. Powers the
   * "your highlight reel" strip the page renders above the live feed.
   */
  app.get<{ Querystring: { limit?: string } }>(
    '/plinko/my-big-wins',
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
      if (!(await ensureVisible('plinko', request as AuthenticatedRequest, reply))) return;
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 30);
      try {
        const bets = await app.prisma.bet.findMany({
          where: {
            userId,
            gameType: 'plinko',
            payout: { not: null },
            multiplier: { gte: 5 },
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
          multiplier: Number(b.multiplier),
          payout: Number(b.payout),
          timestamp: (b.resolvedAt ?? b.placedAt).getTime(),
        }));

        return reply.send({ success: true, history });
      } catch (error) {
        logger.error(error, 'Failed to fetch player plinko big wins');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'my-big-wins fetch failed',
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

  /* ============================================================== Bridges */

  /**
   * GET /api/games/bridges/state — current per-user round, if any.
   */
  app.get('/bridges/state', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('bridges', request as AuthenticatedRequest, reply))) return;
    return reply.send({ success: true, state: bridgesEngine.getState(userId) });
  });

  /**
   * POST /api/games/bridges/start — begin a new round at the given level.
   * Body: { amount: number; level: 'easy' | 'medium' | 'hard' }
   */
  app.post<{ Body: { amount: number; level: BridgesLevel } }>(
    '/bridges/start',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'level'],
          properties: {
            amount: { type: 'number' },
            level: { type: 'string', enum: BRIDGES_LEVELS },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, level } = request.body;

      if (!(await ensureVisible('bridges', request as AuthenticatedRequest, reply))) return;
      if (!checkRateLimit(userId, 'bridges:start')) {
        return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
      }
      try {
        const state = await bridgesEngine.start(userId, amount, level);
        return reply.send({ success: true, state });
      } catch (error) {
        logger.error(error, 'bridges:start failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'BRIDGES_START_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/bridges/step — pick a cell in the current row.
   * Body: { col: 0..3 }
   */
  app.post<{ Body: { col: number } }>(
    '/bridges/step',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['col'],
          properties: { col: { type: 'integer', minimum: 0, maximum: 3 } },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { col } = request.body;
      if (!(await ensureVisible('bridges', request as AuthenticatedRequest, reply))) return;
      if (!checkRateLimit(userId, 'bridges:step')) {
        return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
      }
      try {
        const state = await bridgesEngine.step(userId, col);
        return reply.send({ success: true, state });
      } catch (error) {
        logger.error(error, 'bridges:step failed');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'BRIDGES_STEP_FAILED',
        });
      }
    }
  );

  /**
   * POST /api/games/bridges/cashout — bank the current multiplier.
   * Disabled until at least one row has been crossed.
   */
  app.post('/bridges/cashout', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('bridges', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'bridges:cashout')) {
      return reply.code(429).send({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' });
    }
    try {
      const state = await bridgesEngine.cashout(userId);
      return reply.send({ success: true, state });
    } catch (error) {
      logger.error(error, 'bridges:cashout failed');
      return reply.code(400).send({
        error: 'Bad Request',
        message: (error as Error).message,
        code: 'BRIDGES_CASHOUT_FAILED',
      });
    }
  });

  /**
   * POST /api/games/bridges/dismiss — clear a finished round so the
   * UI can start a fresh one.
   */
  app.post('/bridges/dismiss', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    if (!(await ensureVisible('bridges', request as AuthenticatedRequest, reply))) return;
    bridgesEngine.forget(userId);
    return reply.send({ success: true });
  });
}

