import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { isAdminTelegramIdAsync } from '../../middleware/auth.js';
import { gameConfig } from '../../services/game-config.js';

let columnReady: Promise<void> | null = null;

export function ensureSportsAccessColumn(db: PrismaClient = prisma): Promise<void> {
  if (!columnReady) {
    columnReady = db
      .$executeRawUnsafe(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS sports_access BOOLEAN NOT NULL DEFAULT false`
      )
      .then(() => undefined)
      .catch((err) => {
        columnReady = null;
        throw err;
      });
  }
  return columnReady;
}

export async function userHasSportsAccess(
  userId: string,
  db: PrismaClient = prisma
): Promise<boolean> {
  await ensureSportsAccessColumn(db);
  const rows = await db.$queryRaw<Array<{ sports_access: boolean }>>`
    SELECT sports_access FROM users WHERE id = ${userId} LIMIT 1
  `;
  return !!rows[0]?.sports_access;
}

export async function canAccessSports(user: {
  userId: string;
  telegramId: number;
}): Promise<boolean> {
  if (await isAdminTelegramIdAsync(user.telegramId)) return true;
  const cfg = await gameConfig.get('sports');
  if (cfg.hidden) return false;
  return userHasSportsAccess(user.userId);
}

export async function listSportsAccessUsers(db: PrismaClient = prisma) {
  await ensureSportsAccessColumn(db);
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      telegram_id: bigint;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
    }>
  >`
    SELECT id, telegram_id, username, first_name, last_name
    FROM users
    WHERE sports_access = true
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  return rows.map((u) => ({
    id: u.id,
    telegramId: Number(u.telegram_id),
    username: u.username,
    name:
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.username ||
      `id${u.telegram_id.toString().slice(-4)}`,
  }));
}

export async function setSportsAccess(
  db: PrismaClient,
  opts: { userId?: string; telegramId?: number; enabled: boolean }
): Promise<{ id: string; telegramId: number; sportsAccess: boolean } | null> {
  await ensureSportsAccessColumn(db);
  const rows = opts.userId
    ? await db.$queryRaw<Array<{ id: string; telegram_id: bigint }>>`
        SELECT id, telegram_id FROM users WHERE id = ${opts.userId} LIMIT 1
      `
    : opts.telegramId != null
      ? await db.$queryRaw<Array<{ id: string; telegram_id: bigint }>>`
          SELECT id, telegram_id FROM users WHERE telegram_id = ${BigInt(opts.telegramId)} LIMIT 1
        `
      : [];
  const row = rows[0];
  if (!row) return null;
  await db.$executeRaw`
    UPDATE users SET sports_access = ${opts.enabled} WHERE id = ${row.id}
  `;
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    sportsAccess: opts.enabled,
  };
}
