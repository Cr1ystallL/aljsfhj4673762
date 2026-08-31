import { logger } from '../../utils/logger.js';
import { calculateEsportsLiveOdds, calculatePrematchOdds } from './odds.js';
import { buildMarkets, marketsCount } from './markets.js';
import { proxiedLogo } from './logo-allow.js';
import type { FeedEvent, FeedExtra } from './provider.js';

const OPENDOTA_LIVE = 'https://api.opendota.com/api/live';
const HLTV = 'https://hltv-api.vercel.app/api/matches.json';
const LP_CS = 'https://liquipedia.net/counterstrike/api.php?action=parse&page=Liquipedia:Matches&prop=text&format=json';
const LP_DOTA = 'https://liquipedia.net/dota2/api.php?action=parse&page=Liquipedia:Matches&prop=text&format=json';
const LP_TTL_MS = 75_000;
const LP_UA = 'MacvBetSports/1.0 (sports-line; https://macvbet.com)';

interface OpenDotaLive {
  match_id?: number | string;
  radiant_score?: number;
  dire_score?: number;
  radiant_team?: { team_id?: number; team_name?: string; team_logo?: string } | string;
  dire_team?: { team_id?: number; team_name?: string; team_logo?: string } | string;
  team_name_radiant?: string;
  team_name_dire?: string;
  team_id_radiant?: number;
  team_id_dire?: number;
  game_time?: number;
  spectators?: number;
  league_id?: number;
  average_mmr?: number;
}

interface HltvSide {
  name?: string;
  logo?: string;
  crest?: string;
}

interface HltvMatch {
  id?: number | string;
  team1?: HltvSide;
  team2?: HltvSide;
  event?: { name?: string; logo?: string };
  date?: string;
  stars?: number;
}

let liquipediaCache: { at: number; events: FeedEvent[] } | null = null;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase() || '??';
}

function twoWay(p1 = 1.85, p2 = 1.85): { p1: number; p2: number } {
  return { p1, p2 };
}

function isPlaceholderSide(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !n || n === 'radiant' || n === 'dire' || n === 'tbd' || n === 'unknown' || n === 'tba';
}

function httpsUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`;
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return `https://liquipedia.net${trimmed}`;
  return undefined;
}

const dotaLogoCache = new Map<number, string | undefined>();

function dotaLogo(explicit?: string): string | undefined {
  return proxiedLogo(httpsUrl(explicit));
}

async function resolveOpenDotaLogo(teamId?: number): Promise<string | undefined> {
  if (!teamId) return undefined;
  if (dotaLogoCache.has(teamId)) return dotaLogoCache.get(teamId);
  try {
    const res = await fetch(`https://api.opendota.com/api/teams/${teamId}`, {
      headers: { accept: 'application/json', 'user-agent': LP_UA },
    });
    if (!res.ok) {
      dotaLogoCache.set(teamId, undefined);
      return undefined;
    }
    const json = (await res.json()) as { logo_url?: string };
    const logo = proxiedLogo(httpsUrl(json.logo_url));
    dotaLogoCache.set(teamId, logo);
    return logo;
  } catch {
    dotaLogoCache.set(teamId, undefined);
    return undefined;
  }
}

function dotaSide(
  raw: OpenDotaLive['radiant_team'],
  flatName?: string,
  flatId?: number
): { name: string; teamId?: number; logo?: string } {
  if (typeof raw === 'string' && raw.trim()) {
    return { name: raw.trim(), teamId: flatId, logo: undefined };
  }
  if (raw && typeof raw === 'object') {
    const name = raw.team_name?.trim() || flatName?.trim() || '';
    return { name, teamId: raw.team_id || flatId, logo: dotaLogo(raw.team_logo) };
  }
  return { name: flatName?.trim() || '', teamId: flatId, logo: undefined };
}

function hltvLogo(side?: HltvSide): string | undefined {
  return proxiedLogo(httpsUrl(side?.logo || side?.crest));
}

