import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { pipeline } from 'stream';
import { promisify } from 'util';
import '@fastify/multipart';
import type { MultipartFile } from '@fastify/multipart';
import { adminOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

const pump = promisify(pipeline);
const AUTH_TTL_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 30 * 60 * 1000;
const DBOPS_PREFIX = 'dbops';

interface ExportState {
  stage: 'idle' | 'running' | 'ready' | 'error';
  startedAt: number;
  finishedAt?: number;
  filePath?: string;
  downloadToken?: string;
  message?: string;
  error?: string;
}

interface ImportState {
  stage: 'idle' | 'uploading' | 'restoring' | 'restarting' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  message?: string;
  error?: string;
}

function maskDbUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) {
      u.password = '••••••••';
    }
    if (u.username) {
      u.username = u.username.slice(0, 2) + '•••';
    }
    return u.toString();
  } catch {
    return 'hidden';
  }
}

function authKey(userId: string): string {
  return `${DBOPS_PREFIX}:auth:${userId}`;
}

function exportStateKey(userId: string): string {
  return `${DBOPS_PREFIX}:export:${userId}`;
}

function importStateKey(userId: string): string {
  return `${DBOPS_PREFIX}:import:${userId}`;
}

async function setAuthSession(userId: string) {
  await redisClient.getClient().set(authKey(userId), '1', 'PX', AUTH_TTL_MS);
}

async function getAuthTtl(userId: string): Promise<number> {
  return redisClient.getClient().pttl(authKey(userId));
}

async function ensureAuth(request: AuthenticatedRequest, reply: any): Promise<number | null> {
  const ttl = await getAuthTtl(request.user.userId);
  if (ttl <= 0) {
    void reply.code(401).send({ error: 'Password required' });
    return null;
  }
  return ttl;
}

async function readExportState(userId: string): Promise<ExportState | null> {
  const raw = await redisClient.getClient().get(exportStateKey(userId));
  return raw ? (JSON.parse(raw) as ExportState) : null;
}

async function writeExportState(userId: string, state: ExportState) {
  await redisClient
    .getClient()
    .set(exportStateKey(userId), JSON.stringify(state), 'PX', STATE_TTL_MS);
}

async function readImportState(userId: string): Promise<ImportState | null> {
  const raw = await redisClient.getClient().get(importStateKey(userId));
  return raw ? (JSON.parse(raw) as ImportState) : null;
}

async function writeImportState(userId: string, state: ImportState) {
  await redisClient
    .getClient()
    .set(importStateKey(userId), JSON.stringify(state), 'PX', STATE_TTL_MS);
}

