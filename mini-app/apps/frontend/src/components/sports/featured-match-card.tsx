'use client';

import { Tv, Sparkles, Flame, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SportEvent, SelectedBet } from '@/types/sports';
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
        {/* Team 1 Crest */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-white/20 bg-gradient-to-br from-white/[0.12] to-white/[0.04] p-2 flex items-center justify-center shadow-lg backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-frost-white font-roobert font-extrabold text-[15px] shadow-inner">
              {event.team1.initials}
            </div>
          </div>
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[90px]">
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
              <span className="px-2 py-0.5 rounded-md text-[10px] font-roobert font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
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

        {/* Team 2 Crest */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border border-white/20 bg-gradient-to-br from-white/[0.12] to-white/[0.04] p-2 flex items-center justify-center shadow-lg backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/30 flex items-center justify-center text-frost-white font-roobert font-extrabold text-[15px] shadow-inner">
              {event.team2.initials}
            </div>
          </div>
          <span className="font-roobert text-[12px] font-medium text-frost-white text-center line-clamp-1 max-w-[90px]">
            {event.team2.shortName || event.team2.name}
          </span>
        </div>
      </div>

      {/* Bottom Odds Row (1 - X - 2 buttons) */}
      <div className="relative z-10 grid grid-cols-3 gap-2">
        {/* Outcome 1 */}
        <button
          onClick={() => handleOutcomeClick('p1', '1', event.odds.p1)}
          className={cn(
            'flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-all active:scale-[0.95]',
            isP1Selected
              ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_15px_rgba(251,191,36,0.5)]'
              : 'bg-black/40 hover:bg-black/60 border-white/15 text-frost-white shadow-inner'
          )}
        >
          <span className="font-roobert text-[12px] opacity-75 font-semibold">1</span>
          <span className="font-roobert text-[14px] font-bold tabular-nums">
            {event.odds.p1.toFixed(2)}
          </span>
        </button>

        {/* Outcome X (Draw) */}
        {event.odds.x !== undefined ? (
          <button
            onClick={() => handleOutcomeClick('x', 'X', event.odds.x!)}
            className={cn(
              'flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-all active:scale-[0.95]',
              isXSelected
                ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                : 'bg-black/40 hover:bg-black/60 border-white/15 text-frost-white shadow-inner'
            )}
          >
            <span className="font-roobert text-[12px] opacity-75 font-semibold">X</span>
            <span className="font-roobert text-[14px] font-bold tabular-nums">
              {event.odds.x.toFixed(2)}
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-center text-whisper-gray/50 text-[12px]">
            —
          </div>
        )}

        {/* Outcome 2 */}
        <button
          onClick={() => handleOutcomeClick('p2', '2', event.odds.p2)}
          className={cn(
            'flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-all active:scale-[0.95]',
            isP2Selected
              ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-[0_0_15px_rgba(251,191,36,0.5)]'
              : 'bg-black/40 hover:bg-black/60 border-white/15 text-frost-white shadow-inner'
          )}
        >
          <span className="font-roobert text-[12px] opacity-75 font-semibold">2</span>
          <span className="font-roobert text-[14px] font-bold tabular-nums">
            {event.odds.p2.toFixed(2)}
          </span>
        </button>
      </div>
    </div>
  );
}
