import { logger } from '../../utils/logger.js';
import { formatOdds } from './odds.js';
import {
  calculateBasketballLiveOdds,
  calculateFootballLiveOdds,
  calculateHockeyLiveOdds,
  calculateTennisLiveOdds,
} from './odds.js';
import { threeWaySport, type SportKind } from './catalog.js';
import {
  buildMarkets,
  formatMmSs,
  marketsCount,
  type ClockDirection,
  type MatchStats,
  type SportMarket,
} from './markets.js';
import { fetchEsportsBoard } from './esports.js';
import { isAllowedLogoHost, proxiedLogo } from './logo-allow.js';

export { isAllowedLogoHost, proxiedLogo } from './logo-allow.js';

const HEADER = 'https://site.web.api.espn.com/apis/v2/scoreboard/header';

const FEEDS: Array<{ sport: SportKind; query: string }> = [
  { sport: 'football', query: 'sport=soccer' },
  { sport: 'tennis', query: 'sport=tennis' },
  { sport: 'hockey', query: 'sport=hockey' },
  { sport: 'basketball', query: 'sport=basketball&league=nba' },
  { sport: 'basketball', query: 'sport=basketball&league=wnba' },
  { sport: 'mma', query: 'sport=mma' },
];

const PRE_WINDOW_MS = 48 * 60 * 60 * 1000;
const FINISHED_KEEP_MS = 4 * 60 * 60 * 1000;

export interface FeedTeam {
  name: string;
  shortName: string;
  initials: string;
  color: string;
  logo?: string;
  score?: number;
}

export interface FeedEvent {
  id: string;
  sport: SportKind;
  league: string;
  team1: FeedTeam;
  team2: FeedTeam;
  startTime: number;
  status: 'prematch' | 'live' | 'finished';
  liveTime?: string;
  livePeriod?: string;
  liveMinute?: number;
  clockSeconds?: number | null;
  clockSyncedAt?: number;
  clockDirection?: ClockDirection;
  lastPlay?: string;
  odds: { p1: number; x?: number; p2: number };
  threeWay: boolean;
  markets: SportMarket[];
  marketsCount: number;
  stats?: MatchStats;
  suspended?: boolean;
}

interface EspnCompetitor {
  id?: string;
  type?: string;
  homeAway?: string;
  displayName?: string;
  name?: string;
  abbreviation?: string;
  shortName?: string;
  color?: string;
  logo?: string;
  headshot?: string | { href?: string };
  score?: string | number;
}

interface EspnEvent {
  id?: string;
  date?: string;
  status?: string;
  name?: string;
  shortName?: string;
  altGameNote?: string;
  clock?: string | number;
  summary?: string;
  period?: number;
  competitors?: EspnCompetitor[];
  odds?: {
    home?: { moneyLine?: number };
    away?: { moneyLine?: number };
    draw?: { moneyLine?: number };
  };
  fullStatus?: {
    clock?: string | number;
    displayClock?: string;
    displayPeriod?: string;
    period?: number;
    type?: { state?: string; completed?: boolean; shortDetail?: string };
  };
  situation?: { lastPlay?: { text?: string } };
}

interface EspnLeague {
  name?: string;
  abbreviation?: string;
  events?: EspnEvent[];
}

function americanToDecimal(ml: unknown): number | undefined {
  const n = Number(ml);
  if (!Number.isFinite(n) || n === 0) return undefined;
  const dec = n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  return formatOdds(dec);
}

function initialsFrom(name: string, abbr?: string): string {
  if (abbr && abbr.length <= 4) return abbr.slice(0, 3).toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase() || '??';
}

function colorHex(raw?: string): string {
  if (!raw) return '#3b82f6';
  const hex = raw.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : '#3b82f6';
}


function competitorLogo(c: EspnCompetitor): string | undefined {
  const head =
    typeof c.headshot === 'string' ? c.headshot : c.headshot?.href;
  if (head && isAllowedLogoHost(head)) return head;
  if (c.logo && isAllowedLogoHost(c.logo)) return c.logo;
  return undefined;
}

function mapStatus(raw?: string, completed?: boolean): FeedEvent['status'] {
  if (completed || raw === 'post') return 'finished';
  if (raw === 'in') return 'live';
  return 'prematch';
}

function pickHomeAway(comps: EspnCompetitor[]): { home: EspnCompetitor; away: EspnCompetitor } | null {
  if (comps.length < 2) return null;
  const home = comps.find((c) => c.homeAway === 'home') ?? comps[1] ?? comps[0];
  const away = comps.find((c) => c.homeAway === 'away') ?? comps[0];
  if (!home || !away || home === away) {
    return { home: comps[0], away: comps[1] };
  }
  return { home, away };
}

