import { formatOdds } from './odds.js';
import type { SportKind } from './catalog.js';

export type MarketKind = '1x2' | 'double_chance' | 'total' | 'handicap';
export type ClockDirection = 'up' | 'down' | 'none';
export type SettleResult = 'won' | 'lost' | 'void';

export interface MarketOutcome {
  key: string;
  label: string;
  odds: number;
  line?: number;
  available: boolean;
}

export interface MarketLine {
  line: number;
  outcomes: MarketOutcome[];
}

export interface SportMarket {
  id: string;
  kind: MarketKind;
  outcomes?: MarketOutcome[];
  lines?: MarketLine[];
}

export interface BetLegSpec {
  eventId: string;
  marketKind: MarketKind;
  outcomeKey: string;
  line?: number;
}

const MARGIN = 1.055;
const MAX_K = 12;

function book(p: number): number {
  const clamped = Math.min(0.97, Math.max(0.02, p));
  return formatOdds(1 / (clamped * MARGIN));
}

function oc(
  key: string,
  label: string,
  odds: number,
  line?: number,
  available = true
): MarketOutcome {
  const ok = available && Number.isFinite(odds) && odds >= 1.01;
  return { key, label, odds: ok ? odds : 1, line, available: ok };
}

function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0;
  const lam = Math.max(0.02, lambda);
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

export function remainingLambdas(
  sport: SportKind,
  minute: number
): { rem1: number; rem2: number } {
  if (sport === 'football') {
    const t = Math.max(90 - Math.min(Math.max(minute, 0), 90), 1) / 90;
    return { rem1: 1.45 * t, rem2: 1.25 * t };
  }
  if (sport === 'hockey') {
    const t = Math.max(60 - Math.min(Math.max(minute, 0), 60), 1) / 60;
    return { rem1: 2.7 * t, rem2: 2.5 * t };
  }
  return { rem1: 0.35, rem2: 0.35 };
}

export function buildMarkets(input: {
  sport: SportKind;
  score1: number;
  score2: number;
  minute: number;
  threeWay: boolean;
  odds: { p1: number; x?: number; p2: number };
}): SportMarket[] {
  const markets: SportMarket[] = [];
  const oneXTwo: MarketOutcome[] = [
    oc('p1', '1', input.odds.p1),
    ...(input.threeWay && input.odds.x != null ? [oc('x', 'X', input.odds.x)] : []),
    oc('p2', '2', input.odds.p2),
  ];
  markets.push({ id: '1x2', kind: '1x2', outcomes: oneXTwo });

  if (input.threeWay && input.odds.x != null) {
    const i1 = 1 / Math.max(1.01, input.odds.p1);
    const ix = 1 / Math.max(1.01, input.odds.x);
    const i2 = 1 / Math.max(1.01, input.odds.p2);
    const sum = i1 + ix + i2;
    const p1 = i1 / sum;
    const px = ix / sum;
    const p2 = i2 / sum;
    markets.push({
      id: 'dc',
      kind: 'double_chance',
      outcomes: [
        oc('dc1x', '1X', book(p1 + px), undefined, p1 + px > 0.04),
        oc('dc12', '12', book(p1 + p2), undefined, p1 + p2 > 0.04),
        oc('dcx2', 'X2', book(px + p2), undefined, px + p2 > 0.04),
      ],
    });
  }

  if (input.sport === 'football' || input.sport === 'hockey') {
    const { rem1, rem2 } = remainingLambdas(input.sport, input.minute);
    const rem = rem1 + rem2;
    const current = input.score1 + input.score2;
    const totalLines =
      input.sport === 'hockey'
        ? [4.5, 5.5, 6.5]
        : [1.5, 2, 2.5, 3, 3.5].filter((n) => n > current - 0.05);
    if (totalLines.length > 0) {
      markets.push({
        id: 'totals',
        kind: 'total',
        lines: totalLines.map((line) => ({
          line,
          outcomes: priceTotal(current, rem, line),
        })),
      });
    }

    const hLines = input.sport === 'hockey' ? [1.5, 2.5] : [1, 1.5, 2];
    markets.push({
      id: 'ah',
      kind: 'handicap',
      lines: hLines.map((line) => ({
        line,
        outcomes: priceHandicap(input.score1, input.score2, rem1, rem2, line),
      })),
    });
  }

  return markets;
}

