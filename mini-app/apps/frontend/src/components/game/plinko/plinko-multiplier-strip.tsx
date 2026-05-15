'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Multiplier Strip — Monopo Saigon Style
 *
 * Row of pill-tiles aligned with the bucket columns of the board. Tints
 * are restricted to the brand Deep Ocean palette:
 *   - >=10x  → strong amber/red wash (rare, high reward)
 *   - 2..10x → neutral amber tint
 *   - 1..2x  → frosted white (par)
 *   - <1x    → dim red (loss-leaning)
 *
 * The currently winning bucket gets a brief flash via the
 * `highlightedBucket` prop driven by the page state.
 */

interface PlinkoMultiplierStripProps {
  multipliers: number[];
  highlightedBucket?: number | null;
}

function pillStyle(value: number): string {
  if (value >= 10) {
    return 'border-[rgba(165,45,37,0.5)] bg-[linear-gradient(135deg,rgba(255,172,46,0.28),rgba(165,45,37,0.32))] text-frost-white';
  }
  if (value >= 2) {
    return 'border-[rgba(255,172,46,0.45)] bg-[rgba(255,172,46,0.14)] text-frost-white';
  }
  if (value >= 1) {
    return 'border-white/15 bg-white/[0.05] text-frost-white/85';
  }
  return 'border-[rgba(165,45,37,0.35)] bg-[rgba(165,45,37,0.12)] text-[#ff8a76]/85';
}

export function PlinkoMultiplierStrip({
  multipliers,
  highlightedBucket,
}: PlinkoMultiplierStripProps) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${multipliers.length}, minmax(0, 1fr))` }}>
      {multipliers.map((m, i) => {
        const isHi = highlightedBucket === i;
        return (
          <motion.div
            key={i}
            animate={
              isHi
                ? { scale: [1, 1.18, 1], opacity: [1, 0.9, 1] }
                : { scale: 1, opacity: 1 }
            }
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={cn(
              'relative overflow-hidden rounded-pill border h-6 sm:h-7 flex items-center justify-center font-roobert text-[9px] sm:text-[10px] font-light tabular-nums',
              pillStyle(m),
              isHi && 'ring-1 ring-frost-white/60'
            )}
          >
            {m >= 1 ? `${m}x` : `${m.toFixed(1)}`}
          </motion.div>
        );
      })}
    </div>
  );
}
