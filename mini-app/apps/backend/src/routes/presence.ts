import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  adminOnly,
  isAdminTelegramIdAsync,
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
  balance?: number;
  vipLevel?: number;
  isAdmin?: boolean;
  isBlocked?: boolean;
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
        let name = 'Игрок';
        let username: string | null = null;
        let photoUrl: string | null = null;
        let telegramId: number | null = null;
        let balance = 0;
        let vipLevel = 0;
        let isBlocked = false;
        let isAdmin = false;

        try {
          const u = await app.prisma.user.findUnique({
            where: { id: userId },
            select: {
              firstName: true,
              lastName: true,
              username: true,
              photoUrl: true,
              telegramId: true,
              vipLevel: true,
              isBlocked: true,
              balance: {
                select: { amount: true },
              },
            },
          });
          if (u) {
            name = u.firstName?.trim() || u.username?.trim() || 'Игрок';
            username = u.username ?? null;
            photoUrl = u.photoUrl ?? null;
            telegramId = Number(u.telegramId) || null;
            balance = u.balance ? Number(u.balance.amount) : 0;
            vipLevel = u.vipLevel ?? 0;
            isBlocked = Boolean(u.isBlocked);
            if (telegramId) {
              isAdmin = await isAdminTelegramIdAsync(telegramId);
            }
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
          balance,
          vipLevel,
          isBlocked,
          isAdmin,
        };

        const client = redisClient.getClient();
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
      const keys = await client.keys('presence:*');
      if (keys.length === 0) {
        return reply.send({
          ok: true,
          count: 0,
          totalOnlineBalance: 0,
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
          // Поврежденный JSON в ключе — пропускаем
        }
      }
      users.sort((a, b) => b.ts - a.ts);

      // Enrich users with live data from DB (balance, VIP, blocked, admin)
      const userIds = users.map((u) => u.userId);
      if (userIds.length > 0) {
        try {
          const dbUsers = await app.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              firstName: true,
              username: true,
              photoUrl: true,
              telegramId: true,
              vipLevel: true,
              isBlocked: true,
              balance: { select: { amount: true } },
            },
          });
          const userMap = new Map(dbUsers.map((dbU) => [dbU.id, dbU]));
          for (const u of users) {
            const dbU = userMap.get(u.userId);
            if (dbU) {
              u.name = dbU.firstName?.trim() || dbU.username?.trim() || u.name;
              u.username = dbU.username ?? u.username;
              u.photoUrl = dbU.photoUrl ?? u.photoUrl;
              u.telegramId = Number(dbU.telegramId) || u.telegramId;
              u.balance = dbU.balance ? Number(dbU.balance.amount) : 0;
              u.vipLevel = dbU.vipLevel ?? 0;
              u.isBlocked = Boolean(dbU.isBlocked);
              if (u.telegramId) {
                u.isAdmin = await isAdminTelegramIdAsync(u.telegramId);
              }
            }
          }
        } catch (enrichErr) {
          logger.warn({ enrichErr }, 'Failed to enrich presence users from DB');
        }
      }

      const totalOnlineBalance = users.reduce((acc, u) => acc + (u.balance || 0), 0);

      // Группировка по странице
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
        totalOnlineBalance,
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
