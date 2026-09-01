'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CoinSide } from '@/lib/games/coinflip/types';
import { cn } from '@/lib/utils';

interface CoinflipCoinProps {
  face: CoinSide;
  /** Increments on every toss — drives accumulated spin. */
  flipKey: number;
  flipping?: boolean;
  className?: string;
}

export function CoinflipCoin({
  face,
  flipKey,
  flipping = false,
  className,
}: CoinflipCoinProps) {
  const reduceMotion = useReducedMotion();
  // 5 full 360-degree rotations (1800 deg) per flipKey + final face angle (0 deg for Heads, 180 deg for Tails)
  const rotateY = flipKey * 1800 + (face === 'tails' ? 180 : 0);

  return (
    <div
      className={cn(
        'relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center select-none my-2',
        className
      )}
      style={{ perspective: 1200 }}
    >
      {/* Subtle static neutral ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-full opacity-60 blur-xl"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 50%, transparent 70%)',
        }}
      />

      {/* Pure in-place 3D spinning coin */}
      <motion.div
        animate={
          reduceMotion
            ? { rotateY: face === 'tails' ? 180 : 0, scale: 1 }
            : {
                rotateY,
                scale: flipping ? 1.05 : 1,
              }
        }
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : flipping
            ? { duration: 1.15, ease: [0.18, 0.88, 0.22, 1] }
            : { type: 'spring', stiffness: 220, damping: 26, mass: 0.85 }
        }
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        className="relative w-full h-full"
      >
        {/* HEADS FACE — Front (0 deg) */}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_16px_32px_rgba(0,0,0,0.65)]"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/CoinFlip_Desert.png"
            alt="Heads"
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* TAILS FACE — Back (180 deg) */}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_16px_32px_rgba(0,0,0,0.65)]"
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
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>
      </motion.div>
    </div>
  );
}
