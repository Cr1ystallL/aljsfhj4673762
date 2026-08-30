import { logger } from '../../utils/logger.js';
import { redisClient } from '../../lib/redis.js';
import type { SportKind } from './catalog.js';
import type { MarketKind } from './markets.js';

export const TICK_STREAM = 'sports:feed-ticks';
export const PLAYER_CAPS_KEY = 'sports:player-caps';

export function isNicheLine(sport: SportKind, league: string): boolean {
  if (sport === 'mma' || sport === 'table_tennis') return true;
  const s = `${sport} ${league}`.toLowerCase();
  return /u-?1[89]|u-?2[01]|youth|reserve|amistoso|friendly|amateur|academy|epl masters|nodwin|clutch|ecl season|region|u23/.test(
    s
  );
}

export function isDangerPlay(text: string | undefined): boolean {
  if (!text) return false;
  return /\b(penalty|penalti|пенал|red card|красн|break.?point|матчбол|match point|\bvar\b)\b/i.test(
    text
  );
}

export function scoresRetracted(prev1: number, prev2: number, next1: number, next2: number): boolean {
  return next1 < prev1 || next2 < prev2;
}

export function marketLiabilityKey(
  eventId: string,
  kind: MarketKind,
  outcomeKey: string,
  line?: number
): string {
  return `${eventId}:${kind}:${outcomeKey}:${line ?? ''}`;
}

export async function writeFeedTick(fields: Record<string, string>): Promise<void> {
  try {
    const client = redisClient.getClient();
    await client.xadd(TICK_STREAM, 'MAXLEN', '~', '2000', '*', ...Object.entries(fields).flat());
  } catch (err) {
    logger.warn({ err }, 'Sports tick stream write failed');
  }
}

export async function getPlayerCap(userId: string): Promise<number | null> {
  try {
    const raw = await redisClient.getClient().hget(PLAYER_CAPS_KEY, userId);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function setPlayerCap(userId: string, maxBet: number | null): Promise<void> {
  const client = redisClient.getClient();
  if (maxBet == null || maxBet <= 0) {
    await client.hdel(PLAYER_CAPS_KEY, userId);
    return;
  }
  await client.hset(PLAYER_CAPS_KEY, userId, String(Math.round(maxBet * 100) / 100));
}

export async function listPlayerCaps(): Promise<Array<{ userId: string; maxBet: number }>> {
  try {
    const raw = await redisClient.getClient().hgetall(PLAYER_CAPS_KEY);
    return Object.entries(raw ?? {}).flatMap(([userId, val]) => {
      const maxBet = Number(val);
      return Number.isFinite(maxBet) && maxBet > 0 ? [{ userId, maxBet }] : [];
    });
  } catch {
    return [];
  }
}

export function effectiveMaxBet(input: {
  globalMax: number;
  nicheMax: number;
  niche: boolean;
  playerCap: number | null;
}): number {
  if (input.playerCap != null && input.playerCap > 0) {
    return input.playerCap;
  }
  if (input.niche) return Math.min(input.globalMax, input.nicheMax);
  return input.globalMax;
}
