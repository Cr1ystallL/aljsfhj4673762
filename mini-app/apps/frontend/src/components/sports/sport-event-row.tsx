'use client';

import { Tv, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, SelectedBet, OddsTrend } from '@/types/sports';
import { TeamLogo } from '@/components/ui/team-logo';

interface SportEventRowProps {
  event: SportEvent;
  selectedBet: SelectedBet | null;
  onSelectBet: (bet: SelectedBet) => void;
}

export function SportEventRow({
  event,
  selectedBet,
  onSelectBet,
}: SportEventRowProps) {
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

  const hasThreeWay = event.odds.x !== undefined;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0e1015]/95 hover:border-white/20 transition-all duration-200 p-3 sm:p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col gap-2.5">
      {/* Top Meta: Sport / Status / Stream / Markets */}
      <div className="flex items-center justify-between text-[11px] text-whisper-gray">
        <div className="flex items-center gap-1.5 min-w-0">
          {event.isLive ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="font-roobert font-bold text-red-400 tracking-tight tabular-nums">
                {event.liveTime || 'Live'}
              </span>
            </div>
          ) : (
            <span className="font-roobert font-medium text-whisper-gray">
              {event.displayTime}
            </span>
          )}

          {event.hasStream && (
            <span className="text-emerald-400 flex items-center gap-0.5 ml-1">
              <Tv size={11} strokeWidth={2.2} />
            </span>
          )}

          {event.lastEventNotification && (
            <span className="text-amber-300 font-bold text-[10px] animate-pulse ml-2 truncate max-w-[140px]">
              {event.lastEventNotification}
            </span>
          )}
        </div>

        <button
          type="button"
          className="flex items-center gap-0.5 font-roobert font-medium text-[11px] text-whisper-gray/80 hover:text-frost-white transition-colors"
        >
          <span>+{event.marketsCount}</span>
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Main Row: Teams & Live Scores vs Odds Matrix */}
      <div className="flex items-center justify-between gap-3">
        {/* Teams List with Real Logos & Live Scores */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {/* Team 1 */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                src={event.team1.logo}
                name={event.team1.name}
                initials={event.team1.initials}
                color={event.team1.color}
                size={22}
              />
              <span className="font-roobert text-[13px] sm:text-[14px] font-semibold text-frost-white truncate tracking-tight">
                {event.team1.name}
              </span>
            </div>

            {event.isLive && (
              <div className="flex items-center gap-1 shrink-0 pl-1">
                {event.team1.yellowCards ? (
                  <span className="w-2 h-3 rounded-[2px] bg-amber-400 inline-block shadow-sm" />
                ) : null}
                <span className="font-roobert font-bold text-[14px] text-frost-white tabular-nums">
                  {event.team1.score ?? 0}
                </span>
              </div>
            )}
          </div>

          {/* Team 2 */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo
                src={event.team2.logo}
                name={event.team2.name}
                initials={event.team2.initials}
                color={event.team2.color}
                size={22}
              />
              <span className="font-roobert text-[13px] sm:text-[14px] font-semibold text-frost-white truncate tracking-tight">
                {event.team2.name}
              </span>
            </div>

            {event.isLive && (
              <div className="flex items-center gap-1 shrink-0 pl-1">
                {event.team2.yellowCards ? (
                  <span className="w-2 h-3 rounded-[2px] bg-amber-400 inline-block shadow-sm" />
                ) : null}
                <span className="font-roobert font-bold text-[14px] text-frost-white tabular-nums">
                  {event.team2.score ?? 0}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Odds Matrix Buttons */}
        <div
          className={cn(
            'grid gap-1.5 shrink-0',
            hasThreeWay ? 'grid-cols-3 w-[165px] sm:w-[185px]' : 'grid-cols-2 w-[115px] sm:w-[130px]'
          )}
        >
          {/* Outcome 1 */}
          <OddsButtonCell
            odds={event.odds.p1}
            trend={event.odds.p1Trend}
            isSelected={isP1Selected}
            onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
          />

          {/* Outcome X (if available) */}
          {hasThreeWay && (
            <OddsButtonCell
              odds={event.odds.x!}
              trend={event.odds.xTrend}
              isSelected={isXSelected}
              onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
            />
          )}

          {/* Outcome 2 */}
          <OddsButtonCell
            odds={event.odds.p2}
            trend={event.odds.p2Trend}
            isSelected={isP2Selected}
            onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
          />
        </div>
      </div>
    </div>
  );
}

function OddsButtonCell({
  odds,
  trend,
  isSelected,
  onClick,
}: {
  odds: number;
  trend?: OddsTrend;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-10 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 active:scale-90 relative overflow-hidden',
        isSelected
          ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.45)]'
          : trend === 'up'
          ? 'bg-emerald-950/40 border-emerald-400/40 text-frost-white shadow-[0_0_8px_rgba(16,185,129,0.3)]'
          : trend === 'down'
          ? 'bg-red-950/40 border-red-400/40 text-frost-white shadow-[0_0_8px_rgba(239,68,68,0.3)]'
          : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-frost-white'
      )}
    >
      <div className="flex items-center gap-0.5">
        {trend === 'up' && <ArrowUp size={9} className="text-emerald-400" />}
        {trend === 'down' && <ArrowDown size={9} className="text-red-400" />}
        <span className="font-roobert text-[12.5px] font-bold tabular-nums">
          {odds.toFixed(2)}
        </span>
      </div>
    </button>
  );
}
