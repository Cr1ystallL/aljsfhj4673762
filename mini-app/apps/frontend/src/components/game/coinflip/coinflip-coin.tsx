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
  // Compute target angle: 5 full rotations (1800 deg) + target face (0 for heads, 180 for tails)
  const targetRotation = 1800 + (face === 'tails' ? 180 : 0);

  return (
    <div
      className={cn('relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center', className)}
      style={{ perspective: 1200 }}
    >
      {/* Dynamic Drop Shadow beneath coin */}
      <motion.div
        animate={
          flipping
            ? {
                scale: [1, 0.6, 0.45, 0.6, 1],
                opacity: [0.6, 0.25, 0.15, 0.25, 0.6],
                filter: ['blur(12px)', 'blur(24px)', 'blur(30px)', 'blur(24px)', 'blur(12px)'],
              }
            : { scale: 1, opacity: 0.6, filter: 'blur(12px)' }
        }
        transition={{ duration: 1.2, ease: [0.25, 1, 0.5, 1] }}
        className="absolute -bottom-6 w-36 h-6 rounded-full bg-black/80 pointer-events-none"
      />

      <motion.div
        key={flipKey}
        initial={
          flipping
            ? { rotateY: 0, y: 0, scale: 1 }
            : { rotateY: face === 'tails' ? 180 : 0, y: 0, scale: 1 }
        }
        animate={
          flipping
            ? {
                rotateY: [0, 360, 720, 1080, 1440, targetRotation],
                y: [0, -50, -80, -50, 0],
                scale: [1, 1.08, 1.15, 1.08, 1],
              }
            : {
                rotateY: face === 'tails' ? 180 : 0,
                y: 0,
                scale: 1,
              }
        }
        transition={
          flipping
            ? {
                rotateY: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                y: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
              }
            : { duration: 0.3, ease: 'easeOut' }
        }
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        className="relative w-full h-full rounded-full shadow-2xl"
      >
        {/* HEADS face — front (0 deg) */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center border border-amber-500/20 shadow-inner bg-gradient-to-br from-amber-900/40 via-black to-black"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/CoinFlip_Desert.png"
            alt="Heads"
            className="w-full h-full object-cover scale-[1.18]"
            draggable={false}
          />
        </div>

        {/* TAILS face — back (180 deg) */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center border border-cyan-500/20 shadow-inner bg-gradient-to-br from-cyan-900/40 via-black to-black"
          style={{
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/CoinFlip_Reshka.png"
            alt="Tails"
            className="w-full h-full object-cover scale-[1.18]"
            draggable={false}
          />
        </div>
      </motion.div>
    </div>
  );
}
