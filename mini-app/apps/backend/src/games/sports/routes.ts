import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  isAdminTelegramIdAsync,
  type AuthenticatedRequest,
} from '../../middleware/auth.js';
import { gameConfig } from '../../services/game-config.js';
import { logger } from '../../utils/logger.js';
import { sportsEngine, SportsOddsChangedError } from './engine.js';
import { MARKET_KINDS, type BetLegSpec, type MarketKind } from './markets.js';
import { sportsLimits } from './limits.js';
import { sportsLogoRoutes } from './logo-route.js';

const LEGACY_OUTCOMES = new Set(['p1', 'x', 'p2']);

export async function sportsRoutes(app: FastifyInstance): Promise<void> {
  await sportsLogoRoutes(app);

  app.get('/events', { preHandler: authenticate }, async (request, reply) => {
    const cfg = await gameConfig.get('sports');
    const limits = await sportsLimits();
    const { user } = request as AuthenticatedRequest;
    const isAdmin = await isAdminTelegramIdAsync(user.telegramId);
    if (cfg.hidden && !isAdmin) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    return reply.send({
      ok: true,
      virtual: false,
      paused: !!cfg.paused,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      cashoutEnabled: limits.cashoutEnabled,
      events: sportsEngine.listEvents({ enabledSports: limits.enabledSports }),
    });
  });

  app.get('/feed', { preHandler: authenticate }, async (_request, reply) => {
    return reply.send({ ok: true, items: sportsEngine.listActivity() });
  });

  app.get<{ Params: { id: string } }>(
    '/events/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const cfg = await gameConfig.get('sports');
      const { user } = request as AuthenticatedRequest;
      const isAdmin = await isAdminTelegramIdAsync(user.telegramId);
      if (cfg.hidden && !isAdmin) {
        return reply.code(404).send({ error: 'Not Found' });
      }

      const event = sportsEngine.getEvent(String(request.params.id));
      if (!event || event.suspended) return reply.code(404).send({ error: 'Событие не найдено' });

      return reply.send({
        ok: true,
        paused: !!cfg.paused,
        minBet: cfg.minBet,
        maxBet: cfg.maxBet,
        event,
      });
    }
  );

  app.get('/my-bets', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as AuthenticatedRequest;
    const bets = await sportsEngine.listUserBets(user.userId);
    return reply.send({ ok: true, bets });
  });

  app.post<{ Body: { betId?: string } }>('/cashout', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as AuthenticatedRequest;
    const betId = String(request.body?.betId ?? '').trim();
    if (!betId) return reply.code(400).send({ error: 'betId required' });
    try {
      const out = await sportsEngine.cashout(user.userId, betId);
      return reply.send(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выкупить';
      return reply.code(400).send({ error: message });
    }
  });

  app.post<{
    Body: {
      eventId?: string;
      outcome?: string;
      stake?: number;
      acceptChange?: boolean;
      quotedOdds?: number[];
      legs?: Array<{
        eventId?: string;
        marketKind?: string;
        outcomeKey?: string;
        line?: number;
      }>;
    };
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

    const stake = Number(request.body?.stake);
    if (!Number.isFinite(stake) || stake <= 0) {
      return reply.code(400).send({ error: 'Некорректная сумма' });
    }
    if (stake < cfg.minBet || stake > cfg.maxBet) {
      return reply.code(400).send({
        error: `Ставка от ${cfg.minBet} до ${cfg.maxBet}`,
      });
    }

    let legs: BetLegSpec[];
    try {
      legs = normalizeLegs(request.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Некорректный купон';
      return reply.code(400).send({ error: message });
    }

    try {
      const receipt = await sportsEngine.placeBet(user.userId, stake, legs, {
        quotedOdds: Array.isArray(request.body?.quotedOdds) ? request.body.quotedOdds : undefined,
        acceptChange: !!request.body?.acceptChange,
      });
      return reply.send({ ok: true, ...receipt });
    } catch (err) {
      if (err instanceof SportsOddsChangedError) {
        return reply.code(409).send({
          error: 'ODDS_CHANGED',
          legs: err.legs,
        });
      }
      const message = err instanceof Error ? err.message : 'Не удалось принять ставку';
      logger.warn({ err, userId: user.userId }, 'Sports bet rejected');
      return reply.code(400).send({
        error: message === 'Insufficient balance' ? 'Недостаточно средств' : message,
      });
    }
  });
}

function normalizeLegs(body: {
  eventId?: string;
  outcome?: string;
  legs?: Array<{
    eventId?: string;
    marketKind?: string;
    outcomeKey?: string;
    line?: number;
  }>;
}): BetLegSpec[] {
  if (Array.isArray(body.legs) && body.legs.length > 0) {
    return body.legs.map((raw) => {
      const eventId = String(raw.eventId ?? '').trim();
      const marketKind = String(raw.marketKind ?? '').trim() as MarketKind;
      const outcomeKey = String(raw.outcomeKey ?? '').trim();
      if (!eventId) throw new Error('eventId required');
      if (!MARKET_KINDS.has(marketKind)) throw new Error('Некорректный рынок');
      if (!outcomeKey) throw new Error('Некорректный исход');
      const line = raw.line == null ? undefined : Number(raw.line);
      if (line != null && !Number.isFinite(line)) throw new Error('Некорректная линия');
      return { eventId, marketKind, outcomeKey, line };
    });
  }

  const eventId = String(body.eventId ?? '').trim();
  const outcome = String(body.outcome ?? '').trim();
  if (!eventId) throw new Error('eventId required');
  if (!LEGACY_OUTCOMES.has(outcome)) throw new Error('Некорректный исход');
  return [{ eventId, marketKind: '1x2', outcomeKey: outcome }];
}
