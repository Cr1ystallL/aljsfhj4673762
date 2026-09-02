'use client';

import { useEffect, useRef, useState } from 'react';
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
  // Accumulated rotation in degrees. Monotonic growth guarantees the coin always spins forward without rewinding.
  const [rotation, setRotation] = useState<number>(() => (face === 'tails' ? 180 : 0));
  const [isSpinning, setIsSpinning] = useState(false);
  const prevFlipKeyRef = useRef(flipKey);
  const isFirstRender = useRef(true);

  // Sync initial / idle state if face changes from outside while not flipping
  useEffect(() => {
    if (!flipping && !isSpinning) {
      const targetMod = face === 'tails' ? 180 : 0;
      setRotation((prev) => {
        const currentMod = ((prev % 360) + 360) % 360;
        if (currentMod === targetMod) return prev;
        const diff = (targetMod - currentMod + 360) % 360;
        return prev + diff;
      });
    }
  }, [face, flipping, isSpinning]);

  // Handle spin trigger
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (flipKey !== prevFlipKeyRef.current || flipping) {
      prevFlipKeyRef.current = flipKey;
      setIsSpinning(true);

      setRotation((prev) => {
        const targetMod = face === 'heads' ? 0 : 180;
        const currentMod = ((prev % 360) + 360) % 360;
        const diff = (targetMod - currentMod + 360) % 360;
        // 6 full revolutions (2160 deg) + exact delta to land on target face
        return prev + 2160 + diff;
      });

      const timer = setTimeout(() => {
        setIsSpinning(false);
      }, 2400);

      return () => clearTimeout(timer);
    }
  }, [flipKey, face, flipping]);

  return (
    <div className={cn('relative flex flex-col items-center justify-center select-none my-3 py-3', className)}>
      {/* 3D Scene Wrapper with Bounce Animation */}
      <div
        className={cn(
          'w-[155px] h-[155px] sm:w-[170px] sm:h-[170px]',
          isSpinning && 'animate-coin-bounce'
        )}
        style={{
          perspective: 1200,
          WebkitPerspective: 1200,
        }}
      >
        {/* Rotating Coin Container */}
        <div
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            transition: isSpinning
              ? 'transform 2.4s cubic-bezier(0.16, 0.84, 0.28, 1)'
              : 'none',
            transform: `rotateX(12deg) rotateY(${rotation}deg)`,
            willChange: 'transform',
          }}
        >
          {/* Front: ОРЁЛ (0deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg) translateZ(2px)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Desert.png"
              alt="Орёл"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </div>

          {/* Back: РЕШКА (180deg) */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            style={{
              transform: 'rotateY(180deg) translateZ(2px)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/CoinFlip_Reshka.png"
              alt="Решка"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </div>
        </div>
      </div>

      {/* Dynamic floor shadow that expands/contracts with coin jump */}
      <div
        className={cn(
          'w-28 h-5 rounded-[100%] bg-black/45 blur-sm mt-3 transition-opacity pointer-events-none',
          isSpinning && 'animate-coin-shadow'
        )}
      />
    </div>
  );
}

