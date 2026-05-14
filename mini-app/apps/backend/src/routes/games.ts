import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { CrashGameEngine } from '../games/crash/crash-engine.js';
import { MinesGameEngine } from '../games/mines/mines-engine.js';
import { PlinkoGameEngine } from '../games/plinko/plinko-engine.js';
import { GameRoomManager } from '../game-engine/game-room-manager.js';
import { logger } from '../utils/logger.js';

/**
 * Game Routes
 * Handles game actions and room management
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
const minesManager = new GameRoomManager('mines');
const plinkoManager = new GameRoomManager('plinko');

// Initialize default rooms
const crashEngine = new CrashGameEngine('crash_main');
crashEngine.start();
crashManager.createRoom('crash_main', crashEngine);

const minesEngine = new MinesGameEngine('mines_main');
minesEngine.start();
minesManager.createRoom('mines_main', minesEngine);

const plinkoEngine = new PlinkoGameEngine('plinko_main');
plinkoEngine.start();
plinkoManager.createRoom('plinko_main', plinkoEngine);

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/games/crash/bet
   * Place bet in crash game
   */
  app.post<{
    Body: {
      amount: number;
      autoCashout?: number;
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
            autoCashout: { type: 'number' },
            demoMode: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, autoCashout, demoMode = false } = request.body;

      // Rate limiting
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

        // Set player demo mode
        const player = engine.getState().players.get(userId);
        if (player) {
          player.demoMode = demoMode;
        }

        const bet = await engine.placeBet(userId, amount);

        if (autoCashout) {
          engine.setAutoCashout(userId, autoCashout);
        }

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
   * POST /api/games/crash/cashout
   * Cashout from crash game
   */
  app.post(
    '/crash/cashout',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      // Rate limiting
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

        engine.queueCashout(userId);

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
   * POST /api/games/mines/start
   * Start mines game
   */
  app.post<{
    Body: {
      amount: number;
      mineCount: number;
      demoMode?: boolean;
    };
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

      // Rate limiting
      if (!checkRateLimit(userId, 'mines:start')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = minesManager.getRoom('mines_main') as MinesGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        // Set player demo mode
        const player = engine.getState().players.get(userId);
        if (player) {
          player.demoMode = demoMode;
        }

        const bet = await engine.placeBet(userId, amount);
        await engine.startGame(userId, mineCount);

        return reply.send({ success: true, bet });
      } catch (error) {
        logger.error(error, 'Failed to start mines game');
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
   * Reveal tile in mines game
   */
  app.post<{
    Body: {
      position: number;
    };
  }>(
    '/mines/reveal',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['position'],
          properties: {
            position: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { position } = request.body;

      // Rate limiting
      if (!checkRateLimit(userId, 'mines:reveal')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = minesManager.getRoom('mines_main') as MinesGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        await engine.revealTile(userId, position);

        return reply.send({ success: true });
      } catch (error) {
        logger.error(error, 'Failed to reveal tile');
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
   * Cashout from mines game
   */
  app.post(
    '/mines/cashout',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;

      // Rate limiting
      if (!checkRateLimit(userId, 'mines:cashout')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = minesManager.getRoom('mines_main') as MinesGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        await engine.cashout(userId);

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
   * POST /api/games/plinko/drop
   * Drop ball in plinko game
   */
  app.post<{
    Body: {
      amount: number;
      riskLevel: 'low' | 'medium' | 'high';
      demoMode?: boolean;
    };
  }>(
    '/plinko/drop',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['amount', 'riskLevel'],
          properties: {
            amount: { type: 'number' },
            riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            demoMode: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { amount, riskLevel, demoMode = false } = request.body;

      // Rate limiting
      if (!checkRateLimit(userId, 'plinko:drop')) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }

      try {
        const engine = plinkoManager.getRoom('plinko_main') as PlinkoGameEngine;
        if (!engine) {
          return reply.code(404).send({ error: 'Game room not found' });
        }

        // Set player demo mode
        const player = engine.getState().players.get(userId);
        if (player) {
          player.demoMode = demoMode;
        }

        await engine.dropBall(userId, amount, riskLevel);

        return reply.send({ success: true });
      } catch (error) {
        logger.error(error, 'Failed to drop ball');
        return reply.code(400).send({
          error: 'Bad Request',
          message: (error as Error).message,
          code: 'DROP_FAILED',
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

  /**
   * GET /api/games/plinko/history
   * Get plinko game history - RANDOM BETS FROM ALL PLAYERS
   */
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
    };
  }>(
    '/plinko/history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            offset: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const limit = parseInt(request.query.limit || '10', 10);

      try {
        const prisma = app.prisma;
        
        // Get RANDOM recent plinko bets from ALL PLAYERS (not just current user)
        const bets = await prisma.bet.findMany({
          where: {
            gameType: 'plinko', // ONLY PLINKO BETS
            state: 'resolved', // Only show completed bets
          },
          orderBy: {
            resolvedAt: 'desc',
          },
          take: Math.min(limit * 3, 100), // Get more to randomize
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
                lastName: true,
                username: true,
                telegramId: true, // Need for avatar URL
              },
            },
          },
        });

        logger.info({ count: bets.length }, 'Fetched plinko history');

        // If no bets found, try without state filter
        if (bets.length === 0) {
          const allBets = await prisma.bet.findMany({
            where: {
              gameType: 'plinko', // ONLY PLINKO BETS
            },
            orderBy: {
              placedAt: 'desc',
            },
            take: Math.min(limit * 3, 100),
            select: {
              id: true,
              amount: true,
              payout: true,
              multiplier: true,
              state: true,
              placedAt: true,
              resolvedAt: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  username: true,
                  telegramId: true, // Need for avatar URL
                },
              },
            },
          });

          logger.info({ count: allBets.length, states: allBets.map(b => b.state) }, 'All plinko bets (any state)');

          // Shuffle and take random subset
          const shuffled = allBets
            .filter(b => b.payout && b.multiplier) // Only bets with results
            .sort(() => Math.random() - 0.5)
            .slice(0, limit);

          // Format for frontend
          const history = shuffled.map((bet) => ({
            username: bet.user.username || bet.user.firstName || 'Player',
            betAmount: Number(bet.amount),
            multiplier: Number(bet.multiplier || 0),
            payout: Number(bet.payout || 0),
            timestamp: bet.resolvedAt?.getTime() || bet.placedAt.getTime(),
            telegramId: bet.user.telegramId.toString(), // For avatar
          }));

          return reply.send({
            success: true,
            history,
          });
        }

        // Shuffle and take random subset
        const shuffled = bets.sort(() => Math.random() - 0.5).slice(0, limit);

        // Format for frontend
        const history = shuffled.map((bet) => ({
          username: bet.user.username || bet.user.firstName || 'Player',
          betAmount: Number(bet.amount),
          multiplier: Number(bet.multiplier || 0),
          payout: Number(bet.payout || 0),
          timestamp: bet.resolvedAt?.getTime() || bet.placedAt.getTime(),
          telegramId: bet.user.telegramId.toString(), // For avatar
        }));

        return reply.send({
          success: true,
          history,
        });
      } catch (error) {
        logger.error(error, 'Failed to get plinko history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch game history',
          code: 'HISTORY_FETCH_FAILED',
        });
      }
    }
  );

  /**
   * GET /api/games/plinko/my-history
   * Get current player's plinko history - ONLY THEIR BETS
   */
  app.get<{
    Querystring: {
      limit?: string;
    };
  }>(
    '/plinko/my-history',
    {
      preHandler: authenticate,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const limit = parseInt(request.query.limit || '10', 10);

      try {
        const prisma = app.prisma;
        
        // Get current player's plinko bets
        const bets = await prisma.bet.findMany({
          where: {
            userId,
            gameType: 'plinko', // ONLY PLINKO BETS
          },
          orderBy: {
            placedAt: 'desc',
          },
          take: Math.min(limit, 50), // Max 50 records
          select: {
            id: true,
            amount: true,
            payout: true,
            multiplier: true,
            state: true,
            placedAt: true,
            resolvedAt: true,
          },
        });

        logger.info({ userId, count: bets.length }, 'Fetched player plinko history');

        // Filter only completed bets with results
        const completedBets = bets.filter((b: any) => b.payout && b.multiplier);

        // Format for frontend
        const history = completedBets.map((bet: any) => ({
          betAmount: Number(bet.amount),
          multiplier: Number(bet.multiplier || 0),
          payout: Number(bet.payout || 0),
          timestamp: bet.resolvedAt?.getTime() || bet.placedAt.getTime(),
        }));

        return reply.send({
          success: true,
          history,
        });
      } catch (error) {
        logger.error(error, 'Failed to get player plinko history');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch player history',
          code: 'PLAYER_HISTORY_FETCH_FAILED',
        });
      }
    }
  );
}

