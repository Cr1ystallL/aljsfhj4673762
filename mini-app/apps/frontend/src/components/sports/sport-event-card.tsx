'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketKind, SportEvent, SportMarket, SportMarketOutcome } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';
import { Pressable } from '@/components/ui/pressable';
import { useT, type TxKey } from '@/i18n/use-t';
import { formatSportsKickoff } from '@/lib/format-sports-time';
import { betFromOutcome, formatLine, marketTitleKey, sameLeg } from '@/lib/sports-markets';
import { useSportsSlip } from '@/store/sports-slip-store';
import { LiveClock } from './live-clock';
import { MatchTracker } from './match-tracker';
import { teamLogoMark } from './team-mark';

type Chip = 'popular' | MarketKind;

export function SportEventCard({ event }: { event: SportEvent }) {
  const { t, localeTag } = useT();
  const [tab, setTab] = useState<'match' | 'overview'>('match');
  const [chip, setChip] = useState<Chip>('popular');
  const finished = event.status === 'finished';
  const halted = (event.tradingHaltUntil ?? 0) > Date.now();
  const markets = event.markets ?? [];

  const chips = useMemo(() => {
    const list: Array<{ id: Chip; label: string }> = [{ id: 'popular', label: t('sports.popular') }];
    if (markets.some((m) => m.kind === '1x2')) list.push({ id: '1x2', label: t('sports.tabMatch') });
    if (markets.some((m) => m.kind === 'double_chance')) {
      list.push({ id: 'double_chance', label: '1X2' });
    }
    if (markets.some((m) => m.kind === 'total')) list.push({ id: 'total', label: t('sports.total') });
    if (markets.some((m) => m.kind === 'handicap')) list.push({ id: 'handicap', label: t('sports.handicap') });
    if (markets.some((m) => m.kind === 'btts')) list.push({ id: 'btts', label: t('sports.m.btts') });
    if (markets.some((m) => m.kind === 'next_goal')) list.push({ id: 'next_goal', label: t('sports.m.next') });
    if (markets.some((m) => m.kind === 'cards')) list.push({ id: 'cards', label: t('sports.m.cards') });
    if (markets.some((m) => m.kind === 'corners')) list.push({ id: 'corners', label: t('sports.m.corners') });
    if (markets.some((m) => m.kind === 'sooner')) list.push({ id: 'sooner', label: t('sports.m.sooner') });
    return list;
  }, [markets, t]);

  const visible = useMemo(() => {
    if (chip === 'popular') {
      return markets.filter((m) =>
        ['1x2', 'double_chance', 'total', 'handicap', 'btts', 'next_goal', 'sooner'].includes(m.kind)
      );
    }
    return markets.filter((m) => m.kind === chip);
  }, [chip, markets]);

  const kickoff = formatSportsKickoff(event.startTime, localeTag, {
    today: t('sports.today'),
    tomorrow: t('sports.tomorrow'),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="font-roobert text-[11px] text-whisper-gray px-0.5 truncate">
        {t(sportCategoryKey(event.sport))}
        {' / '}
        {event.league}
      </div>

      <div className="flex items-center gap-1 border-b border-white/10">
        {(
          [
            ['match', t('sports.tabMatch')],
            ['overview', t('sports.tabOverview')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'px-3 py-2 font-roobert text-[13px] font-semibold border-b-2 -mb-px',
              tab === id
                ? 'text-frost-white border-emerald-400'
                : 'text-whisper-gray border-transparent'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <MatchTracker event={event} />
      ) : (
        <div className="rounded-3xl border border-white/10 bg-[#12141a] p-4 shadow-[0_8px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between mb-3">
            {event.isLive ? (
              <span className="flex items-center gap-1.5 text-[11px] font-roobert font-bold text-red-300">
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                <LiveClock event={event} />
                {event.livePeriod ? <span className="text-whisper-gray font-medium">{event.livePeriod}</span> : null}
                {halted ? <span className="text-amber-200 font-medium">{t('sports.halted')}</span> : null}
              </span>
            ) : (
              <span className="font-roobert text-[11px] text-whisper-gray">
                {finished ? t('sports.finished') : kickoff}
              </span>
            )}
            <span className="font-roobert text-[10px] text-whisper-gray">
              {t('sports.moreMarkets', { count: event.marketsCount })}
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamBlock team={event.team1} align="left" mark={teamLogoMark(event)} />
            <div className="font-roobert text-[28px] font-black tabular-nums text-frost-white">
              {event.isLive || finished ? (
                <>
                  {event.team1.score ?? 0}
                  <span className="text-whisper-gray mx-1">:</span>
                  {event.team2.score ?? 0}
                </>
              ) : (
                <span className="text-[16px] text-whisper-gray font-semibold">vs</span>
              )}
            </div>
            <TeamBlock team={event.team2} align="right" mark={teamLogoMark(event)} />
          </div>
        </div>
      )}

      {tab === 'match' && (
        <>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {chips.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChip(item.id)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full font-roobert text-[12px] font-semibold border',
                  chip === item.id
                    ? 'bg-frost-white text-midnight-canvas border-white/40'
                    : 'bg-white/[0.04] text-whisper-gray border-white/10'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            {chip === 'popular' ? (
              <PopularMarkets event={event} finished={finished} />
            ) : (
              visible.map((market) => (
                <MarketGroup key={market.id} event={event} market={market} finished={finished} defaultOpen />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TeamBlock({
  team,
  align,
  mark,
}: {
  team: SportEvent['team1'];
  align: 'left' | 'right';
  mark?: 'cs' | 'dota';
}) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', align === 'right' && 'flex-row-reverse')}>
      <TeamLogo
        src={team.logo}
        name={team.name}
        initials={team.initials}
        color={team.color}
        size={36}
        mark={mark}
      />
      <span
        className={cn(
          'font-roobert text-[13px] font-semibold text-frost-white leading-tight line-clamp-2',
          align === 'right' && 'text-right'
        )}
      >
        {team.name}
      </span>
      {(team.yellowCards || team.redCards) ? (
        <span className="flex items-center gap-1 shrink-0 font-roobert text-[10px] font-bold tabular-nums">
          {team.yellowCards ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-300/15 text-amber-200 border border-amber-300/20">
              <span className="inline-block w-1.5 h-2 rounded-[1px] bg-amber-300" />
              {team.yellowCards}
            </span>
          ) : null}
          {team.redCards ? (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-400/15 text-red-300 border border-red-400/25">
              <span className="inline-block w-1.5 h-2 rounded-[1px] bg-red-400" />
              {team.redCards}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function PopularMarkets({ event, finished }: { event: SportEvent; finished: boolean }) {
  const one = event.markets?.find((m) => m.kind === '1x2');
  const dc = event.markets?.find((m) => m.kind === 'double_chance');
  const tot = event.markets?.find((m) => m.kind === 'total');
  const ah = event.markets?.find((m) => m.kind === 'handicap');
  const extra = (event.markets ?? []).filter((m) =>
    m.kind === 'btts' || m.kind === 'next_goal' || m.kind === 'sooner' || m.kind === 'cards' || m.kind === 'corners'
  );
  return (
    <>
      {one && (
        <MarketGroup
          event={event}
          market={{
            ...one,
            outcomes: [...(one.outcomes ?? []), ...(dc?.outcomes ?? [])],
          }}
          finished={finished}
          defaultOpen
          stacked
        />
      )}
      {tot && <MarketGroup event={event} market={tot} finished={finished} defaultOpen />}
      {ah && <MarketGroup event={event} market={ah} finished={finished} defaultOpen />}
      {extra.map((market) => (
        <MarketGroup key={market.id} event={event} market={market} finished={finished} defaultOpen />
      ))}
    </>
  );
}

function MarketGroup({
  event,
  market,
  finished,
  defaultOpen,
  stacked,
}: {
  event: SportEvent;
  market: SportMarket;
  finished: boolean;
  defaultOpen?: boolean;
  stacked?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen ?? true);
  const [line, setLine] = useState(market.lines?.[0]?.line);
  const activeLine = market.lines?.find((l) => l.line === line) ?? market.lines?.[0];
  const outcomes = activeLine?.outcomes ?? market.outcomes ?? [];
  const title =
    market.kind === '1x2' && stacked && outcomes.some((o) => o.key.startsWith('dc'))
      ? t('sports.m.1x2')
      : t(marketTitleKey(market.kind));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1015] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-3"
      >
        <span className="font-roobert text-[13px] font-bold text-frost-white text-left">
          {title}
        </span>
        <ChevronDown
          size={16}
          className={cn('text-whisper-gray transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {market.lines && market.lines.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/8">
              {market.lines.map((row) => (
                <button
                  key={row.line}
                  type="button"
                  onClick={() => setLine(row.line)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg font-roobert text-[12px] font-bold tabular-nums',
                    (activeLine?.line ?? line) === row.line
                      ? 'bg-white/10 text-frost-white'
                      : 'text-whisper-gray'
                  )}
                >
                  {row.line}
                </button>
              ))}
            </div>
          )}

          <OutcomeGrid
            event={event}
            kind={market.kind}
            outcomes={outcomes}
            finished={finished}
            stacked={stacked}
          />
        </div>
      )}
    </div>
  );
}

function OutcomeGrid({
  event,
  kind,
  outcomes,
  finished,
  stacked,
}: {
  event: SportEvent;
  kind: MarketKind;
  outcomes: SportMarketOutcome[];
  finished: boolean;
  stacked?: boolean;
}) {
  const { t } = useT();
  const main = outcomes.filter((o) => !o.key.startsWith('dc'));
  const extra = outcomes.filter((o) => o.key.startsWith('dc'));
  const rows = stacked && extra.length ? [main, extra] : [outcomes];

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            'grid gap-1.5',
            row.length === 2 ? 'grid-cols-2' : row.length >= 3 ? 'grid-cols-3' : 'grid-cols-1'
          )}
        >
          {row.map((outcome) => (
            <OutcomeButton
              key={`${outcome.key}-${outcome.line ?? ''}`}
              event={event}
              kind={kindFromKey(outcome.key, kind)}
              outcome={outcome}
              label={outcomeLabel(event, kindFromKey(outcome.key, kind), outcome, t)}
              finished={finished}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function kindFromKey(key: string, fallback: MarketKind): MarketKind {
  if (key.startsWith('dc')) return 'double_chance';
  if (key === 'ah1' || key === 'ah2') return 'handicap';
  return fallback;
}

function sportCategoryKey(sport: SportEvent['sport']): TxKey {
  if (sport === 'tennis') return 'sports.categories.tennis';
  if (sport === 'hockey') return 'sports.categories.hockey';
  if (sport === 'basketball') return 'sports.categories.basketball';
  if (sport === 'cybersport') return 'sports.categories.cybersport';
  if (sport === 'table_tennis') return 'sports.categories.table_tennis';
  if (sport === 'mma') return 'sports.categories.mma';
  return 'sports.categories.football';
}

function outcomeLabel(
  event: SportEvent,
  kind: MarketKind,
  outcome: SportMarketOutcome,
  t: (key: TxKey, vars?: Record<string, string | number>) => string
): string {
  if (outcome.key === 'over') return t('sports.over');
  if (outcome.key === 'under') return t('sports.under');
  if (outcome.key === 'yes') return t('sports.yes');
  if (outcome.key === 'no') return t('sports.no');
  if (outcome.key === 'none') return t('sports.nextNone');
  if (outcome.key === 'goal') return t('sports.soonerGoal');
  if (outcome.key === 'card') return t('sports.soonerCard');
  if (kind === 'next_goal' && outcome.key === 'p1') return t('sports.nextHome');
  if (kind === 'next_goal' && outcome.key === 'p2') return t('sports.nextAway');
  if (outcome.key === 'ah1' || outcome.key === 'ah2') {
    const line = outcome.line ?? 0;
    const team = outcome.key === 'ah1' ? event.team1.name : event.team2.name;
    return `${t('sports.ahLabel', { line: formatLine(line) })} · ${team}`;
  }
  if (outcome.key === 'p1') return '1';
  if (outcome.key === 'p2') return '2';
  if (outcome.key === 'x') return 'X';
  if (outcome.key === 'dc1x') return '1X';
  if (outcome.key === 'dc12') return '12';
  if (outcome.key === 'dcx2') return 'X2';
  return outcome.label;
}

function OutcomeButton({
  event,
  kind,
  outcome,
  label,
  finished,
}: {
  event: SportEvent;
  kind: MarketKind;
  outcome: SportMarketOutcome;
  label: string;
  finished: boolean;
}) {
  const toggle = useSportsSlip((s) => s.toggle);
  const selected = useSportsSlip((s) =>
    s.legs.some((leg) =>
      sameLeg(leg, {
        eventId: event.id,
        marketKind: kind,
        outcomeType: outcome.key,
        line: outcome.line,
      })
    )
  );
  const halted = (event.tradingHaltUntil ?? 0) > Date.now();
  const disabled = finished || halted || !outcome.available;

  return (
    <Pressable
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        toggle(betFromOutcome(event, kind, outcome.key, label, outcome.odds, outcome.line));
      }}
      className={cn(
        'min-h-[44px] px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2',
        selected
          ? 'bg-frost-white text-midnight-canvas border-white/40'
          : 'bg-white/[0.04] border-white/10 text-frost-white',
        disabled && 'opacity-35'
      )}
    >
      <span className="font-roobert text-[11px] font-semibold leading-tight line-clamp-2 text-left">
        {disabled && !outcome.available ? '—' : label}
      </span>
      <span className="font-roobert text-[13px] font-bold tabular-nums shrink-0">
        {outcome.available ? outcome.odds.toFixed(2) : '—'}
      </span>
    </Pressable>
  );
}