function runCommand(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function dbOpsRoutes(app: FastifyInstance): Promise<void> {
  // Session state for DB ops (password gate)
  app.post<{ Body: { password: string } }>(
    '/_x/dbops/login',
    { preHandler: adminOnly },
    async (request, reply) => {
      if (!config.dbOpsPassword) {
        return reply.code(400).send({ error: 'DB ops password not set on server' });
      }
      const pwd = (request.body?.password ?? '').trim();
      if (!pwd) {
        return reply.code(400).send({ error: 'Password required' });
      }
      if (pwd !== config.dbOpsPassword) {
        return reply.code(401).send({ error: 'Wrong password' });
      }
      await setAuthSession((request as AuthenticatedRequest).user.userId);
      const expiresInMs = await getAuthTtl((request as AuthenticatedRequest).user.userId);
      return reply.send({ ok: true, expiresInMs });
    }
  );

  app.get('/_x/dbops/session', { preHandler: adminOnly }, async (request, reply) => {
    const ttl = await getAuthTtl((request as AuthenticatedRequest).user.userId);
    return reply.send({ ok: true, authorized: ttl > 0, expiresInMs: ttl > 0 ? ttl : 0 });
  });

  app.get('/_x/dbops/info', { preHandler: adminOnly }, async (_request, reply) => {
    try {
      const rows = await app.prisma.$queryRaw<Array<{ version: string }>>`
        SELECT version();
      `;
      const version = rows[0]?.version ?? 'unknown';
      return reply.send({ ok: true, db: { version, url: maskDbUrl(config.databaseUrl) } });
    } catch (error) {
      logger.error(error, 'dbops info failed');
      return reply.code(500).send({ error: 'Failed to read DB info' });
    }
  });

  // Export
  app.post('/_x/dbops/export/start', { preHandler: adminOnly }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.userId;
    const ttl = await ensureAuth(request as AuthenticatedRequest, reply);
    if (ttl === null) return;

    const existing = await readExportState(userId);
    if (existing && (existing.stage === 'running' || existing.stage === 'ready')) {
      return reply.send({ ok: true, state: existing, expiresInMs: ttl });
    }

    const startedAt = Date.now();
    const fileName = `db-export-${startedAt}.dump`;
    const filePath = path.join(os.tmpdir(), fileName);
    const downloadToken = randomUUID();

    const state: ExportState = {
      stage: 'running',
      startedAt,
      message: 'Архивация базы…',
    };
    await writeExportState(userId, state);

    // Fire and forget
    (async () => {
      const result = await runCommand('pg_dump', ['--dbname', config.databaseUrl, '--format=custom', '--file', filePath]);
      if (result.code === 0) {
        const ready: ExportState = {
          stage: 'ready',
          startedAt,
          finishedAt: Date.now(),
          filePath,
          downloadToken,
          message: 'Готово. Можно скачать архив.',
        };
        await writeExportState(userId, ready);
        // Cleanup after 30 minutes
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
        }, 30 * 60 * 1000);
      } else {
        const failed: ExportState = {
          stage: 'error',
          startedAt,
          finishedAt: Date.now(),
          error: result.stderr || 'pg_dump failed',
        };
        await writeExportState(userId, failed);
      }
    })().catch((err) => logger.error(err, 'dbops export spawn failed'));

    return reply.send({ ok: true, state, expiresInMs: ttl });
  });

  app.get('/_x/dbops/export/status', { preHandler: adminOnly }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.userId;
    const ttl = await ensureAuth(request as AuthenticatedRequest, reply);
    if (ttl === null) return;
    const state = (await readExportState(userId)) ?? { stage: 'idle', startedAt: 0 };
    return reply.send({ ok: true, state, expiresInMs: ttl });
  });

  app.get('/_x/dbops/export/download', { preHandler: adminOnly }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.userId;
    const ttl = await ensureAuth(request as AuthenticatedRequest, reply);
    if (ttl === null) return;
    const token = (request.query as Record<string, string | undefined>).token;
    const state = await readExportState(userId);
    if (!state || state.stage !== 'ready' || !state.filePath || !state.downloadToken) {
      return reply.code(404).send({ error: 'Not ready' });
    }
    if (token !== state.downloadToken) {
      return reply.code(401).send({ error: 'Bad token' });
    }
    if (!fs.existsSync(state.filePath)) {
      return reply.code(410).send({ error: 'File expired' });
    }
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${path.basename(state.filePath)}"`);
    return reply.send(fs.createReadStream(state.filePath));
  });

  // Import
  app.post('/_x/dbops/import', { preHandler: adminOnly }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.userId;
    const ttl = await ensureAuth(request as AuthenticatedRequest, reply);
    if (ttl === null) return;

    const file = await (request as any).file?.();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }
    const upload = file as MultipartFile;
    const startedAt = Date.now();
    const destPath = path.join(os.tmpdir(), `db-import-${startedAt}-${upload.filename}`);

    let state: ImportState = { stage: 'uploading', startedAt, message: 'Загружаем архив…' };
    await writeImportState(userId, state);

    try {
      await pump(upload.file, fs.createWriteStream(destPath));
    } catch (error) {
      logger.error(error, 'dbops import upload failed');
      state = { stage: 'error', startedAt, finishedAt: Date.now(), error: 'Upload failed' };
      await writeImportState(userId, state);
      return reply.code(500).send({ error: 'Upload failed' });
    }

    state = { stage: 'restoring', startedAt, message: 'Восстанавливаем базу…' };
    await writeImportState(userId, state);

    (async () => {
      const restore = await runCommand('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        `--dbname=${config.databaseUrl}`,
        destPath,
      ]);

      if (restore.code !== 0) {
        const failed: ImportState = {
          stage: 'error',
          startedAt,
          finishedAt: Date.now(),
          error: restore.stderr || 'pg_restore failed',
        };
        await writeImportState(userId, failed);
        return;
      }

      let restartMsg = '';
      const restart = await runCommand('pm2', ['restart', 'macvbet-backend', 'macvbet-bot']);
      if (restart.code !== 0) {
        restartMsg = 'База импортирована, но перезапуск pm2 не удался: ' + (restart.stderr || restart.stdout);
      }

      const done: ImportState = {
        stage: 'done',
        startedAt,
        finishedAt: Date.now(),
        message: restartMsg || 'База импортирована и сервисы перезапущены',
      };
      await writeImportState(userId, done);

      // Cleanup upload
      setTimeout(() => {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // ignore
        }
      }, 10 * 60 * 1000);
    })().catch((err) => logger.error(err, 'dbops import restore failed'));

    return reply.send({ ok: true, state, expiresInMs: ttl });
  });

  app.get('/_x/dbops/import/status', { preHandler: adminOnly }, async (request, reply) => {
    const userId = (request as AuthenticatedRequest).user.userId;
    const ttl = await ensureAuth(request as AuthenticatedRequest, reply);
    if (ttl === null) return;
    const state = (await readImportState(userId)) ?? { stage: 'idle', startedAt: 0 };
    return reply.send({ ok: true, state, expiresInMs: ttl });
  });
}
