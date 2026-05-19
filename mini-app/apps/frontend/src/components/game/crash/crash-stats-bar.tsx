'use client';

import { memo } from 'react';
import { Coins, Trophy } from 'lucide-react';

/**
 * Crash Stats Bar — Monopo Saigon Style
 *
 * Two compact tiles: live distinct-player count and total wagered for the
 * current round. Both values come from the live WebSocket snapshot.
 *
 * Memoised so the slow snapshot's other fields churning doesn't force a
 * re-render here.
 */

interface CrashStatsBarProps {
  playerCount: number;
  totalBets: number;
  currency?: string;
}

export const CrashStatsBar = memo(function CrashStatsBar({
  playerCount,
  totalBets,
  currency = 'zł',
}: CrashStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        icon={<Trophy size={13} className="text-frost-white/55" strokeWidth={2} />}
        label="Players"
        value={playerCount.toLocaleString('en-US')}
      />
      <Tile
        icon={<Coins size={13} className="text-frost-white/55" strokeWidth={2} />}
        label="Stakes"
        value={`${totalBets.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${currency}`}
      />
    </div>
  );
});

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          {label}
        </span>
      </div>
      <div className="mt-1 font-roobert text-[18px] font-light text-frost-white tabular-nums">
        {value}
      </div>
    </div>
  );
}
