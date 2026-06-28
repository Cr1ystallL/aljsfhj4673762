import { FastifyInstance } from 'fastify';
import { authenticate, AuthenticatedRequest } from '../plugins/auth.js';
import { ensureVisible } from '../lib/availability.js';
import { checkRateLimit } from '../lib/ratelimit.js';
import { hiloEngine } from '../games/hilo/hilo-engine.js';
import { logger } from '../lib/logger.js';

export default async function hiloRoutes(app: FastifyInstance) {
  // GET /api/games/hilo/state
  app.get('/hilo/state', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.id;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    const state = hiloEngine.getState(userId);
    return reply.send({ ok: true, state });
  });

  // POST /api/games/hilo/swap
  app.post('/hilo/swap', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.id;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:swap')) {
      return reply.status(429).send({ error: 'Too many requests' });
    }
    try {
      const state = hiloEngine.swap(userId);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/games/hilo/start
  app.post('/hilo/start', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.id;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:start')) {
      return reply.status(429).send({ error: 'Too many requests' });
    }

    const { amount } = request.body as { amount: number };
    try {
      const state = await hiloEngine.start(userId, amount);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /api/games/hilo/guess
  app.post('/hilo/guess', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.id;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:guess')) {
      return reply.status(429).send({ error: 'Too many requests' });
    }

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

  // POST /api/games/hilo/cashout
  app.post('/hilo/cashout', { preHandler: authenticate }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.id;
    if (!(await ensureVisible('hilo', request as AuthenticatedRequest, reply))) return;
    if (!checkRateLimit(userId, 'hilo:cashout')) {
      return reply.status(429).send({ error: 'Too many requests' });
    }

    try {
      const state = await hiloEngine.cashout(userId);
      return reply.send({ ok: true, state });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
