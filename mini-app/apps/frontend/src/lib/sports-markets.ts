import type { MarketKind, SelectedBet, SportEvent, SportMarket, SportMarketOutcome } from '@/types/sports';
import type { TxKey } from '@/i18n/use-t';

const FOOTBALL_ONLY: MarketKind[] = ['btts', 'next_goal', 'cards', 'corners', 'sooner'];

export function marketsForEvent(event: SportEvent): SportMarket[] {
  const raw = event.markets ?? [];
  if (event.sport === 'cybersport') {
    return raw.filter((m) => m.kind === '1x2');
  }
  if (event.sport !== 'football') {
    return raw.filter((m) => !FOOTBALL_ONLY.includes(m.kind));
  }
  return raw;
}

export function findMarketOutcome(
  event: SportEvent,
  kind: MarketKind,
  key: string,
  line?: number
): SportMarketOutcome | null {
  for (const market of marketsForEvent(event)) {
    if (market.kind !== kind) continue;
    if (market.lines) {
      if (line == null) continue;
      const row = market.lines.find((l) => Math.abs(l.line - line) < 0.051);
      const found = row?.outcomes.find((o) => o.key === key);
      if (found?.available) return found;
      continue;
    }
    const found = market.outcomes?.find((o) => o.key === key);
    if (found) return found.available ? found : null;
  }

  const has1x2 = marketsForEvent(event).some((m) => m.kind === '1x2');
  if (kind === '1x2' && !has1x2) {
    const odds = key === 'p1' ? event.odds.p1 : key === 'p2' ? event.odds.p2 : event.odds.x;
    if (odds && Number.isFinite(odds)) {
      return { key, label: key === 'p1' ? '1' : key === 'p2' ? '2' : 'X', odds, available: true };
    }
  }
  return null;
}

export function marketTitleKey(kind: MarketKind): TxKey {
  if (kind === 'double_chance') return 'sports.m.dc';
  if (kind === 'total') return 'sports.m.total';
  if (kind === 'handicap') return 'sports.m.ah';
  if (kind === 'btts') return 'sports.m.btts';
  if (kind === 'next_goal') return 'sports.m.next';
  if (kind === 'cards') return 'sports.m.cards';
  if (kind === 'corners') return 'sports.m.corners';
  if (kind === 'sooner') return 'sports.m.sooner';
  return 'sports.m.1x2';
}

export function formatLine(line: number): string {
  const sign = line > 0 ? '+' : '';
  return `${sign}${Number.isInteger(line) ? line.toFixed(0) : line.toFixed(1)}`;
}

export function sameLeg(
  a: Pick<SelectedBet, 'eventId' | 'marketKind' | 'outcomeType' | 'line'>,
  b: Pick<SelectedBet, 'eventId' | 'marketKind' | 'outcomeType' | 'line'>
): boolean {
  const lineA = a.line ?? null;
  const lineB = b.line ?? null;
  const lineSame =
    (lineA == null && lineB == null) ||
    (lineA != null && lineB != null && Math.abs(lineA - lineB) < 0.051);
  return (
    a.eventId === b.eventId &&
    a.marketKind === b.marketKind &&
    a.outcomeType === b.outcomeType &&
    lineSame
  );
}

export function matchWinnerOpen(event: SportEvent, key: 'p1' | 'x' | 'p2'): boolean {
  const row = event.markets?.find((m) => m.kind === '1x2')?.outcomes?.find((o) => o.key === key);
  if (!row) return true;
  return row.available;
}

export function conflictingEventIds(legs: SelectedBet[]): string[] {
  const counts = new Map<string, number>();
  for (const leg of legs) {
    counts.set(leg.eventId, (counts.get(leg.eventId) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

export function betFromOutcome(
  event: SportEvent,
  kind: MarketKind,
  key: string,
  label: string,
  odds: number,
  line?: number
): SelectedBet {
  return {
    eventId: event.id,
    eventName: `${event.team1.name} — ${event.team2.name}`,
    league: event.league,
    sport: event.sport,
    marketKind: kind,
    outcomeType: key,
    outcomeLabel: label,
    line,
    odds,
    isLive: event.isLive,
  };
}