export function extractStreamUrl(html: string): string | undefined {
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => decodeHtml(m[1]));
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'twitch.tv' || host === 'player.twitch.tv') {
      const parts = url.pathname.split('/').filter(Boolean);
      const fromQuery = url.searchParams.get('channel');
      const channel =
        fromQuery ||
        (parts[0]?.toLowerCase() === 'popout' || parts[0]?.toLowerCase() === 'embed'
          ? parts[1]
          : parts[0]);
      if (
        channel &&
        /^[a-zA-Z0-9_]{2,25}$/.test(channel) &&
        !/^(videos|directory|p|downloads|jobs|turbo|prime|subs)$/i.test(channel)
      ) {
        return `https://www.twitch.tv/${channel}`;
      }
    }
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
      const id =
        url.searchParams.get('v') ||
        (host === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : undefined) ||
        (url.pathname.startsWith('/live/') ? url.pathname.split('/')[2] : undefined) ||
        (url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : undefined);
      if (id && /^[a-zA-Z0-9_-]{6,}$/.test(id)) {
        return `https://www.youtube.com/watch?v=${id}`;
      }
    }
    if (host === 'kick.com') {
      const channel = url.pathname.split('/').filter(Boolean)[0];
      if (channel && /^[a-zA-Z0-9_]{2,25}$/.test(channel)) {
        return `https://kick.com/${channel}`;
      }
    }
  }
  return undefined;
}

function cyberEvent(input: {
  id: string;
  league: string;
  team1: string;
  team2: string;
  logo1?: string;
  logo2?: string;
  score1?: number;
  score2?: number;
  startTime: number;
  status: FeedEvent['status'];
  liveTime?: string;
  liveMinute?: number;
  clockSeconds?: number;
  now: number;
  streamUrl?: string;
  extra?: FeedExtra;
}): FeedEvent {
  const s1 = input.score1 ?? 0;
  const s2 = input.score2 ?? 0;
  const odds =
    input.status === 'prematch'
      ? calculatePrematchOdds('cybersport', input.team1, input.team2, false)
      : input.extra?.scoreKind === 'kills'
        ? twoWay(
            calculateEsportsLiveOdds(0, 0, s1, s2, input.team1, input.team2).p1,
            calculateEsportsLiveOdds(0, 0, s1, s2, input.team1, input.team2).p2
          )
        : twoWay(
            calculateEsportsLiveOdds(s1, s2, 0, 0, input.team1, input.team2).p1,
            calculateEsportsLiveOdds(s1, s2, 0, 0, input.team1, input.team2).p2
          );
  const minute = input.liveMinute ?? 0;
  const markets = buildMarkets({
    sport: 'cybersport',
    score1: s1,
    score2: s2,
    minute,
    threeWay: false,
    odds,
  });
  return {
    id: input.id,
    sport: 'cybersport',
    league: input.league,
    team1: {
      name: input.team1,
      shortName: input.team1,
      initials: initials(input.team1),
      color: '#22c55e',
      score: input.status === 'prematch' ? undefined : s1,
      logo: input.logo1,
    },
    team2: {
      name: input.team2,
      shortName: input.team2,
      initials: initials(input.team2),
      color: '#ef4444',
      score: input.status === 'prematch' ? undefined : s2,
      logo: input.logo2,
    },
    startTime: input.startTime,
    status: input.status,
    liveTime: input.liveTime,
    liveMinute: input.liveMinute,
    clockSeconds: input.clockSeconds,
    clockSyncedAt: input.clockSeconds != null ? input.now : undefined,
    clockDirection: input.clockSeconds != null ? 'up' : undefined,
    odds,
    threeWay: false,
    markets,
    marketsCount: marketsCount(markets),
    streamUrl: input.streamUrl,
    extra: input.extra,
  };
}

export async function fetchEsportsBoard(): Promise<FeedEvent[]> {
  const now = Date.now();
  const [dota, hltv, liqui] = await Promise.allSettled([
    fetchDota(now),
    fetchHltv(now),
    fetchLiquipediaBoard(now),
  ]);
  const out: FeedEvent[] = [];
  if (dota.status === 'fulfilled') out.push(...dota.value);
  else logger.warn({ err: dota.reason }, 'OpenDota esports feed failed');
  if (hltv.status === 'fulfilled') out.push(...hltv.value);
  else logger.warn({ err: hltv.reason }, 'HLTV esports feed failed');
  if (liqui.status === 'fulfilled') out.push(...liqui.value);
  else logger.warn({ err: liqui.reason }, 'Liquipedia esports feed failed');
  return dedupeEsports(out);
}

function teamNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/g, '')
    .replace(/^(team|esports|gaming|clan|club|org)/, '')
    .replace(/(team|esports|gaming|clan|club|org)$/, '');
}

function fixtureKey(ev: FeedEvent): string {
  const a = teamNormalize(ev.team1.name) || ev.team1.name.toLowerCase();
  const b = teamNormalize(ev.team2.name) || ev.team2.name.toLowerCase();
  const pair = [a, b].sort().join(':');
  // Group within 12-hour windows (same match session)
  const window12h = Math.floor(ev.startTime / (12 * 3600_000));
  const game = ev.extra?.game || (ev.league.toLowerCase().includes('dota') ? 'dota' : 'cs');
  return `${game}:${pair}:${window12h}`;
}

function mergeEsports(winner: FeedEvent, loser: FeedEvent): FeedEvent {
  const extra: FeedExtra = { ...loser.extra, ...winner.extra };
  if (winner.extra?.scoreKind === 'kills' && loser.extra?.scoreKind === 'maps') {
    extra.maps1 = loser.team1.score;
    extra.maps2 = loser.team2.score;
  }
  if (loser.extra?.scoreKind === 'kills' && winner.extra?.scoreKind !== 'kills') {
    extra.kills1 = loser.extra.kills1;
    extra.kills2 = loser.extra.kills2;
    extra.spectators = extra.spectators ?? loser.extra.spectators;
    extra.duration = extra.duration ?? loser.extra.duration;
  }
  // Retain the best non-empty team scores
  const s1 = winner.team1.score != null && winner.team1.score > 0 ? winner.team1.score : loser.team1.score;
  const s2 = winner.team2.score != null && winner.team2.score > 0 ? winner.team2.score : loser.team2.score;
  return {
    ...winner,
    team1: { ...winner.team1, score: winner.status === 'prematch' ? undefined : s1, logo: winner.team1.logo || loser.team1.logo },
    team2: { ...winner.team2, score: winner.status === 'prematch' ? undefined : s2, logo: winner.team2.logo || loser.team2.logo },
    streamUrl: winner.streamUrl || loser.streamUrl,
    extra,
  };
}

function dedupeEsports(events: FeedEvent[]): FeedEvent[] {
  const rank = (ev: FeedEvent) => {
    let score = ev.status === 'live' ? 10 : ev.status === 'prematch' ? 5 : 1;
    if ((ev.team1.score ?? 0) > 0 || (ev.team2.score ?? 0) > 0) score += 3;
    if (ev.extra?.maps1 != null || ev.extra?.maps2 != null) score += 2;
    if (ev.extra?.kills1 != null || ev.extra?.kills2 != null) score += 2;
    if (ev.id.startsWith('dota-') || ev.id.startsWith('lp-')) score += 0.5;
    return score;
  };
  const best = new Map<string, FeedEvent>();
  for (const ev of events) {
    const key = fixtureKey(ev);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, ev);
      continue;
    }
    const winner = rank(ev) >= rank(prev) ? ev : prev;
    const loser = winner === ev ? prev : ev;
    best.set(key, mergeEsports(winner, loser));
  }
  return [...best.values()];
}

