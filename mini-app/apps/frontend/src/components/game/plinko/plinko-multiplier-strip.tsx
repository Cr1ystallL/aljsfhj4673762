'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Multiplier Strip — Monopo Saigon Style
 *
 * Row of bucket markers aligned with the columns of the board. We use a
 * shield/badge silhouette instead of a hard pill so 4-character labels
 * (`1000x`, `130x`) fit comfortably even on a 360 px viewport. The
 * shield is drawn purely with rounded-corner CSS — no SVG — so it scales
 * gracefully and inherits the parent grid's column width.
 *
 * Tints stay restricted to the brand Deep Ocean palette:
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

function tier(value: number) {
  if (value >= 100) {
    return {
      bg: 'linear-gradient(180deg, rgba(165,45,37,0.42) 0%, rgba(165,45,37,0.22) 100%)',
      border: 'rgba(165,45,37,0.55)',
      text: '#ffffff',
    };
  }
  if (value >= 10) {
    return {
      bg: 'linear-gradient(180deg, rgba(255,172,46,0.32) 0%, rgba(165,45,37,0.20) 100%)',
      border: 'rgba(255,172,46,0.50)',
      text: '#ffffff',
    };
  }
  if (value >= 2) {
    return {
      bg: 'linear-gradient(180deg, rgba(255,172,46,0.20) 0%, rgba(255,172,46,0.06) 100%)',
      border: 'rgba(255,172,46,0.42)',
      text: '#ffffff',
    };
  }
  if (value >= 1) {
    return {
      bg: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 100%)',
      border: 'rgba(255,255,255,0.18)',
      text: 'rgba(255,255,255,0.88)',
    };
  }
  return {
    bg: 'linear-gradient(180deg, rgba(165,45,37,0.18) 0%, rgba(165,45,37,0.04) 100%)',
    border: 'rgba(165,45,37,0.35)',
    text: 'rgba(255,138,118,0.85)',
  };
}

/**
 * Format a multiplier so it stays compact:
 *   1000   → "1k"
 *   110    → "110"
 *   1.4    → "1.4"
 *   0.5    → "0.5"
 *
 * "x" suffix is omitted on small viewports where space is tight; the
 * surrounding context is enough.
 */
function formatMult(m: number): string {
  if (m >= 1000) {
    const k = m / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  if (m >= 10) return m.toFixed(0);
  if (m >= 1) return m.toString();
  return m.toFixed(1);
}

export function PlinkoMultiplierStrip({
  multipliers,
  highlightedBucket,
}: PlinkoMultiplierStripProps) {
  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${multipliers.length}, minmax(0, 1fr))`,
      }}
    >
      {multipliers.map((m, i) => {
        const isHi = highlightedBucket === i;
        const t = tier(m);
        return (
          <motion.div
            key={i}
            animate={
              isHi
                ? { scale: [1, 1.15, 1], y: [0, -2, 0], opacity: [1, 0.95, 1] }
                : { scale: 1, y: 0, opacity: 1 }
            }
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={cn(
              'relative flex items-center justify-center h-7 sm:h-8 font-roobert font-light tabular-nums select-none',
              isHi && 'ring-1 ring-frost-white/60'
            )}
            style={{
              // Shield silhouette: rounded top, mild taper at bottom via
              // border-radius. No SVG so this stays responsive.
              borderRadius: '6px 6px 9px 9px',
              background: t.bg,
              border: `1px solid ${t.border}`,
              color: t.text,
            }}
          >
            <span className="text-[9px] sm:text-[10px] leading-none tracking-tight">
              {formatMult(m)}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
