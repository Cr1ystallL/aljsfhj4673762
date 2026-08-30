import { redisClient } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';

const KEY = 'blackjack:live-tables:v1';

export interface SlimBlackjackTable {
  roomId: string;
  phase: string;
  playersCount: number;
  maxSeats: number;
  countdown: number;
}

export function tableIndex(roomId: string): number {
  const m = String(roomId).match(/bj_table_(\d+)$/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function sortTables<T extends { roomId: string }>(tables: T[]): T[] {
  return [...tables].sort((a, b) => tableIndex(a.roomId) - tableIndex(b.roomId));
}

export function mergeTableLists(
  local: SlimBlackjackTable[],
  remote: SlimBlackjackTable[] | null
): SlimBlackjackTable[] {
  const map = new Map<string, SlimBlackjackTable>();
  for (const row of remote ?? []) {
    if (row?.roomId) map.set(row.roomId, { ...row, maxSeats: row.maxSeats || 5 });
  }
  for (const row of local) {
    const prev = map.get(row.roomId);
    if (!prev || row.playersCount >= prev.playersCount) {
      map.set(row.roomId, row);
    }
  }
  return sortTables([...map.values()]);
}

export function hasFreeSeat(tables: SlimBlackjackTable[]): boolean {
  return tables.some((t) => t.playersCount < (t.maxSeats || 5));
}

export function toSlim(row: Partial<SlimBlackjackTable> & { roomId: string }): SlimBlackjackTable {
  return {
    roomId: row.roomId,
    phase: String(row.phase || 'waiting'),
    playersCount: Number(row.playersCount) || 0,
    maxSeats: Number(row.maxSeats) || 5,
    countdown: Number(row.countdown) || 12,
  };
}

export function jsonClone<T>(value: T, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return fallback;
  }
}

export async function persistTables(tables: SlimBlackjackTable[]): Promise<void> {
  try {
    const client = redisClient.getClient();
    await client.set(KEY, JSON.stringify(tables), 'EX', 600);
  } catch (err) {
    logger.warn({ err }, 'Failed to persist blackjack table directory');
  }
}

export async function loadTables(): Promise<SlimBlackjackTable[] | null> {
  try {
    const raw = await redisClient.getClient().get(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlimBlackjackTable[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