async function fetchDota(now: number): Promise<FeedEvent[]> {
  const res = await fetch(OPENDOTA_LIVE, {
    headers: { accept: 'application/json', 'user-agent': LP_UA },
  });
  if (!res.ok) throw new Error(`OpenDota HTTP ${res.status}`);
  const rows = (await res.json()) as OpenDotaLive[];
  const live = (Array.isArray(rows) ? rows : [])
    .filter((m) => m.match_id && (m.league_id || (m.spectators ?? 0) > 80))
    .slice(0, 40);

  const sides = live.map((m) => ({
    match: m,
    side1: dotaSide(m.radiant_team, m.team_name_radiant, m.team_id_radiant),
    side2: dotaSide(m.dire_team, m.team_name_dire, m.team_id_dire),
  }));
  const teamIds = [
    ...new Set(
      sides.flatMap((row) => [row.side1.teamId, row.side2.teamId]).filter((id): id is number => !!id)
    ),
  ];
  await Promise.all(teamIds.map((id) => resolveOpenDotaLogo(id)));

  return sides.flatMap(({ match: m, side1, side2 }) => {
    if (isPlaceholderSide(side1.name) || isPlaceholderSide(side2.name)) return [];
    const s1 = m.radiant_score ?? 0;
    const s2 = m.dire_score ?? 0;
    const clock = Math.max(0, m.game_time ?? 0);
    return [
      cyberEvent({
        id: `dota-${m.match_id}`,
        league: m.league_id ? 'Dota 2 · League' : 'Dota 2 · Live',
        team1: side1.name,
        team2: side2.name,
        logo1: side1.logo || (side1.teamId ? dotaLogoCache.get(side1.teamId) : undefined),
        logo2: side2.logo || (side2.teamId ? dotaLogoCache.get(side2.teamId) : undefined),
        score1: s1,
        score2: s2,
        startTime: now - clock * 1000,
        status: 'live',
        liveTime: `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`,
        liveMinute: Math.floor(clock / 60),
        clockSeconds: clock,
        now,
        extra: {
          scoreKind: 'kills',
          game: 'dota',
          kills1: s1,
          kills2: s2,
          spectators: m.spectators,
          duration: clock,
        },
      }),
    ];
  });
}

async function fetchHltv(now: number): Promise<FeedEvent[]> {
  const res = await fetch(HLTV, {
    headers: { accept: 'application/json', 'user-agent': LP_UA },
  });
  if (!res.ok) throw new Error(`HLTV HTTP ${res.status}`);
  const rows = (await res.json()) as HltvMatch[];
  const list = (Array.isArray(rows) ? rows : []).slice(0, 24);
  return list.flatMap((m) => {
    const t1 = m.team1?.name?.trim() || 'TBD';
    const t2 = m.team2?.name?.trim() || 'TBD';
    if (isPlaceholderSide(t1) || isPlaceholderSide(t2)) return [];
    const start = m.date ? Date.parse(m.date) : now + 3_600_000;
    if (!Number.isFinite(start) || start < now - 8 * 3600_000) return [];
    if (start > now + 7 * 24 * 3600_000) return [];
    const live = start <= now && now - start < 6 * 3600_000;
    return [
      cyberEvent({
        id: `cs-${m.id ?? `${t1}-${t2}-${start}`}`,
        league: m.event?.name || 'CS2',
        team1: t1,
        team2: t2,
        logo1: hltvLogo(m.team1),
        logo2: hltvLogo(m.team2),
        startTime: start,
        status: live ? 'live' : 'prematch',
        liveTime: live ? 'LIVE' : undefined,
        now,
        extra: { scoreKind: 'maps', game: 'cs' },
      }),
    ];
  });
}

async function fetchLiquipediaBoard(now: number): Promise<FeedEvent[]> {
  if (liquipediaCache && now - liquipediaCache.at < LP_TTL_MS) {
    return liquipediaCache.events;
  }
  const [cs, dota] = await Promise.allSettled([
    fetchLiquipedia('counterstrike', 'CS2', now),
    fetchLiquipedia('dota2', 'Dota 2', now),
  ]);
  const events: FeedEvent[] = [];
  if (cs.status === 'fulfilled') events.push(...cs.value);
  else logger.warn({ err: cs.reason }, 'Liquipedia CS feed failed');
  if (dota.status === 'fulfilled') events.push(...dota.value);
  else logger.warn({ err: dota.reason }, 'Liquipedia Dota feed failed');
  liquipediaCache = { at: now, events };
  return events;
}

