'use client';

import { Tv, Flame, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, SelectedBet, OddsTrend } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';
import { useT } from '@/i18n/use-t';

interface FeaturedMatchCardProps {
  event: SportEvent;
  selectedBet: SelectedBet | null;
  onSelectBet: (bet: SelectedBet) => void;
}

export function FeaturedMatchCard({
  event,
  selectedBet,
  onSelectBet,
}: FeaturedMatchCardProps) {
  const { t } = useT();

  const handleOutcomeClick = (
    outcomeType: 'p1' | 'x' | 'p2',
    outcomeLabel: string,
    odds: number
  ) => {
    onSelectBet({
      eventId: event.id,
      eventName: `${event.team1.name} — ${event.team2.name}`,
      league: event.league,
      outcomeType,
      outcomeLabel,
      odds,
      isLive: event.isLive,
    });
  };

  const isP1Selected =
    selectedBet?.eventId === event.id && selectedBet?.outcomeType === 'p1';
  const isXSelected =
    selectedBet?.eventId === event.id && selectedBet?.outcomeType === 'x';
  const isP2Selected =
    selectedBet?.eventId === event.id && selectedBet?.outcomeType === 'p2';

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-emerald-500/30 bg-gradient-to-b from-[#092b1a] via-[#091a13] to-[#0a1012] p-4 sm:p-5 shadow-[0_12px_35px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.15)]">
      {/* Background soccer stadium watermark texture */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.45) 0%, transparent 70%)',
        }}
      />

      {/* Header: Tag + Tournament Name */}
      <div className="relative z-10 flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-roobert font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1 shadow-sm">
            <Flame size={11} className="fill-emerald-400 text-emerald-400" />
            {event.featuredTag || t('sports.matchOfDay')}
          </span>
          <span className="font-roobert text-[11px] text-whisper-gray/90 truncate max-w-[200px]">
            {event.league}
          </span>
        </div>

        {event.hasStream && (
          <span className="flex items-center gap-1 text-[10px] font-roobert font-semibold text-emerald-400/90 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Tv size={10} strokeWidth={2.5} />
            <span>LIVE</span>
          </span>
        )}
      </div>

      {/* Match Title Banner */}
      <div className="relative z-10 text-center mb-4">
        <h3 className="font-roobert text-[15px] sm:text-[17px] font-bold text-frost-white tracking-tight drop-shadow-md">
          {event.team1.name} — {event.team2.name}
        </h3>
      </div>

      {/* Match Visual: Team 1 Logo | Time / Status | Team 2 Logo */}
      <div className="relative z-10 grid grid-cols-3 items-center justify-items-center mb-5">
        {/* Team 1 Real Logo & Name */}
        <div className="flex flex-col items-center gap-2">
          <TeamLogo
            src={event.team1.logo}
            name={event.team1.name}
            initials={event.team1.initials}
            color={event.team1.color}
            size={56}
            className="border-white/25 bg-black/40 shadow-xl"
          />
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[100px]">
            {event.team1.shortName || event.team1.name}
          </span>
        </div>

        {/* Center: Match Time / Score */}
        <div className="flex flex-col items-center justify-center">
          {event.isLive ? (
            <div className="flex flex-col items-center gap-1">
              <div className="font-roobert text-[26px] sm:text-[30px] font-black text-frost-white tracking-tight tabular-nums drop-shadow-lg">
                {event.team1.score ?? 0} : {event.team2.score ?? 0}
              </div>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-roobert font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30 tabular-nums">
                {event.liveTime || 'LIVE'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <div className="font-roobert text-[24px] sm:text-[28px] font-black italic text-frost-white tracking-tight drop-shadow-md">
                03:30
              </div>
              <span className="font-roobert text-[11px] font-medium text-emerald-300/80 flex items-center gap-1">
                <span>{t('sports.today')}</span>
                <Tv size={11} className="text-emerald-400" />
              </span>
            </div>
          )}
        </div>

        {/* Team 2 Real Logo & Name */}
        <div className="flex flex-col items-center gap-2">
          <TeamLogo
            src={event.team2.logo}
            name={event.team2.name}
            initials={event.team2.initials}
            color={event.team2.color}
            size={56}
            className="border-white/25 bg-black/40 shadow-xl"
          />
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[100px]">
            {event.team2.shortName || event.team2.name}
          </span>
        </div>
      </div>

      {/* Bottom Odds Row (1 - X - 2 buttons with live trend indicators) */}
      <div className="relative z-10 grid grid-cols-3 gap-2">
        {/* Outcome 1 */}
        <OddsButton
          label="1"
          odds={event.odds.p1}
          trend={event.odds.p1Trend}
          isSelected={isP1Selected}
          onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
        />

        {/* Outcome X (Draw) */}
        {event.odds.x !== undefined ? (
          <OddsButton
            label="X"
            odds={event.odds.x!}
            trend={event.odds.xTrend}
            isSelected={isXSelected}
            onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
          />
        ) : (
          <div className="flex items-center justify-center text-whisper-gray/50 text-[12px]">
            —
          </div>
        )}

        {/* Outcome 2 */}
        <OddsButton
          label="2"
          odds={event.odds.p2}
          trend={event.odds.p2Trend}
          isSelected={isP2Selected}
          onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
        />
      </div>
    </div>
  );
}

function OddsButton({
  label,
  odds,
  trend,
  isSelected,
  onClick,
}: {
  label: string;
  odds: number;
  trend?: OddsTrend;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-all active:scale-[0.95] overflow-hidden',
        isSelected
          ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_15px_rgba(251,191,36,0.5)]'
          : trend === 'up'
          ? 'bg-emerald-950/40 border-emerald-400/40 text-frost-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
          : trend === 'down'
          ? 'bg-red-950/40 border-red-400/40 text-frost-white shadow-[0_0_10px_rgba(239,68,68,0.3)]'
          : 'bg-black/40 hover:bg-black/60 border-white/15 text-frost-white shadow-inner'
      )}
    >
      <span className="font-roobert text-[12px] opacity-75 font-semibold">{label}</span>
      <div className="flex items-center gap-1">
        {trend === 'up' && <ArrowUp size={11} className="text-emerald-400 animate-bounce" />}
        {trend === 'down' && <ArrowDown size={11} className="text-red-400 animate-bounce" />}
        <span className="font-roobert text-[14px] font-bold tabular-nums">
          {odds.toFixed(2)}
        </span>
      </div>
    </button>
  );
}
