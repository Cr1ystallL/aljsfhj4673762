import type { FastifyInstance } from 'fastify';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { vipService } from '../services/vip-service.js';
import { logger } from '../utils/logger.js';

export async function vipRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/vip/status
   * Returns player's current XP, VIP rank tier, progress, and unclaimed rewards.
   */
  app.get('/status', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const status = await vipService.getVipStatus(userId);
      return reply.send({ ok: true, status });
    } catch (err: any) {
      logger.error({ err, userId }, 'Failed to get VIP status');
      return reply.status(500).send({ ok: false, error: err.message || 'Failed to fetch VIP status' });
    }
  });

  /**
   * POST /api/vip/claim-reward
   * Claims reward for reaching a VIP level.
   */
  app.post('/claim-reward', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const body = (request.body as { level?: number }) || {};
    const level = Number(body.level);

    if (isNaN(level) || level <= 0) {
      return reply.status(400).send({ ok: false, error: 'Укажите корректный уровень для получения награды' });
    }

    try {
      const res = await vipService.claimVipReward(userId, level);
      const updatedStatus = await vipService.getVipStatus(userId);
      return reply.send({ ok: true, ...res, status: updatedStatus });
    } catch (err: any) {
      logger.warn({ err, userId, level }, 'Failed to claim VIP reward');
      return reply.status(400).send({ ok: false, error: err.message || 'Не удалось получить награду' });
    }
  });

  /**
   * GET /api/vip/cashback/status
   * Returns weekly cashback status and calculate amount for current period.
   */
  app.get('/cashback/status', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const status = await vipService.getCashbackStatus(userId);
      return reply.send({ ok: true, status });
    } catch (err: any) {
      logger.error({ err, userId }, 'Failed to get cashback status');
      return reply.status(500).send({ ok: false, error: err.message || 'Failed to fetch cashback status' });
    }
  });

  /**
   * POST /api/vip/cashback/claim
   * Claims weekly cashback and transfers funds to real balance.
   */
  app.post('/cashback/claim', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    try {
      const res = await vipService.claimCashback(userId);
      const updatedStatus = await vipService.getCashbackStatus(userId);
      return reply.send({ ok: true, ...res, status: updatedStatus });
    } catch (err: any) {
      logger.warn({ err, userId }, 'Failed to claim cashback');
      return reply.status(400).send({ ok: false, error: err.message || 'Не удалось забрать кэшбэк' });
    }
  });
}