async function fetchLiquipedia(wiki: 'counterstrike' | 'dota2', label: string, now: number): Promise<FeedEvent[]> {
  const url = wiki === 'counterstrike' ? LP_CS : LP_DOTA;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip',
      'user-agent': LP_UA,
    },
  });
  if (!res.ok) throw new Error(`Liquipedia ${wiki} HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { text?: { ['*']?: string } } };
  const html = json.parse?.text?.['*'] ?? '';
  return parseLiquipediaMatches(html, wiki, label, now);
}

export function parseLiquipediaMatches(
  html: string,
  wiki: 'counterstrike' | 'dota2',
  label: string,
  now: number
): FeedEvent[] {
  const blocks = splitMatchInfo(html);
  const out: FeedEvent[] = [];
  for (const block of blocks) {
    const ev = parseLiquipediaBlock(block, wiki, label, now);
    if (ev) out.push(ev);
    if (out.length >= 36) break;
  }
  return out;
}

function splitMatchInfo(html: string): string[] {
  const needle = 'class="match-info"';
  const out: string[] = [];
  let from = 0;
  while (from < html.length) {
    const i = html.indexOf(needle, from);
    if (i < 0) break;
    const start = html.lastIndexOf('<div', i);
    const next = html.indexOf(needle, i + needle.length);
    out.push(html.slice(start >= 0 ? start : i, next < 0 ? i + 7000 : next));
    from = i + needle.length;
  }
  return out;
}

function parseLiquipediaBlock(
  block: string,
  wiki: 'counterstrike' | 'dota2',
  label: string,
  now: number
): FeedEvent | null {
  const tsRaw = Number(block.match(/data-timestamp="(\d+)"/)?.[1]);
  if (!Number.isFinite(tsRaw) || tsRaw <= 0) return null;
  const startTime = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
  if (startTime < now - 10 * 3600_000 || startTime > now + 7 * 24 * 3600_000) return null;

  const titles = [...block.matchAll(/<a href="[^"]+" title="([^"]+)"/g)].map((m) => decodeHtml(m[1]));
  const teams = uniqueTitles(titles).filter((name) => !/^(vs|bo\d)$/i.test(name));
  if (teams.length < 2) return null;
  const team1 = teams[0];
  const team2 = teams[1];
  if (isPlaceholderSide(team1) || isPlaceholderSide(team2)) return null;

  const logos = [...block.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => httpsUrl(m[1]));
  const logo1 = proxiedLogo(logos[0]);
  const logo2 = proxiedLogo(logos.find((src, i) => i > 0 && src && src !== logos[0]));

  const scores = [...block.matchAll(/match-info-header-scoreholder-score">([^<]*)</g)].map((m) =>
    m[1].trim()
  );
  const n1 = scores[0] != null && scores[0] !== '' && scores[0] !== 'vs' ? Number(scores[0]) : NaN;
  const n2 = scores[1] != null && scores[1] !== '' && scores[1] !== 'vs' ? Number(scores[1]) : NaN;
  const hasScore = Number.isFinite(n1) && Number.isFinite(n2);
  const finished = /match-info-header-winner|match-info-header-loser/.test(block);
  const live = !finished && startTime <= now && (hasScore || now - startTime < 5 * 3600_000);
  let score1 = hasScore ? n1 : 0;
  let score2 = hasScore ? n2 : 0;

  if (finished && (!hasScore || score1 === score2)) {
    const winPos = block.indexOf('match-info-header-winner');
    const losePos = block.indexOf('match-info-header-loser');
    if (winPos >= 0) {
      if (losePos >= 0) {
        if (winPos < losePos) {
          score1 = 1;
          score2 = 0;
        } else {
          score1 = 0;
          score2 = 1;
        }
      } else {
        score1 = 1;
        score2 = 0;
      }
    }
  }

  const status: FeedEvent['status'] = finished ? 'finished' : live ? 'live' : 'prematch';
  if (status === 'finished' && now - startTime > 6 * 3600_000) return null;

  const tour =
    decodeHtml(block.match(/match-info-tournament-name[\s\S]*?<span>([^<]+)</)?.[1] ?? '') ||
    decodeHtml(block.match(/match-info-tournament-name[\s\S]*?title="([^"]+)"/)?.[1] ?? '') ||
    label;
  const slug = `${wiki}-${team1}-${team2}-${startTime}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return cyberEvent({
    id: `lp-${slug}`.slice(0, 80),
    league: `${label} · ${tour}`,
    team1,
    team2,
    logo1,
    logo2,
    score1,
    score2,
    startTime,
    status,
    liveTime: live ? 'LIVE' : undefined,
    now,
    streamUrl: extractStreamUrl(block),
    extra: {
      scoreKind: 'maps',
      game: wiki === 'dota2' ? 'dota' : 'cs',
      maps1: score1,
      maps2: score2,
    },
  });
}

function uniqueTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    const name = raw.replace(/\/.+$/, '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    if (/^special:/i.test(name)) continue;
    if (/^(file:|blast|esl|iem|pgl|dreamhack)/i.test(name) && name.includes('/')) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
