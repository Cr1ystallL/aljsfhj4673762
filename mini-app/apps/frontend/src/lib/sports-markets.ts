import type { MarketKind, SelectedBet, SportEvent, SportMarketOutcome } from '@/types/sports';
import type { TxKey } from '@/i18n/use-t';

export function findMarketOutcome(
  event: SportEvent,
  kind: MarketKind,
  key: string,
  line?: number
): SportMarketOutcome | null {
  for (const market of event.markets ?? []) {
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

  if (kind === '1x2') {
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
