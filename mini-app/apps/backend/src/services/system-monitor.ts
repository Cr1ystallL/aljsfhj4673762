import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

/**
 * System monitor — read-only introspection used by `/system/console/system`.
 *
 * Status checks are intentionally lightweight: a Postgres ping, a Redis
 * ping, and a self-report for the backend. The frontend / bot status
 * is "best-effort" since the backend can't directly observe their
 * processes — we look for recent activity (bets / WS connections).
 */

export interface ServiceStatus {
  name: 'backend' | 'frontend' | 'bot' | 'postgres' | 'redis';
  status: 'up' | 'degraded' | 'down' | 'unknown';
  detail: string;
}

export interface ProcessStats {
  pid: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  uptimeSec: number;
  nodeVersion: string;
}

class SystemMonitor {
  /** Backend's own process stats. */
  getProcessStats(): ProcessStats {
    const m = process.memoryUsage();
    return {
      pid: process.pid,
      rssMb: +(m.rss / 1024 / 1024).toFixed(1),
      heapUsedMb: +(m.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMb: +(m.heapTotal / 1024 / 1024).toFixed(1),
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
    };
  }

  /**
   * Service health snapshot. Each check has a hard 1.5s timeout so a
   * dead Redis or Postgres can't hang the admin UI.
   */
  async getServiceStatuses(
    prisma: { $queryRaw: (q: TemplateStringsArray) => Promise<unknown> }
  ): Promise<ServiceStatus[]> {
    const out: ServiceStatus[] = [];

    // backend self-report
    out.push({
      name: 'backend',
      status: 'up',
      detail: `pid ${process.pid}, uptime ${Math.round(process.uptime())}s`,
    });

    // postgres
    try {
      const ok = await Promise.race([
        prisma
          .$queryRaw`SELECT 1`
          .then(() => true)
          .catch(() => false),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 1500)
        ),
      ]);
      out.push({
        name: 'postgres',
        status: ok ? 'up' : 'down',
        detail: ok ? 'SELECT 1 ok' : 'no response in 1.5s',
      });
    } catch {
      out.push({ name: 'postgres', status: 'down', detail: 'query failed' });
    }

    // redis
    try {
      const ok = await Promise.race([
        redisClient
          .getClient()
          .ping()
          .then((r) => r === 'PONG')
          .catch(() => false),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 1500)
        ),
      ]);
      out.push({
        name: 'redis',
        status: ok ? 'up' : 'down',
        detail: ok ? 'PONG' : 'no response in 1.5s',
      });
    } catch {
      out.push({ name: 'redis', status: 'down', detail: 'ping failed' });
    }

    // bot — best-effort: check for recent broadcasts touched OR
    // heartbeat in Redis. We use Redis key `bot:heartbeat` (set by the
    // bot if we add it later); for now, fall back to "unknown".
    try {
      const heartbeat = await redisClient
        .getClient()
        .get('bot:heartbeat');
      if (heartbeat) {
        const ts = parseInt(heartbeat, 10);
        const age = Date.now() - ts;
        if (age < 60_000) {
          out.push({
            name: 'bot',
            status: 'up',
            detail: `heartbeat ${Math.round(age / 1000)}s ago`,
          });
        } else {
          out.push({
            name: 'bot',
            status: 'degraded',
            detail: `last heartbeat ${Math.round(age / 1000)}s ago`,
          });
        }
      } else {
        out.push({
          name: 'bot',
          status: 'unknown',
          detail: 'no heartbeat reported',
        });
      }
    } catch {
      out.push({ name: 'bot', status: 'unknown', detail: 'redis unreachable' });
    }

    // frontend — assume up if backend is up (they share a host); a
    // cross-check would need an outbound HTTP to localhost:3000 which
    // we skip to keep this endpoint snappy.
    out.push({
      name: 'frontend',
      status: 'unknown',
      detail: 'cross-host probe disabled',
    });

    return out;
  }

  /**
   * Tail the last N lines of a service's log file. We pin the file
   * paths to a known whitelist — never accept arbitrary user input
   * for a path, even from an authenticated admin.
   */
  async tailLogs(
    service: 'backend' | 'frontend' | 'bot',
    lines = 200
  ): Promise<{ lines: string[]; path: string }> {
    const map: Record<string, string> = {
      backend: '/root/.pm2/logs/macvbet-backend-out.log',
      frontend: '/root/.pm2/logs/macvbet-frontend-out.log',
      bot: '/root/.pm2/logs/macvbet-bot-out.log',
    };
    const fallbacks: Record<string, string> = {
      backend: '/var/log/macvbet-backend.log',
      frontend: '/var/log/macvbet-frontend.log',
      bot: '/var/log/macvbet-bot.log',
    };
    const safeLines = Math.min(2000, Math.max(10, lines));

    const tryRead = async (p: string): Promise<string[] | null> => {
      try {
        // Use `tail` directly when available — way faster than reading
        // multi-MB files into Node memory.
        return await new Promise<string[] | null>((resolve) => {
          const proc = spawn('tail', ['-n', String(safeLines), p]);
          const chunks: Buffer[] = [];
          let errored = false;
          proc.stdout.on('data', (c) => chunks.push(c));
          proc.on('error', () => {
            errored = true;
            resolve(null);
          });
          proc.on('close', (code) => {
            if (errored) return;
            if (code !== 0) {
              resolve(null);
              return;
            }
            resolve(Buffer.concat(chunks).toString('utf8').split('\n'));
          });
        });
      } catch {
        return null;
      }
    };

    let path = map[service];
    let result = await tryRead(path);
    if (!result) {
      // Try fallback path.
      path = fallbacks[service];
      result = await tryRead(path);
    }
    if (!result) {
      // Final fallback: readFile + manual tail (slow on big files).
      try {
        const buf = await readFile(map[service], 'utf8');
        const all = buf.split('\n');
        return {
          path: map[service],
          lines: all.slice(-safeLines),
        };
      } catch (err) {
        logger.warn({ err, service }, 'Log tail failed');
        return { path: map[service], lines: ['(не удалось прочитать лог)'] };
      }
    }
    return { path, lines: result };
  }

  /**
   * Drop all `game_config:*` keys from Redis. Engines re-read the
   * config from defaults on the next bet. Safer than restarting the
   * whole backend just to clear a cache.
   */
  async clearGameConfigCache(): Promise<number> {
    const redis = redisClient.getClient();
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        'game_config:*',
        'COUNT',
        200
      );
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
        removed += keys.length;
      }
    } while (cursor !== '0');
    return removed;
  }
}

export const systemMonitor = new SystemMonitor();
