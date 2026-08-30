import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  isAdminTelegramIdAsync,
  type AuthenticatedRequest,
} from '../../middleware/auth.js';
import { gameConfig } from '../../services/game-config.js';
import { logger } from '../../utils/logger.js';
import { sportsEngine, type SportsOutcome } from './engine.js';

const OUTCOMES = new Set<SportsOutcome>(['p1', 'x', 'p2']);

export async function sportsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', { preHandler: authenticate }, async (request, reply) => {
    const cfg = await gameConfig.get('sports');
    const { user } = request as AuthenticatedRequest;
    const isAdmin = await isAdminTelegramIdAsync(user.telegramId);
    if (cfg.hidden && !isAdmin) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    return reply.send({
      ok: true,
      virtual: true,
      paused: !!cfg.paused,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      events: sportsEngine.listEvents(),
    });
  });

  app.get('/my-bets', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as AuthenticatedRequest;
    const bets = await sportsEngine.listUserBets(user.userId);
    return reply.send({ ok: true, bets });
  });

  app.post<{
    Body: { eventId?: string; outcome?: string; stake?: number };
  }>('/bet', { preHandler: authenticate }, async (request, reply) => {
    const cfg = await gameConfig.get('sports');
    const { user } = request as AuthenticatedRequest;
    const isAdmin = await isAdminTelegramIdAsync(user.telegramId);
    if (cfg.hidden && !isAdmin) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    if (cfg.paused) {
      return reply.code(400).send({ error: 'Спорт временно недоступен' });
    }

    const eventId = String(request.body?.eventId ?? '').trim();
    const outcome = String(request.body?.outcome ?? '').trim() as SportsOutcome;
    const stake = Number(request.body?.stake);

    if (!eventId) return reply.code(400).send({ error: 'eventId required' });
    if (!OUTCOMES.has(outcome)) {
      return reply.code(400).send({ error: 'Некорректный исход' });
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      return reply.code(400).send({ error: 'Некорректная сумма' });
    }

    try {
      const receipt = await sportsEngine.placeBet(user.userId, eventId, outcome, stake);
      return reply.send({ ok: true, ...receipt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось принять ставку';
      logger.warn({ err, userId: user.userId, eventId }, 'Sports bet rejected');
      const status =
        message === 'Insufficient balance' || message.includes('Недостаточно') ? 400 : 400;
      return reply.code(status).send({
        error: message === 'Insufficient balance' ? 'Недостаточно средств' : message,
      });
    }
  });
}
