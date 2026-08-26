'use client';

import { Tv, ChevronRight, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, SelectedBet } from '@/types/sports';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';

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
              <span className="font-roobert font-bold text-red-400 tracking-tight">
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
        {/* Teams List with Live Scores */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {/* Team 1 */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-whisper-gray font-roobert text-[9px] font-bold shrink-0">
                {event.team1.initials}
              </div>
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
              <div className="w-5 h-5 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-whisper-gray font-roobert text-[9px] font-bold shrink-0">
                {event.team2.initials}
              </div>
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
          <button
            onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
            className={cn(
              'h-10 rounded-xl border flex flex-col items-center justify-center transition-all duration-150 active:scale-90',
              isP1Selected
                ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.45)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-frost-white'
            )}
          >
            <span className="font-roobert text-[12.5px] font-bold tabular-nums">
              {event.odds.p1.toFixed(2)}
            </span>
          </button>

          {/* Outcome X (if available) */}
          {hasThreeWay && (
            <button
              onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
              className={cn(
                'h-10 rounded-xl border flex flex-col items-center justify-center transition-all duration-150 active:scale-90',
                isXSelected
                  ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.45)]'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-frost-white'
              )}
            >
              <span className="font-roobert text-[12.5px] font-bold tabular-nums">
                {event.odds.x!.toFixed(2)}
              </span>
            </button>
          )}

          {/* Outcome 2 */}
          <button
            onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
            className={cn(
              'h-10 rounded-xl border flex flex-col items-center justify-center transition-all duration-150 active:scale-90',
              isP2Selected
                ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.45)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-frost-white'
            )}
          >
            <span className="font-roobert text-[12.5px] font-bold tabular-nums">
              {event.odds.p2.toFixed(2)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
