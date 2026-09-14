import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, isAdminTelegramIdAsync, type AuthenticatedRequest } from '../middleware/auth.js';
import { macvSlotEngine } from '../games/macvslot/macvslot-engine.js';
import { gameConfig } from '../services/game-config.js';
import { balanceService } from '../services/balance-service.js';
import { logger } from '../utils/logger.js';

const SpinSchema = z.object({
  betAmount: z.number().min(0.20).max(1000).default(1),
  demoMode: z.boolean().default(false),
});

export async function macvSlotRoutes(app: FastifyInstance): Promise<void> {
  // Common Admin Guard for MacvSlot
  async function ensureAdmin(request: AuthenticatedRequest, reply: any): Promise<boolean> {
    const isAdmin = await isAdminTelegramIdAsync(request.user.telegramId);
    if (!isAdmin) {
      await logger.warn({ userId: request.user.userId, telegramId: request.user.telegramId }, 'Unauthorized access attempt to MacvSlot');
      await reply.code(403).send({ error: 'Доступно только администраторам.' });
      return false;
    }
    return true;
  }

  /**
   * GET /api/games/macvslot/state
   * Fetch current game config and user free spins state
   */
  app.get('/state', { preHandler: authenticate }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!(await ensureAdmin(req, reply))) return;

    try {
      const cfg = await gameConfig.get('macvslot');
      const freeSpins = await macvSlotEngine.getFreeSpinsState(req.user.userId);
      const balance = await balanceService.getBalance(req.user.userId);

      return reply.send({
        ok: true,
        config: {
          minBet: cfg.minBet,
          maxBet: cfg.maxBet,
          paused: cfg.paused,
        },
        freeSpins,
        balance,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Failed to fetch slot state' });
    }
  });

  /**
   * POST /api/games/macvslot/spin
   * Play a slot spin
   */
  app.post('/spin', { preHandler: authenticate }, async (request, reply) => {
    const req = request as AuthenticatedRequest;
    if (!(await ensureAdmin(req, reply))) return;

    const parseResult = SpinSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Неверные параметры ставки.', details: parseResult.error.format() });
    }

    const { betAmount, demoMode } = parseResult.data;

    try {
      const result = await macvSlotEngine.spin(req.user.userId, betAmount, demoMode);
      const newBalance = await balanceService.getBalance(req.user.userId);

      return reply.send({
        ok: true,
        ...result,
        newBalance,
      });
    } catch (err: any) {
      logger.error({ err, userId: req.user.userId }, 'MacvSlot spin failed');
      return reply.code(400).send({ error: err.message || 'Ошибка при совершении спина' });
    }
  });
}
