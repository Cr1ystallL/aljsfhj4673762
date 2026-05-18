'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Multiplier Strip — Monopo Saigon Style v2.
 *
 * Row of "buckets" sitting beneath the pyramid. Each bucket is a chunky
 * 3D-feeling slab with:
 *   - A glossy top edge (thin highlight strip).
 *   - A solid body whose colour intensity tracks the multiplier tier.
 *   - A darker base strip that catches a soft inset shadow — the ball
 *     visually "drops into" this slot.
 *   - A subtle scaling pulse on impact, plus a brief upwards squash so
 *     the slot looks like it absorbs the ball.
 *
 * Tiers (using the brand Deep Ocean palette + dark base):
 *   ≥100x → deep red (rare, jackpot)
 *   ≥10x  → amber-red gradient
 *   ≥2x   → solid amber
 *   ≥1x   → frosted white (par)
 *   <1x   → muted graphite (loss-leaning)
 *
 * Optimisation: the multiplier strip can have 17 cells × per-frame
 * paint cost. Each cell renders as a plain `<div>` with CSS gradients —
 * no SVG, no backdrop-filter — so the GPU can composite the whole row
 * in a single rectangle pass.
 */

interface PlinkoMultiplierStripProps {
  multipliers: number[];
  highlightedBucket?: number | null;
}

interface Tier {
  body: string; // CSS background for the body
  base: string; // CSS background for the bottom slab strip
  border: string;
  text: string;
  glow: string;
}

function tier(value: number): Tier {
  if (value >= 100) {
    return {
      body: 'linear-gradient(180deg, rgb(176, 60, 50) 0%, rgb(140, 32, 26) 100%)',
      base: 'linear-gradient(180deg, rgb(120, 28, 22) 0%, rgb(86, 18, 14) 100%)',
      border: 'rgba(255, 138, 118, 0.55)',
      text: '#ffffff',
      glow: 'rgba(165, 45, 37, 0.55)',
    };
  }
  if (value >= 10) {
    return {
      body: 'linear-gradient(180deg, rgb(232, 150, 64) 0%, rgb(190, 78, 44) 100%)',
      base: 'linear-gradient(180deg, rgb(160, 64, 38) 0%, rgb(112, 44, 26) 100%)',
      border: 'rgba(255, 200, 120, 0.5)',
      text: '#ffffff',
      glow: 'rgba(255, 172, 46, 0.45)',
    };
  }
  if (value >= 2) {
    return {
      body: 'linear-gradient(180deg, rgb(220, 162, 76) 0%, rgb(188, 124, 50) 100%)',
      base: 'linear-gradient(180deg, rgb(150, 96, 36) 0%, rgb(112, 70, 24) 100%)',
      border: 'rgba(255, 200, 120, 0.4)',
      text: '#ffffff',
      glow: 'rgba(255, 172, 46, 0.30)',
    };
  }
  if (value >= 1) {
    return {
      body: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 100%)',
      base: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      border: 'rgba(255,255,255,0.18)',
      text: 'rgba(255,255,255,0.92)',
      glow: 'rgba(255,255,255,0.18)',
    };
  }
  return {
    body: 'linear-gradient(180deg, rgba(40,40,40,0.55) 0%, rgba(28,28,28,0.55) 100%)',
    base: 'linear-gradient(180deg, rgba(20,20,20,0.7) 0%, rgba(10,10,10,0.7) 100%)',
    border: 'rgba(255,255,255,0.10)',
    text: 'rgba(220,220,220,0.75)',
    glow: 'rgba(0,0,0,0.45)',
  };
}

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
      className="grid gap-[3px] px-1"
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
                ? {
                    scale: [1, 0.92, 1.06, 1],
                    y: [0, 4, -2, 0],
                  }
                : { scale: 1, y: 0 }
            }
            transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={cn(
              'relative h-9 sm:h-10 select-none flex flex-col overflow-hidden',
              'rounded-md sm:rounded-lg'
            )}
            style={{
              border: `1px solid ${t.border}`,
              boxShadow: isHi
                ? `0 0 16px 2px ${t.glow}, 0 2px 0 rgba(0,0,0,0.45) inset`
                : `0 1px 0 rgba(255,255,255,0.06) inset, 0 -2px 0 rgba(0,0,0,0.30) inset`,
            }}
          >
            {/* Glossy top edge highlight */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px] rounded-t-[6px]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                opacity: 0.7,
              }}
            />
            {/* Body */}
            <div
              className="flex-1 flex items-center justify-center"
              style={{ background: t.body }}
            >
              <span
                className="font-roobert font-medium tabular-nums leading-none text-[10px] sm:text-[11px]"
                style={{
                  color: t.text,
                  textShadow:
                    'rgba(0,0,0,0.35) 0px 1px 0px, rgba(255,255,255,0.06) 0px -1px 0px',
                }}
              >
                {formatMult(m)}
              </span>
            </div>
            {/* Base strip — gives the bucket a "slot" feel */}
            <div
              aria-hidden
              className="h-[3px] sm:h-[4px]"
              style={{ background: t.base }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
