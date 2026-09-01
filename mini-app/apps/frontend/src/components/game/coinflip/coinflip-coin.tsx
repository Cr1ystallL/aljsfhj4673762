'use client';

import { motion } from 'framer-motion';
import type { CoinSide } from '@/lib/games/coinflip/types';
import { cn } from '@/lib/utils';

/**
 * 3D Coinflip Coin with Realistic Physics & 3D Arena Stage
 *
 * Features:
 *   1. 3D Perspective Stage — Concentric illuminated pedestal rings with dynamic neon glow.
 *   2. Volumetric Top Spotlight — Deep atmospheric lighting beam focused on the toss zone.
 *   3. True 3D Physics Flip — 6 full rotations (2160°) + landing face, gyroscopic precession (wobble on X/Z axes), parabolic vertical flight arc, and landing squash.
 *   4. Seamless Coin Textures — Clean gold/silver faces without square bounding box artifacts.
 *   5. Dynamic Floor Shadow — Expands/diffuses during flight and sharpens on touchdown.
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
  // 6 full 360-degree rotations (2160 deg) + target face angle (0 deg for Heads, 180 deg for Tails)
  const targetRotation = 2160 + (face === 'tails' ? 180 : 0);
  const isHeads = face === 'heads';

  return (
    <div
      className={cn(
        'relative w-56 h-64 sm:w-64 sm:h-72 flex flex-col items-center justify-center select-none',
        className
      )}
    >
      {/* 1. TOP VOLUMETRIC SPOTLIGHT BEAM */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-12 inset-x-0 h-56 transition-opacity duration-700 blur-2xl',
          flipping ? 'opacity-85' : 'opacity-45'
        )}
        style={{
          background: isHeads
            ? 'radial-gradient(ellipse 65% 55% at 50% 15%, rgba(251, 191, 36, 0.28) 0%, rgba(245, 158, 11, 0.08) 50%, transparent 80%)'
            : 'radial-gradient(ellipse 65% 55% at 50% 15%, rgba(56, 189, 248, 0.28) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 80%)',
        }}
      />

      {/* 2. 3D PEDESTAL ARENA FLOOR (Behind and beneath the coin) */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-4 w-52 sm:w-60 h-24 flex items-center justify-center"
        style={{ perspective: 600 }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{ transform: 'rotateX(68deg)' }}
        >
          {/* Outer illuminated neon ring */}
          <div
            className={cn(
              'absolute inset-0 rounded-full border border-dashed transition-all duration-700',
              flipping
                ? isHeads
                  ? 'border-amber-400/60 shadow-[0_0_25px_rgba(251,191,36,0.35)] scale-105'
                  : 'border-cyan-400/60 shadow-[0_0_25px_rgba(56,189,248,0.35)] scale-105'
                : 'border-white/15 shadow-[0_0_15px_rgba(0,0,0,0.8)] scale-100'
            )}
          />

          {/* Middle metallic rim ring */}
          <div
            className={cn(
              'absolute inset-2.5 rounded-full border transition-all duration-700',
              flipping
                ? isHeads
                  ? 'border-amber-300/45 bg-amber-500/10'
                  : 'border-cyan-300/45 bg-cyan-500/10'
                : 'border-white/10 bg-white/[0.02]'
            )}
          />

          {/* Inner podium disc core */}
          <div
            className={cn(
              'absolute inset-6 rounded-full transition-all duration-500 shadow-inner',
              flipping
                ? isHeads
                  ? 'bg-gradient-to-t from-amber-950/70 via-black to-black'
                  : 'bg-gradient-to-t from-cyan-950/70 via-black to-black'
                : 'bg-gradient-to-t from-zinc-900/60 via-black to-black'
            )}
          />

          {/* Center glow pulse dot */}
          <motion.div
            animate={
              flipping
                ? {
                    scale: [1, 1.4, 0.9, 1.3, 1],
                    opacity: [0.4, 0.9, 0.5, 0.8, 0.4],
                  }
                : { scale: 1, opacity: 0.3 }
            }
            transition={{ duration: 1.25, ease: 'easeInOut' }}
            className={cn(
              'w-8 h-8 rounded-full blur-sm',
              isHeads ? 'bg-amber-400' : 'bg-cyan-400'
            )}
          />
        </div>
      </div>

      {/* 3. DYNAMIC COIN DROP SHADOW */}
      <motion.div
        animate={
          flipping
            ? {
                scale: [1, 0.45, 0.3, 0.45, 1.05, 1],
                opacity: [0.7, 0.2, 0.1, 0.2, 0.75, 0.7],
                filter: [
                  'blur(10px)',
                  'blur(24px)',
                  'blur(32px)',
                  'blur(24px)',
                  'blur(8px)',
                  'blur(10px)',
                ],
              }
            : { scale: 1, opacity: 0.7, filter: 'blur(10px)' }
        }
        transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute bottom-8 w-32 sm:w-36 h-8 rounded-full bg-black/90"
      />

      {/* 4. 3D COIN PERSPECTIVE FLIGHT CONTAINER */}
      <div
        className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center z-10"
        style={{ perspective: 1400 }}
      >
        <motion.div
          key={flipKey}
          initial={
            flipping
              ? { rotateY: 0, rotateX: 0, rotateZ: 0, y: 0, scale: 1 }
              : { rotateY: face === 'tails' ? 180 : 0, rotateX: 0, rotateZ: 0, y: 0, scale: 1 }
          }
          animate={
            flipping
              ? {
                  rotateY: [0, 360, 720, 1260, 1800, targetRotation],
                  rotateX: [0, 16, -12, 8, -3, 0],
                  rotateZ: [0, -10, 8, -5, 2, 0],
                  y: [0, -95, -145, -95, -12, 0],
                  scale: [1, 1.18, 1.3, 1.15, 0.96, 1],
                }
              : {
                  rotateY: face === 'tails' ? 180 : 0,
                  rotateX: 0,
                  rotateZ: 0,
                  y: 0,
                  scale: 1,
                }
          }
          transition={
            flipping
              ? {
                  rotateY: { duration: 1.25, ease: [0.18, 0.95, 0.3, 1] },
                  rotateX: { duration: 1.25, ease: [0.22, 1, 0.36, 1] },
                  rotateZ: { duration: 1.25, ease: [0.22, 1, 0.36, 1] },
                  y: { duration: 1.25, ease: [0.25, 1, 0.4, 1] },
                  scale: { duration: 1.25, ease: [0.25, 1, 0.4, 1] },
                }
              : { duration: 0.35, ease: 'easeOut' }
          }
          style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
          className="relative w-full h-full rounded-full"
        >
          {/* HEADS FACE — Front (0 deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)] filter"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Desert.png"
              alt="Heads (Gold)"
              className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(251,191,36,0.25)]"
              draggable={false}
            />

            {/* Specular sheen sweep */}
            {flipping && (
              <motion.div
                initial={{ opacity: 0, x: '-100%' }}
                animate={{ opacity: [0, 0.6, 0], x: ['-100%', '100%'] }}
                transition={{ duration: 0.6, repeat: 2, ease: 'linear' }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
              />
            )}
          </div>

          {/* TAILS FACE — Back (180 deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)] filter"
            style={{
              transform: 'rotateY(180deg)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Reshka.png"
              alt="Tails (Silver)"
              className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              draggable={false}
            />

            {/* Specular sheen sweep */}
            {flipping && (
              <motion.div
                initial={{ opacity: 0, x: '-100%' }}
                animate={{ opacity: [0, 0.6, 0], x: ['-100%', '100%'] }}
                transition={{ duration: 0.6, repeat: 2, ease: 'linear' }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
              />
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
