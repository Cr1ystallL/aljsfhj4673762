'use client';

import { motion } from 'framer-motion';
import type { CoinSide } from '@/lib/games/coinflip/types';
import { cn } from '@/lib/utils';

/**
 * 3D Coinflip Coin with Smooth Continuous Physics & Neutral In-Flight Lighting
 *
 * Updates:
 *   1. No Spoilers — In-flight lighting is 100% neutral and only reveals the winning side color after touchdown.
 *   2. Smooth Continuous Toss — 6 full continuous rotations (2160°) + final side angle with single smooth cubic-bezier curve (no segmented stutter or stops).
 *   3. Dynamic Ground Shadow — Expands seamlessly on takeoff and locks on landing.
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
  // 6 full continuous 360-degree rotations (2160 deg) + target face angle (0 deg for Heads, 180 deg for Tails)
  const targetRotation = 2160 + (face === 'tails' ? 180 : 0);
  const isHeads = face === 'heads';

  return (
    <div
      className={cn(
        'relative w-52 h-60 sm:w-60 sm:h-68 flex flex-col items-center justify-center select-none',
        className
      )}
    >
      {/* 1. TOP VOLUMETRIC SPOTLIGHT BEAM (Neutral in-flight, side-colored when landed) */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-10 inset-x-0 h-52 transition-all duration-700 blur-2xl',
          flipping ? 'opacity-70' : 'opacity-45'
        )}
        style={{
          background: flipping
            ? 'radial-gradient(ellipse 65% 55% at 50% 15%, rgba(255, 255, 255, 0.22) 0%, rgba(251, 191, 36, 0.06) 50%, transparent 80%)'
            : isHeads
            ? 'radial-gradient(ellipse 65% 55% at 50% 15%, rgba(251, 191, 36, 0.28) 0%, rgba(245, 158, 11, 0.08) 50%, transparent 80%)'
            : 'radial-gradient(ellipse 65% 55% at 50% 15%, rgba(56, 189, 248, 0.28) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 80%)',
        }}
      />

      {/* 2. 3D PEDESTAL ARENA FLOOR (Behind and beneath the coin) */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-4 w-48 sm:w-56 h-20 flex items-center justify-center"
        style={{ perspective: 600 }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{ transform: 'rotateX(68deg)' }}
        >
          {/* Outer illuminated ring */}
          <div
            className={cn(
              'absolute inset-0 rounded-full border border-dashed transition-all duration-500',
              flipping
                ? 'border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-105'
                : isHeads
                ? 'border-amber-400/60 shadow-[0_0_22px_rgba(251,191,36,0.3)] scale-100'
                : 'border-cyan-400/60 shadow-[0_0_22px_rgba(56,189,248,0.3)] scale-100'
            )}
          />

          {/* Middle rim ring */}
          <div
            className={cn(
              'absolute inset-2 rounded-full border transition-all duration-500',
              flipping
                ? 'border-white/20 bg-white/[0.04]'
                : isHeads
                ? 'border-amber-300/40 bg-amber-500/10'
                : 'border-cyan-300/40 bg-cyan-500/10'
            )}
          />

          {/* Center platform core */}
          <div
            className={cn(
              'absolute inset-5 rounded-full transition-all duration-500 shadow-inner',
              flipping
                ? 'bg-gradient-to-t from-zinc-900 via-black to-black'
                : isHeads
                ? 'bg-gradient-to-t from-amber-950/60 via-black to-black'
                : 'bg-gradient-to-t from-cyan-950/60 via-black to-black'
            )}
          />
        </div>
      </div>

      {/* 3. DYNAMIC COIN DROP SHADOW */}
      <motion.div
        key={`shadow-${flipKey}`}
        initial={flipping ? { scale: 1, opacity: 0.7 } : false}
        animate={
          flipping
            ? {
                scale: [1, 0.4, 1],
                opacity: [0.7, 0.15, 0.75],
                filter: ['blur(10px)', 'blur(28px)', 'blur(10px)'],
              }
            : { scale: 1, opacity: 0.7, filter: 'blur(10px)' }
        }
        transition={
          flipping
            ? { duration: 1.2, ease: [0.25, 1, 0.4, 1] }
            : { duration: 0.3 }
        }
        className="pointer-events-none absolute bottom-7 w-32 sm:w-36 h-7 rounded-full bg-black/90"
      />

      {/* 4. 3D COIN PERSPECTIVE FLIGHT CONTAINER */}
      <div
        className="relative w-38 h-38 sm:w-44 sm:h-44 flex items-center justify-center z-10"
        style={{ perspective: 1200 }}
      >
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
                  rotateY: [0, targetRotation],
                  y: [0, -120, 0],
                  scale: [1, 1.16, 1],
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
                  rotateY: { duration: 1.2, ease: [0.16, 0.88, 0.22, 1] },
                  y: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
                  scale: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
                }
              : { duration: 0.3, ease: 'easeOut' }
          }
          style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
          className="relative w-full h-full rounded-full"
        >
          {/* HEADS FACE — Front (0 deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)] filter"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Desert.png"
              alt="Heads"
              className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]"
              draggable={false}
            />
          </div>

          {/* TAILS FACE — Back (180 deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)] filter"
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
              className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(56,189,248,0.2)]"
              draggable={false}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
