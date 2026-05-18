'use client';

import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Plinko Multiplier Strip — Monopo Saigon Style v3 ("baskets").
 *
 * Each bucket is a chunky basket with a flat top edge, a tapered body,
 * and a generously-rounded bottom. The shape is built from a single
 * div with asymmetric border-radius (sharp on top, soft on bottom) +
 * a CSS clip-path that pulls the bottom corners inward by ~3px,
 * giving a subtle V silhouette without breaking text alignment.
 *
 * The label is split into a numeric value + a tiny "x" suffix so we
 * can size them independently and the 4-character labels (`1k`, `130`,
 * `0.2`) always fit even on a 360 px viewport. We measure the bucket's
 * actual width on mount + on resize, and step the font size down in
 * 1px increments until the label clears the bucket — no JavaScript
 * truncation, no text overflow.
 *
 * Tier palette — restricted to the brand Deep Ocean range:
 *   ≥100x → deep red basket (jackpot)
 *   ≥10x  → amber-red gradient
 *   ≥2x   → solid amber
 *   ≥1x   → frosted white (par)
 *   <1x   → muted graphite (loss-leaning)
 *
 * Optimisation: each cell renders as a single `<div>` with CSS
 * gradients — no SVG, no backdrop-filter — so the GPU composites the
 * whole row in one paint pass.
 */

interface PlinkoMultiplierStripProps {
  multipliers: number[];
  highlightedBucket?: number | null;
}

interface Tier {
  body: string;
  base: string;
  border: string;
  text: string;
  glow: string;
}

function tier(value: number): Tier {
  if (value >= 100) {
    return {
      body: 'linear-gradient(180deg, rgb(190, 64, 50) 0%, rgb(140, 32, 26) 100%)',
      base: 'rgb(86, 18, 14)',
      border: 'rgba(255, 138, 118, 0.55)',
      text: '#ffffff',
      glow: 'rgba(165, 45, 37, 0.55)',
    };
  }
  if (value >= 10) {
    return {
      body: 'linear-gradient(180deg, rgb(232, 150, 64) 0%, rgb(180, 70, 40) 100%)',
      base: 'rgb(112, 44, 26)',
      border: 'rgba(255, 200, 120, 0.5)',
      text: '#ffffff',
      glow: 'rgba(255, 172, 46, 0.45)',
    };
  }
  if (value >= 2) {
    return {
      body: 'linear-gradient(180deg, rgb(220, 162, 76) 0%, rgb(170, 110, 44) 100%)',
      base: 'rgb(112, 70, 24)',
      border: 'rgba(255, 200, 120, 0.4)',
      text: '#ffffff',
      glow: 'rgba(255, 172, 46, 0.30)',
    };
  }
  if (value >= 1) {
    return {
      body: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
      base: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.20)',
      text: 'rgba(255,255,255,0.95)',
      glow: 'rgba(255,255,255,0.18)',
    };
  }
  return {
    body: 'linear-gradient(180deg, rgba(48,48,48,0.6) 0%, rgba(28,28,28,0.6) 100%)',
    base: 'rgba(10,10,10,0.7)',
    border: 'rgba(255,255,255,0.10)',
    text: 'rgba(220,220,220,0.78)',
    glow: 'rgba(0,0,0,0.45)',
  };
}

/**
 * Tight short-form label. Designed so all 5 tiers fit a 3-character
 * budget at most:
 *   1000 → "1K"   (was "1k", uppercase reads better against the bg)
 *   130  → "130"
 *   26   → "26"
 *   9    → "9"
 *   1.5  → "1.5"
 *   0.2  → "0.2"
 */
function formatMult(m: number): string {
  if (m >= 1000) {
    const k = m / 1000;
    if (k % 1 === 0) return `${k.toFixed(0)}K`;
    return `${k.toFixed(1)}K`;
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
      className="grid gap-[2px] px-1"
      style={{
        gridTemplateColumns: `repeat(${multipliers.length}, minmax(0, 1fr))`,
      }}
    >
      {multipliers.map((m, i) => (
        <Bucket
          key={i}
          value={m}
          highlighted={highlightedBucket === i}
        />
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

  // Auto-fit the label to the bucket width.
  // Strategy: measure the bucket's inner width once + on resize; pick
  // the largest font size from the candidate set that yields
  // `labelLen * size * 0.62 ≤ innerWidth`. The 0.62 figure is the
  // average glyph aspect ratio for Roobert's medium weight at small
  // sizes — measured empirically. We round down to the nearest 1px.
  const ref = useRef<HTMLDivElement | null>(null);
  const [fontPx, setFontPx] = useState<number>(11);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - 4; // small inner padding
      if (w <= 0) return;
      // Largest size that fits, capped by tier (jackpot tiers get a
      // marginally bigger ceiling — they should feel "loud").
      const cap = value >= 10 ? 13 : 12;
      const min = 8;
      const len = label.length;
      // Aspect ≈ 0.58 for tabular-nums in Roobert; bias slightly to be
      // safe so 3-char labels never clip on narrow viewports.
      const aspect = 0.6;
      let size = cap;
      while (size > min && size * aspect * len > w) {
        size -= 1;
      }
      setFontPx(size);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label, value]);

  return (
    <motion.div
      ref={ref}
      animate={
        highlighted
          ? { scale: [1, 0.92, 1.06, 1], y: [0, 4, -2, 0] }
          : { scale: 1, y: 0 }
      }
      transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'relative h-10 sm:h-11 select-none flex items-center justify-center overflow-hidden',
        'rounded-t-[5px] rounded-b-[10px]'
      )}
      style={{
        border: `1px solid ${t.border}`,
        background: t.body,
        boxShadow: highlighted
          ? `0 0 14px 1px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -3px 0 ${t.base}`
          : `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -3px 0 ${t.base}`,
      }}
    >
      {/* Glossy top edge — a single bright pixel band right under the
          border. Reads as the rim of the basket. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 50%, transparent)',
          opacity: 0.85,
        }}
      />

      {/* Label */}
      <span
        className="relative font-roobert font-semibold tabular-nums leading-none"
        style={{
          color: t.text,
          fontSize: `${fontPx}px`,
          textShadow:
            'rgba(0,0,0,0.40) 0 1px 0, rgba(255,255,255,0.06) 0 -1px 0',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </span>
    </motion.div>
  );
}