function toTeam(c: EspnCompetitor, scoreLive: boolean): FeedTeam {
  const name = c.displayName || c.name || 'TBD';
  const short = c.shortName || c.abbreviation || c.name || name;
  const scoreNum = Number(c.score);
  return {
    name,
    shortName: short,
    initials: initialsFrom(name, c.abbreviation),
    color: colorHex(c.color),
    logo: proxiedLogo(competitorLogo(c)),
    score: scoreLive && Number.isFinite(scoreNum) ? scoreNum : undefined,
  };
}

function fallbackOdds(
  sport: SportKind,
  status: FeedEvent['status'],
  t1: FeedTeam,
  t2: FeedTeam,
  minute: number
): FeedEvent['odds'] {
  const s1 = t1.score ?? 0;
  const s2 = t2.score ?? 0;
  const liveMinute = status === 'live' ? minute : 0;
  if (sport === 'football') {
    const o = calculateFootballLiveOdds(liveMinute, s1, s2);
    return { p1: o.p1, x: o.x, p2: o.p2 };
  }
  if (sport === 'hockey') {
    const o = calculateHockeyLiveOdds(liveMinute, s1, s2);
    return { p1: o.p1, x: o.x, p2: o.p2 };
  }
  if (sport === 'basketball') {
    const o = calculateBasketballLiveOdds(s1, s2, 2, 300);
    return { p1: o.p1, p2: o.p2 };
  }
  const o = calculateTennisLiveOdds([s1], [s2], 0, 0);
  return { p1: o.p1, p2: o.p2 };
}