function priceTotal(current: number, rem: number, line: number): MarketOutcome[] {
  let pOver = 0;
  let pUnder = 0;
  let pPush = 0;
  for (let r = 0; r <= MAX_K; r++) {
    const p = poissonPmf(r, rem);
    const total = current + r;
    if (total > line) pOver += p;
    else if (total < line) pUnder += p;
    else pPush += p;
  }
  const live = 1 - pPush;
  if (live < 0.06) {
    return [
      oc('over', 'over', 1, line, false),
      oc('under', 'under', 1, line, false),
    ];
  }
  return [
    oc('over', 'over', book(pOver / live), line, pOver / live > 0.04),
    oc('under', 'under', book(pUnder / live), line, pUnder / live > 0.04),
  ];
}

function priceHandicap(
  s1: number,
  s2: number,
  rem1: number,
  rem2: number,
  line: number
): MarketOutcome[] {
  let pHome = 0;
  let pAway = 0;
  let pPush = 0;
  for (let a = 0; a <= MAX_K; a++) {
    const pa = poissonPmf(a, rem1);
    for (let b = 0; b <= MAX_K; b++) {
      const p = pa * poissonPmf(b, rem2);
      const h = s1 + a + line;
      const aw = s2 + b;
      if (h > aw + 1e-9) pHome += p;
      else if (h < aw - 1e-9) pAway += p;
      else pPush += p;
    }
  }
  const live = 1 - pPush;
  return [
    oc('ah1', 'ah1', live > 0.06 ? book(pHome / live) : 1, line, pHome > 0.04),
    oc('ah2', 'ah2', live > 0.06 ? book(pAway / live) : 1, -line, pAway > 0.04),
  ];
}

export function marketsCount(markets: SportMarket[]): number {
  let n = 0;
  for (const market of markets) {
    if (market.lines) {
      for (const row of market.lines) {
        n += row.outcomes.filter((o) => o.available).length;
      }
    } else {
      n += (market.outcomes ?? []).filter((o) => o.available).length;
    }
  }
  return n;
}

export function findOutcome(
  markets: SportMarket[],
  kind: MarketKind,
  key: string,
  line?: number
): MarketOutcome | null {
  for (const market of markets) {
    if (market.kind !== kind) continue;
    if (market.lines) {
      if (line == null) continue;
      const row = market.lines.find((l) => Math.abs(l.line - line) < 0.051);
      const found = row?.outcomes.find((o) => o.key === key);
      if (found?.available) return found;
      continue;
    }
    const found = market.outcomes?.find((o) => o.key === key);
    if (found?.available) return found;
  }
  return null;
}

export function settleLeg(
  kind: MarketKind,
  key: string,
  line: number | undefined,
  s1: number,
  s2: number,
  threeWay: boolean
): SettleResult {
  if (kind === '1x2') {
    if (!threeWay && s1 === s2) return 'void';
    if (key === 'p1') return s1 > s2 ? 'won' : 'lost';
    if (key === 'p2') return s1 < s2 ? 'won' : 'lost';
    if (key === 'x') return s1 === s2 ? 'won' : 'lost';
    return 'void';
  }
  if (kind === 'double_chance') {
    if (key === 'dc1x') return s1 >= s2 ? 'won' : 'lost';
    if (key === 'dc12') return s1 !== s2 ? 'won' : 'lost';
    if (key === 'dcx2') return s1 <= s2 ? 'won' : 'lost';
    return 'void';
  }
  if (kind === 'total') {
    if (line == null) return 'void';
    const total = s1 + s2;
    if (Math.abs(total - line) < 1e-9) return 'void';
    if (key === 'over') return total > line ? 'won' : 'lost';
    if (key === 'under') return total < line ? 'won' : 'lost';
    return 'void';
  }
  if (kind === 'handicap') {
    if (line == null) return 'void';
    if (key === 'ah1') {
      const v = s1 + line - s2;
      if (Math.abs(v) < 1e-9) return 'void';
      return v > 0 ? 'won' : 'lost';
    }
    if (key === 'ah2') {
      const v = s2 + line - s1;
      if (Math.abs(v) < 1e-9) return 'void';
      return v > 0 ? 'won' : 'lost';
    }
  }
  return 'void';
}

export function interpolateClock(
  status: 'prematch' | 'live' | 'finished',
  clockSeconds: number | null | undefined,
  clockSyncedAt: number | undefined,
  direction: ClockDirection | undefined,
  now = Date.now()
): number | null {
  if (clockSeconds == null || !Number.isFinite(clockSeconds)) return null;
  if (status !== 'live' || !direction || direction === 'none') return Math.floor(clockSeconds);
  const extra = Math.min(
    25,
    Math.max(0, Math.floor((now - (clockSyncedAt ?? now)) / 1000))
  );
  if (direction === 'down') return Math.max(0, Math.floor(clockSeconds) - extra);
  return Math.floor(clockSeconds) + extra;
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const MARKET_KINDS = new Set<MarketKind>([
  '1x2',
  'double_chance',
  'total',
  'handicap',
]);
