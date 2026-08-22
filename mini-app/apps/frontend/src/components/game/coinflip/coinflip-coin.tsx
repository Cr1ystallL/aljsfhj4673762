'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CoinSide } from '@/lib/games/coinflip/types';
import { cn } from '@/lib/utils';

/**
 * One coin in the middle of the table.
 * Rotation is derived from flipKey so a new toss interrupts the last
 * spring instead of remounting the mesh.
 */

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
  const rotateY = flipKey * 1800 + (face === 'tails' ? 180 : 0);

  return (
    <div className={cn('relative w-52 h-52 sm:w-60 sm:h-60', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-full opacity-70"
        style={{
          background:
            'radial-gradient(circle, rgba(255,172,46,0.18) 0%, rgba(255,255,255,0.04) 42%, transparent 70%)',
        }}
      />
      <motion.div
        animate={
          reduceMotion
            ? { rotateY: face === 'tails' ? 180 : 0, scale: 1 }
            : {
                rotateY,
                scale: flipping ? 1.04 : 1,
              }
        }
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : flipping
              ? { type: 'spring', visualDuration: 1.12, bounce: 0.12 }
              : { type: 'spring', stiffness: 220, damping: 26, mass: 0.85 }
        }
        style={{ transformStyle: 'preserve-3d' }}
        className="relative h-full w-full"
      >
        <CoinFace src="/CoinFlip_Desert.png" alt="Heads" />
        <CoinFace
          src="/CoinFlip_Reshka.png"
          alt="Tails"
          back
        />
      </motion.div>
    </div>
  );
}

function CoinFace({
  src,
  alt,
  back = false,
}: {
  src: string;
  alt: string;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-full"
      style={{
        transform: back ? 'rotateY(180deg)' : undefined,
        backfaceVisibility: 'hidden',
        boxShadow:
          'inset 0 0 0 2px rgba(255,255,255,0.22), inset 0 -10px 18px rgba(0,0,0,0.35), 0 18px 36px rgba(0,0,0,0.45)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-full w-full scale-[1.16] object-cover"
        draggable={false}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.28) 0%, transparent 38%, transparent 62%, rgba(0,0,0,0.28) 100%)',
        }}
      />
    </div>
  );
}
