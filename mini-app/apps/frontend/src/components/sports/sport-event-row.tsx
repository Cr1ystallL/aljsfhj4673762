'use client';

import Link from 'next/link';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, OddsTrend } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/i18n/use-t';
import { formatSportsKickoff } from '@/lib/format-sports-time';
import { betFromOutcome, matchWinnerOpen, sameLeg } from '@/lib/sports-markets';
import { useSportsSlip } from '@/store/sports-slip-store';
import { LiveClock } from './live-clock';
import { teamLogoMark } from './team-mark';

interface SportEventRowProps {
  event: SportEvent;
}

export function SportEventRow({ event }: SportEventRowProps) {
  const { t, localeTag } = useT();
  const legs = useSportsSlip((s) => s.legs);
  const toggle = useSportsSlip((s) => s.toggle);
  const finished = event.status === 'finished';

  const handleOutcomeClick = (key: 'p1' | 'x' | 'p2', label: string, odds: number) => {
    if (finished || !matchWinnerOpen(event, key)) return;
    toggle(betFromOutcome(event, '1x2', key, label, odds));
  };

  const isSelected = (key: string) =>
    legs.some((leg) =>
      sameLeg(leg, {
        eventId: event.id,
        marketKind: '1x2',
        outcomeType: key,
      })
    );

  const hasThreeWay = event.odds.x !== undefined;
  const kickoff = formatSportsKickoff(event.startTime, localeTag, {
    today: t('sports.today'),
    tomorrow: t('sports.tomorrow'),
  });

  const lastNote = event.lastEvent
    ? event.lastEvent.kind === 'goal'
      ? `${t('sports.goal')} ${event.lastEvent.score1}:${event.lastEvent.score2}`
      : `${event.lastEvent.score1}:${event.lastEvent.score2}`
    : event.lastEventNotification;

  const extraMarkets = Math.max(0, (event.marketsCount ?? 0) - (hasThreeWay ? 3 : 2));

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0e1015] p-3 sm:p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-[11px] text-whisper-gray">
        <div className="flex items-center gap-1.5 min-w-0">
          {event.isLive ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              <LiveClock
                event={event}
                className="font-roobert font-bold text-red-300 tracking-tight"
              />
              {event.livePeriod && (
                <span className="font-roobert text-[10px] text-whisper-gray">
                  {event.livePeriod}
                </span>
              )}
            </div>
          ) : finished ? (
            <span className="font-roobert font-medium text-whisper-gray">
              {t('sports.finished')}
            </span>
          ) : (
            <span className="font-roobert font-medium text-whisper-gray">
              {kickoff || event.displayTime}
            </span>
          )}

          {lastNote && (
            <span className="text-frost-white/70 font-semibold text-[10px] ml-2 truncate max-w-[140px]">
              {lastNote}
            </span>
          )}
        </div>

        {extraMarkets > 0 && (
          <Link
            href={`/sport/${event.id}`}
            className="font-roobert text-[10px] font-semibold text-whisper-gray hover:text-frost-white shrink-0"
          >
            {t('sports.moreMarkets', { count: extraMarkets })}
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/sport/${event.id}`}
          className="flex flex-col gap-1.5 flex-1 min-w-0"
          aria-label={t('sports.openEvent')}
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                src={event.team1.logo}
                name={event.team1.name}
                initials={event.team1.initials}
                color={event.team1.color}
                size={22}
                mark={teamLogoMark(event)}
              />
              <span className="font-roobert text-[13px] sm:text-[14px] font-semibold text-frost-white truncate tracking-tight">
                {event.team1.name}
              </span>
              <DisciplinePips
                yellow={event.team1.yellowCards ?? event.stats?.yellow1}
                red={event.team1.redCards ?? event.stats?.red1}
              />
            </div>

            {(event.isLive || finished) && (
              <span className="font-roobert font-bold text-[14px] text-frost-white tabular-nums shrink-0 pl-1">
                {event.team1.score ?? 0}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                src={event.team2.logo}
                name={event.team2.name}
                initials={event.team2.initials}
                color={event.team2.color}
                size={22}
                mark={teamLogoMark(event)}
              />
              <span className="font-roobert text-[13px] sm:text-[14px] font-semibold text-frost-white truncate tracking-tight">
                {event.team2.name}
              </span>
              <DisciplinePips
                yellow={event.team2.yellowCards ?? event.stats?.yellow2}
                red={event.team2.redCards ?? event.stats?.red2}
              />
            </div>

            {(event.isLive || finished) && (
              <span className="font-roobert font-bold text-[14px] text-frost-white tabular-nums shrink-0 pl-1">
                {event.team2.score ?? 0}
              </span>
            )}
          </div>
        </Link>

        <div
          className={cn(
            'grid gap-1.5 shrink-0',
            hasThreeWay ? 'grid-cols-3 w-[165px] sm:w-[185px]' : 'grid-cols-2 w-[115px] sm:w-[130px]'
          )}
        >
          <OddsButtonCell
            odds={event.odds.p1}
            trend={event.odds.p1Trend}
            isSelected={isSelected('p1')}
            conflicts={legs.some((leg) => leg.eventId === event.id) && !isSelected('p1')}
            disabled={finished || !matchWinnerOpen(event, 'p1')}
            locked={!matchWinnerOpen(event, 'p1')}
            onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
          />
          {hasThreeWay && (
            <OddsButtonCell
              odds={event.odds.x!}
              trend={event.odds.xTrend}
              isSelected={isSelected('x')}
              conflicts={legs.some((leg) => leg.eventId === event.id) && !isSelected('x')}
              disabled={finished || !matchWinnerOpen(event, 'x')}
              locked={!matchWinnerOpen(event, 'x')}
              onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
            />
          )}
          <OddsButtonCell
            odds={event.odds.p2}
            trend={event.odds.p2Trend}
            isSelected={isSelected('p2')}
            conflicts={legs.some((leg) => leg.eventId === event.id) && !isSelected('p2')}
            disabled={finished || !matchWinnerOpen(event, 'p2')}
            locked={!matchWinnerOpen(event, 'p2')}
            onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
          />
        </div>
      </div>
    </div>
  );
}

function DisciplinePips({ yellow, red }: { yellow?: number; red?: number }) {
  if (!yellow && !red) return null;
  return (
    <span className="flex items-center gap-1 shrink-0 font-roobert text-[10px] font-bold tabular-nums">
      {yellow ? (
        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-300/15 text-amber-200 border border-amber-300/20">
          <span className="inline-block w-1.5 h-2 rounded-[1px] bg-amber-300" />
          {yellow}
        </span>
      ) : null}
      {red ? (
        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-400/15 text-red-300 border border-red-400/25">
          <span className="inline-block w-1.5 h-2 rounded-[1px] bg-red-400" />
          {red}
        </span>
      ) : null}
    </span>
  );
}

function OddsButtonCell({
  odds,
  trend,
  isSelected,
  conflicts,
  disabled,
  locked,
  onClick,
}: {
  odds: number;
  trend?: OddsTrend;
  isSelected: boolean;
  conflicts?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-10 rounded-xl border flex flex-col items-center justify-center',
        isSelected
          ? 'bg-frost-white text-midnight-canvas border-white/40'
          : conflicts
            ? 'bg-red-950/40 border-red-400/40 text-frost-white'
            : trend === 'up'
              ? 'bg-white/[0.04] border-emerald-400/30 text-frost-white'
              : trend === 'down'
                ? 'bg-white/[0.04] border-red-400/25 text-frost-white'
                : 'bg-white/[0.04] border-white/10 text-frost-white',
        disabled && 'opacity-40'
      )}
    >
      <div className="flex items-center gap-0.5">
        {trend === 'up' && <ArrowUp size={9} className="text-emerald-400" />}
        {trend === 'down' && <ArrowDown size={9} className="text-red-400" />}
        <span className="font-roobert text-[12.5px] font-bold tabular-nums">
          {locked ? '—' : odds.toFixed(2)}
        </span>
      </div>
    </Pressable>
  );
}
