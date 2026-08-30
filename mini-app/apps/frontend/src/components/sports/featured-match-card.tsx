'use client';

import Link from 'next/link';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, OddsTrend } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';
import { Pressable } from '@/components/ui/pressable';
import { useT, type TxKey } from '@/i18n/use-t';
import { formatSportsKickoff } from '@/lib/format-sports-time';
import { betFromOutcome, sameLeg } from '@/lib/sports-markets';
import { useSportsSlip } from '@/store/sports-slip-store';
import { LiveClock } from './live-clock';
import { teamLogoMark } from './team-mark';

interface FeaturedMatchCardProps {
  event: SportEvent;
}

export function FeaturedMatchCard({ event }: FeaturedMatchCardProps) {
  const { t, localeTag } = useT();
  const legs = useSportsSlip((s) => s.legs);
  const toggle = useSportsSlip((s) => s.toggle);
  const finished = event.status === 'finished';

  const handleOutcomeClick = (key: 'p1' | 'x' | 'p2', label: string, odds: number) => {
    if (finished) return;
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

  const kickoff = formatSportsKickoff(event.startTime, localeTag, {
    today: t('sports.today'),
    tomorrow: t('sports.tomorrow'),
  });

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-white/12 bg-[#12141a] p-4 sm:p-5 shadow-[0_12px_35px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.07) 0%, transparent 55%)',
        }}
      />

      <div className="relative z-10 flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-roobert font-bold uppercase tracking-wider bg-white/[0.06] text-frost-white/80 border border-white/12">
            {featuredReasonLabel(event.featuredReason, t) || event.featuredTag || t('sports.matchOfDay')}
          </span>
          <span className="font-roobert text-[11px] text-whisper-gray truncate">
            {event.league}
          </span>
        </div>
        {event.isLive && (
          <span className="flex items-center gap-1.5 text-[10px] font-roobert font-semibold text-red-300 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
            LIVE
          </span>
        )}
      </div>

      <Link href={`/sport/${event.id}`} className="relative z-10 block text-center mb-4">
        <h3 className="font-roobert text-[15px] sm:text-[17px] font-bold text-frost-white tracking-tight">
          {event.team1.name} — {event.team2.name}
        </h3>
      </Link>

      <Link
        href={`/sport/${event.id}`}
        className="relative z-10 grid grid-cols-3 items-center justify-items-center mb-5"
        aria-label={t('sports.openEvent')}
      >
        <div className="flex flex-col items-center gap-2">
          <TeamLogo
            src={event.team1.logo}
            name={event.team1.name}
            initials={event.team1.initials}
            color={event.team1.color}
            size={56}
            className="border-white/20 bg-black/40"
            mark={teamLogoMark(event)}
          />
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[100px]">
            {event.team1.shortName || event.team1.name}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center">
          {event.isLive || finished ? (
            <div className="flex flex-col items-center gap-1">
              <div className="font-roobert text-[26px] sm:text-[30px] font-black text-frost-white tracking-tight tabular-nums">
                {event.team1.score ?? 0} : {event.team2.score ?? 0}
              </div>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-roobert font-bold uppercase bg-white/[0.06] text-frost-white/80 border border-white/12 tabular-nums">
                {finished ? t('sports.finished') : <LiveClock event={event} />}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <div className="font-roobert text-[22px] sm:text-[26px] font-black text-frost-white tracking-tight tabular-nums">
                {kickoff.split(' ').slice(-1)[0]}
              </div>
              <span className="font-roobert text-[11px] font-medium text-whisper-gray">
                {kickoff.replace(/\s+\S+$/, '') || t('sports.today')}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <TeamLogo
            src={event.team2.logo}
            name={event.team2.name}
            initials={event.team2.initials}
            color={event.team2.color}
            size={56}
            className="border-white/20 bg-black/40"
            mark={teamLogoMark(event)}
          />
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[100px]">
            {event.team2.shortName || event.team2.name}
          </span>
        </div>
      </Link>

      <div className="relative z-10 grid grid-cols-3 gap-2">
        <OddsButton
          label="1"
          odds={event.odds.p1}
          trend={event.odds.p1Trend}
          isSelected={isSelected('p1')}
          disabled={finished}
          onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
        />
        {event.odds.x !== undefined ? (
          <OddsButton
            label="X"
            odds={event.odds.x}
            trend={event.odds.xTrend}
            isSelected={isSelected('x')}
            disabled={finished}
            onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
          />
        ) : (
          <div className="flex items-center justify-center text-whisper-gray/50 text-[12px]">
            —
          </div>
        )}
        <OddsButton
          label="2"
          odds={event.odds.p2}
          trend={event.odds.p2Trend}
          isSelected={isSelected('p2')}
          disabled={finished}
          onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
        />
      </div>
    </div>
  );
}

function featuredReasonLabel(
  reason: SportEvent['featuredReason'],
  t: (key: TxKey) => string
): string | null {
  if (reason === 'live') return t('sports.featuredLive');
  if (reason === 'goals') return t('sports.featuredGoals');
  if (reason === 'cards') return t('sports.featuredCards');
  if (reason === 'soon') return t('sports.featuredSoon');
  if (reason === 'line') return t('sports.matchOfDay');
  return null;
}

function OddsButton({
  label,
  odds,
  trend,
  isSelected,
  disabled,
  onClick,
}: {
  label: string;
  odds: number;
  trend?: OddsTrend;
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Pressable
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex items-center justify-between px-3 py-2.5 rounded-2xl border',
        isSelected
          ? 'bg-frost-white text-midnight-canvas border-white/40'
          : trend === 'up'
            ? 'bg-white/[0.04] border-emerald-400/30 text-frost-white'
            : trend === 'down'
              ? 'bg-white/[0.04] border-red-400/25 text-frost-white'
              : 'bg-black/30 border-white/12 text-frost-white',
        disabled && 'opacity-40'
      )}
    >
      <span className="font-roobert text-[12px] opacity-75 font-semibold">{label}</span>
      <div className="flex items-center gap-1">
        {trend === 'up' && <ArrowUp size={11} className="text-emerald-400" />}
        {trend === 'down' && <ArrowDown size={11} className="text-red-400" />}
        <span className="font-roobert text-[14px] font-bold tabular-nums">
          {odds.toFixed(2)}
        </span>
      </div>
    </Pressable>
  );
}
