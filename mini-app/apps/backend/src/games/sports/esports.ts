import { logger } from '../../utils/logger.js';
import { formatOdds } from './odds.js';
import { buildMarkets, marketsCount } from './markets.js';
import type { FeedEvent } from './provider.js';

const OPENDOTA_LIVE = 'https://api.opendota.com/api/live';
const HLTV = 'https://hltv-api.vercel.app/api/matches.json';

interface OpenDotaLive {
  match_id?: number;
  radiant_score?: number;
  dire_score?: number;
  radiant_team?: { team_id?: number; team_name?: string; team_logo?: string };
  dire_team?: { team_id?: number; team_name?: string; team_logo?: string };
  game_time?: number;
  spectators?: number;
  league_id?: number;
}

interface HltvMatch {
  id?: number | string;
  team1?: { name?: string };
  team2?: { name?: string };
  event?: { name?: string };
  date?: string;
  stars?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase() || '??';
}

function twoWay(p1 = 1.85, p2 = 1.85): { p1: number; p2: number } {
  return { p1: formatOdds(p1), p2: formatOdds(p2) };
}

export async function fetchEsportsBoard(): Promise<FeedEvent[]> {
  const now = Date.now();
  const [dota, hltv] = await Promise.allSettled([fetchDota(now), fetchHltv(now)]);
  const out: FeedEvent[] = [];
  if (dota.status === 'fulfilled') out.push(...dota.value);
  else logger.warn({ err: dota.reason }, 'OpenDota esports feed failed');
  if (hltv.status === 'fulfilled') out.push(...hltv.value);
  else logger.warn({ err: hltv.reason }, 'HLTV esports feed failed');
  return out;
}

async function fetchDota(now: number): Promise<FeedEvent[]> {
  const res = await fetch(OPENDOTA_LIVE, {
    headers: { accept: 'application/json', 'user-agent': 'MacvBetSports/1.0' },
  });
  if (!res.ok) throw new Error(`OpenDota HTTP ${res.status}`);
  const rows = (await res.json()) as OpenDotaLive[];
  const live = (Array.isArray(rows) ? rows : [])
    .filter((m) => m.match_id && ((m.spectators ?? 0) > 20 || m.radiant_team || m.dire_team))
    .slice(0, 24);

  return live.map((m) => {
    const t1 =
      typeof m.radiant_team === 'string'
        ? m.radiant_team
        : m.radiant_team?.team_name || 'Radiant';
    const t2 =
      typeof m.dire_team === 'string' ? m.dire_team : m.dire_team?.team_name || 'Dire';
    const s1 = m.radiant_score ?? 0;
    const s2 = m.dire_score ?? 0;
    const diff = s1 - s2;
    const p1 = 1 / (1 + Math.exp(-0.18 * diff));
    const odds = twoWay(formatOdds(1 / (Math.max(0.08, p1) * 1.05)), formatOdds(1 / (Math.max(0.08, 1 - p1) * 1.05)));
    const clock = Math.max(0, m.game_time ?? 0);
    const markets = buildMarkets({
      sport: 'cybersport',
      score1: s1,
      score2: s2,
      minute: Math.floor(clock / 60),
      threeWay: false,
      odds,
    });
    return {
      id: `dota-${m.match_id}`,
      sport: 'cybersport' as const,
      league: 'Dota 2 · Live',
      team1: { name: t1, shortName: t1, initials: initials(t1), color: '#22c55e', score: s1 },
      team2: { name: t2, shortName: t2, initials: initials(t2), color: '#ef4444', score: s2 },
      startTime: now - clock * 1000,
      status: 'live' as const,
      liveTime: `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`,
      liveMinute: Math.floor(clock / 60),
      clockSeconds: clock,
      clockSyncedAt: now,
      clockDirection: 'up' as const,
      odds,
      threeWay: false,
      markets,
      marketsCount: marketsCount(markets),
    };
  });
}

async function fetchHltv(now: number): Promise<FeedEvent[]> {
  const res = await fetch(HLTV, {
    headers: { accept: 'application/json', 'user-agent': 'MacvBetSports/1.0' },
  });
  if (!res.ok) throw new Error(`HLTV HTTP ${res.status}`);
  const rows = (await res.json()) as HltvMatch[];
  const list = (Array.isArray(rows) ? rows : []).slice(0, 20);
  return list.flatMap((m) => {
    const t1 = m.team1?.name || 'TBD';
    const t2 = m.team2?.name || 'TBD';
    if (t1 === 'TBD' && t2 === 'TBD') return [];
    const start = m.date ? Date.parse(m.date) : now + 3_600_000;
    if (!Number.isFinite(start) || start < now - 6 * 3600_000) return [];
    const live = start <= now && now - start < 4 * 3600_000;
    const odds = twoWay(1.9, 1.9);
    const markets = buildMarkets({
      sport: 'cybersport',
      score1: 0,
      score2: 0,
      minute: 0,
      threeWay: false,
      odds,
    });
    return [
      {
        id: `cs-${m.id ?? `${t1}-${t2}-${start}`}`,
        sport: 'cybersport' as const,
        league: m.event?.name || 'CS2',
        team1: { name: t1, shortName: t1, initials: initials(t1), color: '#f59e0b' },
        team2: { name: t2, shortName: t2, initials: initials(t2), color: '#38bdf8' },
        startTime: start,
        status: live ? ('live' as const) : ('prematch' as const),
        liveTime: live ? 'LIVE' : undefined,
        odds,
        threeWay: false,
        markets,
        marketsCount: marketsCount(markets),
      },
    ];
  });
}
