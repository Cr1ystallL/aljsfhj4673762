'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { CoinSide } from '@/lib/games/coinflip/types';
import { cn } from '@/lib/utils';

/**
 * Coin — Monopo Saigon Style
 *
 * The protagonist of the coinflip screen. Two states:
 *   - idle              → static coin showing the requested side.
 *   - flipping (flipKey changes) → 8-rotation Y-axis spin then settles
 *                          on the resolved side.
 *
 * Faces use the brand artwork shipped in `/public`:
 *   - HEADS → /CoinFlip_Desert.png
 *   - TAILS → /CoinFlip_Reshka.png
 *
 * The settled side is communicated via the `face` prop. When the parent
 * wants to play a flip animation, it bumps `flipKey` and updates `face`
 * to the final side; the component handles the spin internally.
 *
 * Note: we use plain `<img>` rather than `next/image` because the
 * production server is not running Sharp, and `next/image` with `fill`
 * inside a SSR-rendered component otherwise crashes the Next runtime.
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
            className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              boxShadow:
                'inset 0 -6px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.18), 0 4px 24px rgba(255,172,46,0.20)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Desert.png"
              alt="Орёл"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>

          {/* TAILS face — back */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              boxShadow:
                'inset 0 -6px 16px rgba(0,0,0,0.35), inset 0 4px 10px rgba(255,255,255,0.15)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Reshka.png"
              alt="Решка"
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
