'use client';

import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Coinflip Multiplier Strip — Monopo Saigon Style
 *
 * Horizontal track of multiplier shields, one per round of the multiply
 * mode. The current round is highlighted; rounds the user has already
 * locked in are tinted brighter; future rounds are muted.
 *
 * The strip is bracketed by chevron pills (decorative — purely styled
 * to match the screen reference) so it visually reads as a tape one
 * scrolls. Contents auto-scroll the active dot into view when `round`
 * changes.
 */

interface CoinflipMultiplierStripProps {
  multipliers: number[];
  /** 1-indexed current round (the one user is about to play). */
  round: number;
}

function format(m: number): string {
  if (m >= 100) return `${m.toFixed(0)}x`;
  if (m >= 10) return `${m.toFixed(2)}x`;
  return `${m.toFixed(2)}x`;
}

export function CoinflipMultiplierStrip({
  multipliers,
  round,
}: CoinflipMultiplierStripProps) {
  const items = useMemo(() => multipliers.slice(0, 12), [multipliers]);

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl px-2 py-2 flex items-center gap-1">
      <div className="shrink-0 w-6 h-6 rounded-pill border border-white/15 flex items-center justify-center text-frost-white/60">
        <ChevronLeft size={12} strokeWidth={1.8} />
      </div>

      <div className="flex-1 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5 px-1">
          {items.map((m, i) => {
            const idx = i + 1; // 1-indexed
            const isCurrent = idx === round;
            const isPast = idx < round;
            return (
              <motion.div
                key={i}
                animate={
                  isCurrent
                    ? { scale: [1, 1.08, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 0.4 }}
                className={cn(
                  'shrink-0 px-2.5 h-7 rounded-pill border flex items-center justify-center font-roobert text-[10px] tabular-nums transition-colors',
                  isCurrent
                    ? 'border-[rgba(255,172,46,0.55)] bg-[linear-gradient(135deg,rgba(255,172,46,0.20),rgba(165,45,37,0.16))] text-frost-white'
                    : isPast
                    ? 'border-white/20 bg-white/[0.06] text-frost-white/85'
                    : 'border-white/10 bg-white/[0.03] text-whisper-gray'
                )}
              >
                x{m.toFixed(2)}
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 w-6 h-6 rounded-pill border border-white/15 flex items-center justify-center text-frost-white/60">
        <ChevronRight size={12} strokeWidth={1.8} />
      </div>
    </div>
  );
}