function parseDisplaySeconds(display: string, sport: SportKind): number | null {
  const injury = display.match(/^(\d+)\s*['′]\s*\+\s*(\d+)/);
  if (injury) return Number(injury[1]) * 60 + Number(injury[2]);
  const mmss = display.match(/^(\d+):(\d{2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const minOnly = display.match(/^(\d+)\s*['′]/);
  if (minOnly) return Number(minOnly[1]) * 60;
  if (sport === 'football') {
    const bare = Number(display.replace(/[^\d.]/g, ''));
    if (Number.isFinite(bare) && bare > 0 && bare <= 130) return Math.floor(bare) * 60;
  }
  return null;
}

function parseEspnClock(
  sport: SportKind,
  ev: EspnEvent,
  status: FeedEvent['status']
): {
  clockSeconds: number | null;
  clockDirection: ClockDirection;
  liveMinute?: number;
  liveTime?: string;
  livePeriod?: string;
} {
  const display = String(ev.fullStatus?.displayClock ?? ev.clock ?? '').trim();
  const period =
    ev.fullStatus?.displayPeriod || (ev.period ? String(ev.period) : undefined);
  const raw = ev.fullStatus?.clock ?? ev.clock;
  const asNum = typeof raw === 'number' ? raw : Number(raw);

  let seconds: number | null = null;
  let direction: ClockDirection = 'none';

  if (sport === 'football') {
    direction = 'up';
    if (Number.isFinite(asNum) && asNum >= 60) {
      seconds = Math.floor(asNum);
    } else {
      seconds = parseDisplaySeconds(display, sport);
      if (seconds == null && Number.isFinite(asNum) && asNum >= 0 && asNum <= 130) {
        seconds = Math.floor(asNum) * 60;
      }
    }
  } else if (sport === 'hockey' || sport === 'basketball') {
    direction = 'down';
    seconds = parseDisplaySeconds(display, sport);
    if (seconds == null && Number.isFinite(asNum) && asNum >= 0 && asNum < 1200) {
      seconds = Math.floor(asNum);
    }
  }

  const liveMinute = seconds != null ? Math.floor(seconds / 60) : undefined;
  const liveTime =
    status === 'live'
      ? seconds != null
        ? formatMmSs(seconds)
        : display || 'LIVE'
      : status === 'finished'
        ? 'FT'
        : undefined;

  return {
    clockSeconds: status === 'live' ? seconds : null,
    clockDirection: status === 'live' ? direction : 'none',
    liveMinute,
    liveTime,
    livePeriod: status === 'live' ? period : undefined,
  };
}

function parseEvent(sport: SportKind, leagueName: string, ev: EspnEvent, now: number): FeedEvent | null {
  const id = ev.id ? `espn-${ev.id}` : '';
  if (!id) return null;
  const pair = pickHomeAway(ev.competitors ?? []);
  if (!pair) return null;

  const state = ev.fullStatus?.type?.state ?? ev.status;
  const completed = !!ev.fullStatus?.type?.completed;
  const status = mapStatus(state, completed);
  const startTime = ev.date ? Date.parse(ev.date) : now;
  if (!Number.isFinite(startTime)) return null;

  if (status === 'prematch' && startTime - now > PRE_WINDOW_MS) return null;
  if (status === 'finished' && now - startTime > FINISHED_KEEP_MS) return null;

  const showScore = status !== 'prematch';
  const team1 = toTeam(pair.home, showScore);
  const team2 = toTeam(pair.away, showScore);
  const threeWay = threeWaySport(sport);

  const clock = parseEspnClock(sport, ev, status);
  const p1 = americanToDecimal(ev.odds?.home?.moneyLine);
  const p2 = americanToDecimal(ev.odds?.away?.moneyLine);
  const x = americanToDecimal(ev.odds?.draw?.moneyLine);
  let odds: FeedEvent['odds'];
  if (p1 && p2 && (!threeWay || x)) {
    odds = threeWay ? { p1, x, p2 } : { p1, p2 };
  } else {
    odds = fallbackOdds(sport, status, team1, team2, clock.liveMinute ?? 0);
  }

  const stats = parseCompetitorStats(pair.home, pair.away);
  const markets = buildMarkets({
    sport,
    score1: team1.score ?? 0,
    score2: team2.score ?? 0,
    minute: status === 'live' ? clock.liveMinute ?? 0 : 0,
    threeWay,
    odds,
    stats,
  });

  return {
    id,
    sport,
    league: ev.altGameNote || leagueName || sport,
    team1,
    team2,
    startTime,
    status,
    liveTime: clock.liveTime,
    livePeriod: clock.livePeriod,
    liveMinute: clock.liveMinute,
    clockSeconds: clock.clockSeconds,
    clockSyncedAt: now,
    clockDirection: clock.clockDirection,
    lastPlay: ev.situation?.lastPlay?.text,
    odds,
    threeWay,
    markets,
    marketsCount: marketsCount(markets),
    stats,
  };
}

function statNum(c: EspnCompetitor, names: string[]): number | undefined {
  const rows = (c as EspnCompetitor & { statistics?: Array<{ name?: string; abbreviation?: string; displayValue?: string; value?: number }> }).statistics;
  if (!rows) return undefined;
  for (const row of rows) {
    const key = `${row.name ?? ''} ${row.abbreviation ?? ''}`.toLowerCase();
    if (names.some((n) => key.includes(n))) {
      const n = Number(row.value ?? row.displayValue);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function parseCompetitorStats(home: EspnCompetitor, away: EspnCompetitor): MatchStats | undefined {
  const yellow1 = statNum(home, ['yellow']);
  const yellow2 = statNum(away, ['yellow']);
  const corners1 = statNum(home, ['corner']);
  const corners2 = statNum(away, ['corner']);
  const shotsOn1 = statNum(home, ['shotsontarget', 'shot on', 'sog', 'on target']);
  const shotsOn2 = statNum(away, ['shotsontarget', 'shot on', 'sog', 'on target']);
  const shotsOff1 = statNum(home, ['shotsofftarget', 'shot off', 'off target', 'missed']);
  const shotsOff2 = statNum(away, ['shotsofftarget', 'shot off', 'off target', 'missed']);
  const possession1 = statNum(home, ['possession']);
  const possession2 = statNum(away, ['possession']);
  const subs1 = statNum(home, ['substitution', 'subs']);
  const subs2 = statNum(away, ['substitution', 'subs']);
  const stats: MatchStats = {
    yellow1,
    yellow2,
    corners1,
    corners2,
    shotsOn1,
    shotsOn2,
    shotsOff1,
    shotsOff2,
    possession1,
    possession2,
    subs1,
    subs2,
  };
  if (Object.values(stats).every((v) => v == null)) return undefined;
  return stats;
}

async function fetchFeed(feed: { sport: SportKind; query: string }): Promise<FeedEvent[]> {
  const url = `${HEADER}?${feed.query}&lang=en&region=us`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 MacvBetSports/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`ESPN ${feed.query} HTTP ${res.status}`);
  }
  const json = (await res.json()) as { sports?: Array<{ leagues?: EspnLeague[] }> };
  const now = Date.now();
  const out: FeedEvent[] = [];
  for (const sport of json.sports ?? []) {
    for (const league of sport.leagues ?? []) {
      const leagueName = league.name || league.abbreviation || feed.sport;
      for (const ev of league.events ?? []) {
        const mapped = parseEvent(feed.sport, leagueName, ev, now);
        if (mapped) out.push(mapped);
      }
    }
  }
  return out;
}

export async function fetchLiveBoard(): Promise<FeedEvent[]> {
  const chunks = await Promise.allSettled([
    ...FEEDS.map((f) => fetchFeed(f)),
    fetchEsportsBoard(),
  ]);
  const merged = new Map<string, FeedEvent>();
  for (const chunk of chunks) {
    if (chunk.status === 'rejected') {
      logger.warn({ err: chunk.reason }, 'Sports feed request failed');
      continue;
    }
    for (const ev of chunk.value) merged.set(ev.id, ev);
  }
  const list = [...merged.values()];
  list.sort((a, b) => {
    const rank = (s: FeedEvent['status']) => (s === 'live' ? 0 : s === 'prematch' ? 1 : 2);
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return a.startTime - b.startTime;
  });
  return list.slice(0, 160);
}
