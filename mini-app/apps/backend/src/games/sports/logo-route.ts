import type { FastifyInstance } from 'fastify';
import { isAllowedLogoHost } from './logo-allow.js';

const MAX_BYTES = 400_000;
const cache = new Map<string, { body: Buffer; type: string; at: number }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

export async function sportsLogoRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { u?: string } }>('/logo', async (request, reply) => {
    const raw = String(request.query?.u ?? '');
    if (!raw || !isAllowedLogoHost(raw)) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    const cached = cache.get(raw);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return reply
        .header('content-type', cached.type)
        .header('cache-control', 'public, max-age=86400')
        .send(cached.body);
    }

    try {
      const res = await fetch(raw, {
        redirect: 'error',
        headers: { accept: 'image/*', 'user-agent': 'Mozilla/5.0 MacvBetSports/1.0' },
      });
      if (!res.ok) return reply.code(404).send({ error: 'Not Found' });
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) return reply.code(404).send({ error: 'Not Found' });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      cache.set(raw, { body: buf, type, at: Date.now() });
      return reply
        .header('content-type', type)
        .header('cache-control', 'public, max-age=86400')
        .send(buf);
    } catch {
      return reply.code(404).send({ error: 'Not Found' });
    }
  });
}
