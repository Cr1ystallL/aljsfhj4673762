'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoinSide } from '@/lib/games/coinflip/types';

/**
 * Coin — Monopo Saigon Style
 *
 * The protagonist of the coinflip screen. Two states:
 *   - idle              → static coin showing the requested side.
 *   - flipping (flipKey changes) → 8-rotation Y-axis spin then settles
 *                          on the resolved side.
 *
 * No emoji — the rocket head is the brand glyph, drawn in the brand
 * Deep Ocean wash. Tails uses a frosted-glass shield silhouette so the
 * two sides read clearly even at small sizes.
 *
 * The settled side is communicated via the `face` prop. When the parent
 * wants to play a flip animation, it bumps `flipKey` and updates `face`
 * to the final side; the component handles the spin internally.
 */

interface CoinflipCoinProps {
  face: CoinSide;
  /** Bump this to trigger a fresh flip animation. */
  flipKey: number;
  /** True while the parent is awaiting a server round resolution. */
  flipping?: boolean;
  className?: string;
}

export function CoinflipCoin({
  face,
  flipKey,
  flipping = false,
  className,
}: CoinflipCoinProps) {
  return (
    <div className={cn('relative w-36 h-36 sm:w-40 sm:h-40', className)}>
      {/* Soft halo */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full blur-2xl opacity-50"
        style={{
          background:
            'radial-gradient(circle, rgba(255,172,46,0.45) 0%, transparent 70%)',
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={flipKey}
          initial={flipping ? { rotateY: 0, scale: 0.96 } : { rotateY: 0, scale: 1 }}
          animate={
            flipping
              ? {
                  rotateY: [0, 360, 720, 1080, 1440, 1800, 2160 + (face === 'tails' ? 180 : 0)],
                  scale: [1, 1.04, 0.98, 1.04, 0.98, 1.04, 1],
                }
              : { rotateY: face === 'tails' ? 180 : 0, scale: 1 }
          }
          transition={
            flipping
              ? { duration: 1.2, ease: [0.4, 0, 0.2, 1] }
              : { duration: 0.35, ease: 'easeOut' }
          }
          style={{ transformStyle: 'preserve-3d' }}
          className="relative w-full h-full"
        >
          {/* HEADS face — front */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              background:
                'linear-gradient(135deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 60%, rgb(165, 45, 37) 100%)',
              boxShadow:
                'inset 0 -6px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.25), 0 4px 20px rgba(255,172,46,0.18)',
            }}
          >
            <span
              className="absolute inset-2 rounded-full border border-white/20"
              aria-hidden
            />
            <Rocket
              size={56}
              strokeWidth={1.6}
              className="relative text-midnight-canvas"
              style={{ transform: 'rotate(-30deg)' }}
            />
          </div>

          {/* TAILS face — back */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 100%)',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow:
                'inset 0 -6px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.15)',
            }}
          >
            <span
              className="absolute inset-2 rounded-full border border-white/20"
              aria-hidden
            />
            {/* Stylised tails glyph: nested circles for the brand-neutral side */}
            <svg
              viewBox="0 0 64 64"
              className="relative w-16 h-16 text-frost-white/85"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="32" cy="32" r="22" />
              <circle cx="32" cy="32" r="14" />
              <circle cx="32" cy="32" r="6" />
            </svg>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
