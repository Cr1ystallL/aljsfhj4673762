'use client';

import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Plinko Multiplier Strip — square buckets with a coloured base bar.
 *
 * Each bucket is the simplest shape that reads cleanly:
 *
 *   - A semi-transparent square in the tier colour, with a subtle
 *     border in the same hue. The transparency lets the page bg
 *     show through so the row blends into the board above.
 *   - Below the body, a solid bar (~3 px) in the SAME tier colour at
 *     full opacity. This is the "shelf" the ball drops into; it's
 *     what gives each bucket its identity at a glance.
 *
 * No 3D, no gradients, no glossy highlights. Just colour-coded
 * rectangles + a thick coloured base.
 *
 * Tiers (deep ocean palette):
 *   ≥100x → red
 *   ≥10x  → orange-red
 *   ≥2x   → amber
 *   ≥1x   → frost white
 *   <1x   → cool grey
 *
 * Labels are auto-fit to the bucket width so 4-character values
 * (`130`, `0.2`, `1K`) never clip.
 */

interface PlinkoMultiplierStripProps {
  multipliers: number[];
  highlightedBucket?: number | null;
}

interface Tier {
  /** Body fill — semi-transparent. */
  body: string;
  /** Bottom bar — opaque, same hue. */
  bar: string;
  /** Border on the body. */
  border: string;
  /** Label colour. */
  text: string;
}

function tier(value: number): Tier {
  if (value >= 100) {
    return {
      body: 'rgba(220, 60, 50, 0.30)',
      bar: 'rgb(220, 60, 50)',
      border: 'rgba(220, 60, 50, 0.55)',
      text: '#ffffff',
    };
  }
  if (value >= 10) {
    return {
      body: 'rgba(255, 130, 56, 0.30)',
      bar: 'rgb(255, 130, 56)',
      border: 'rgba(255, 130, 56, 0.55)',
      text: '#ffffff',
    };
  }
  if (value >= 2) {
    return {
      body: 'rgba(255, 172, 46, 0.28)',
      bar: 'rgb(255, 172, 46)',
      border: 'rgba(255, 172, 46, 0.55)',
      text: '#ffffff',
    };
  }
  if (value >= 1) {
    return {
      body: 'rgba(255, 255, 255, 0.10)',
      bar: 'rgba(255, 255, 255, 0.65)',
      border: 'rgba(255, 255, 255, 0.22)',
      text: 'rgba(255, 255, 255, 0.95)',
    };
  }
  return {
    body: 'rgba(160, 160, 160, 0.10)',
    bar: 'rgba(180, 180, 180, 0.45)',
    border: 'rgba(255, 255, 255, 0.10)',
    text: 'rgba(220, 220, 220, 0.78)',
  };
}

/** Compact short-form label, max 3 chars. */
function formatMult(m: number): string {
  if (m >= 1000) {
    const k = m / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}K` : `${k.toFixed(1)}K`;
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
      className="grid gap-[2px]"
      style={{
        gridTemplateColumns: `repeat(${multipliers.length}, minmax(0, 1fr))`,
      }}
    >
      {multipliers.map((m, i) => (
        <Bucket key={i} value={m} highlighted={highlightedBucket === i} />
      ))}
    </div>
  );
}

function Bucket({
  value,
  highlighted,
}: {
  value: number;
  highlighted: boolean;
}) {
  const t = tier(value);
  const label = formatMult(value);

  // Auto-fit label to bucket width: pick the largest font size where
  // `len * size * aspect ≤ width`. ResizeObserver re-runs on layout
  // changes so 17 cells across a phone screen still read.
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontPx, setFontPx] = useState<number>(11);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 4;
      if (w <= 0) return;
      const cap = 13;
      const min = 8;
      const len = label.length;
      const aspect = 0.6; // Roobert tabular-nums semibold
      let size = cap;
      while (size > min && size * aspect * len > w) size -= 1;
      setFontPx(size);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);

  return (
    <motion.div
      ref={ref}
      animate={
        highlighted
          ? { scale: [1, 0.94, 1.05, 1], y: [0, 3, -1, 0] }
          : { scale: 1, y: 0 }
      }
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative h-10 sm:h-11 select-none flex flex-col overflow-hidden rounded-[4px]'
      )}
      style={{
        border: `1px solid ${t.border}`,
        background: t.body,
      }}
    >
      {/* Body — just the label, centred */}
      <div className="flex-1 flex items-center justify-center">
        <span
          className="font-roobert font-semibold tabular-nums leading-none"
          style={{
            color: t.text,
            fontSize: `${fontPx}px`,
            letterSpacing: '-0.01em',
            textShadow: 'rgba(0,0,0,0.45) 0 1px 0',
          }}
        >
          {label}
        </span>
      </div>
      {/* Solid bar at the bottom — the bucket's identity */}
      <div
        aria-hidden
        className="h-[3px] sm:h-[4px]"
        style={{ background: t.bar }}
      />
    </motion.div>
  );
}
