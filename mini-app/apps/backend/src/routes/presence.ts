import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  adminOnly,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * Presence — кто сейчас открыл мини-апп и какую страницу смотрит.
 *
 * Реализован как REST-heartbeat поверх Redis, а не подвешен на
 * WebSocket: WS-канал в нашей архитектуре пере-подключается при
 * background/foreground переключениях вкладки в Telegram, и факт
 * наличия живого сокета — не самый стабильный сигнал «пользователь
 * на экране». Heartbeat же делает сам клиент каждые 20 секунд и
 * сразу при навигации; TTL Redis-ключа — 45 секунд, поэтому если
 * клиент уходит, его запись пропадёт сама.
 *
 * Каждый ключ `presence:<userId>` хранит JSON со снимком пользователя
 * (имя, фото, telegramId), путём текущей страницы и временем
 * последнего heartbeat. Админка GET `/_x/presence` собирает все
 * ключи через `KEYS presence:*` + `MGET` и отдаёт фронту массив.
 */

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;
const PRESENCE_TTL_SECONDS = 45;
const MAX_PATHNAME_LENGTH = 200;

/** Public count of live Mini App sessions (Redis TTL 45s). No PII. */
export async function countOnlinePresence(): Promise<number> {
  try {
    const client = redisClient.getClient();
    const keys = await client.keys('presence:*');
    return keys.length;
  } catch (err) {
    logger.warn({ err }, 'Presence count failed');
    return 0;
  }
}

interface PresenceRecord {
  userId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  telegramId: number | null;
  pathname: string;
  ts: number;
}

export async function presenceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/presence/heartbeat
   *
   * Клиент шлёт раз в ~20 секунд и при каждой навигации. Body:
   * `{ pathname }`. Ответ всегда `ok: true` — фронту не интересны
   * детали (если Redis не доступен, мы тихо деградируем, чтобы не
   * мешать ходу мини-аппы пустой ошибкой).
   */
  app.post<{ Body: { pathname?: string } }>(
    '/presence/heartbeat',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const rawPath = typeof request.body?.pathname === 'string'
        ? request.body.pathname
        : '/';
      const pathname = rawPath.slice(0, MAX_PATHNAME_LENGTH) || '/';

      try {
        // Сначала пытаемся достать профиль из Prisma — это нужно, чтобы
        // у админа в списке были аватарки и имена, а не голые UUID'ы.
        // Если БД лежит, всё равно пишем запись, просто с пустыми
        // полями — оператор увидит хотя бы telegramId.
        let name = 'Игрок';
        let username: string | null = null;
        let photoUrl: string | null = null;
        let telegramId: number | null = null;
        try {
          const u = await app.prisma.user.findUnique({
            where: { id: userId },
            select: {
              firstName: true,
              lastName: true,
              username: true,
              photoUrl: true,
              telegramId: true,
            },
          });
          if (u) {
            name = u.firstName?.trim() || u.username?.trim() || 'Игрок';
            username = u.username ?? null;
            photoUrl = u.photoUrl ?? null;
            telegramId = Number(u.telegramId) || null;
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Presence: failed to fetch user profile');
        }

        const payload: PresenceRecord = {
          userId,
          name,
          username,
          photoUrl,
          telegramId,
          pathname,
          ts: Date.now(),
        };

        const client = redisClient.getClient();
        // ioredis-style API в проекте — `setex`/`set` с EX. Используем
        // setex для атомарной установки TTL в одну операцию.
        await client.setex(
          PRESENCE_KEY(userId),
          PRESENCE_TTL_SECONDS,
          JSON.stringify(payload)
        );
      } catch (err) {
        logger.warn({ err }, 'Presence heartbeat failed');
      }
      return reply.send({ ok: true });
    }
  );

  /**
   * GET /api/_x/presence
   *
   * Админский эндпоинт — список всех записей presence из Redis,
   * отсортированный по «свежести» (последний heartbeat сверху). Ответ
   * содержит итоговый счётчик и группировку по pathname — это
   * показывается в админ-сводке в блоке «Сейчас онлайн».
   */
  app.get('/_x/presence', { preHandler: adminOnly }, async (_request, reply) => {
    try {
      const client = redisClient.getClient();
      // `KEYS` по маленькому набору `presence:*` (десятки-сотни ключей)
      // дешевле и проще, чем держать второй Redis-set с участниками.
      // Если когда-нибудь онлайн станет >5000, заменим на SCAN.
      const keys = await client.keys('presence:*');
      if (keys.length === 0) {
        return reply.send({
          ok: true,
          count: 0,
          users: [],
          pages: [],
        });
      }
      const values = await client.mget(...keys);
      const users: PresenceRecord[] = [];
      for (const v of values) {
        if (!v) continue;
        try {
          const parsed = JSON.parse(v) as PresenceRecord;
          if (parsed && typeof parsed.userId === 'string') {
            users.push(parsed);
          }
        } catch {
          // Поврежденный JSON в ключе — пропускаем, не валим эндпоинт.
        }
      }
      users.sort((a, b) => b.ts - a.ts);

      // Группировка по странице — даёт админу прикинуть, кто чем
      // занят, без раскрытия полного списка пользователей.
      const counts = new Map<string, number>();
      for (const u of users) {
        const key = normalisePathname(u.pathname);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const pages = Array.from(counts.entries())
        .map(([pathname, count]) => ({ pathname, count }))
        .sort((a, b) => b.count - a.count);

      return reply.send({
        ok: true,
        count: users.length,
        users,
        pages,
      });
    } catch (err) {
      logger.error({ err }, 'Presence list failed');
      return reply.code(500).send({
        ok: false,
        error: 'Internal Server Error',
        code: 'PRESENCE_FAILED',
      });
    }
  });
}

/**
 * Сводим конкретные id-ы (`/game/crash`, `/system/console/users/123`) к
 * категории страницы, иначе группировка распухнет до сотен строк. UUID
 * после `/users/` или `/game/` отрезаем, оставляем только тип.
 */
function normalisePathname(pathname: string): string {
  if (pathname.startsWith('/game/')) {
    const slug = pathname.split('/')[2] || '';
    return slug ? `/game/${slug}` : '/game';
  }
  if (pathname.startsWith('/system/console/users/')) {
    return '/system/console/users/:id';
  }
  if (pathname.startsWith('/system/console')) {
    return pathname;
  }
  return pathname;
}
