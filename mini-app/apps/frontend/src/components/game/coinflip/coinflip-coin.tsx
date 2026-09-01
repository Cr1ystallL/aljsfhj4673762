'use client';

import { useEffect, useRef } from 'react';
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
  const totalRotationRef = useRef<number>(face === 'tails' ? 180 : 0);
  const coinRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      totalRotationRef.current = face === 'tails' ? 180 : 0;
      if (coinRef.current) {
        coinRef.current.style.transform = `rotateY(${totalRotationRef.current}deg)`;
      }
      return;
    }

    if (!flipping) return;

    const isHeads = face === 'heads';
    const spins = 5 + Math.floor(Math.random() * 2);
    const targetMod = isHeads ? 0 : 180;
    const currentMod = ((totalRotationRef.current % 360) + 360) % 360;
    const delta = spins * 360 + ((targetMod - currentMod + 360) % 360);
    totalRotationRef.current += delta;

    if (coinRef.current) {
      coinRef.current.style.transform = `rotateY(${totalRotationRef.current}deg)`;
    }

    if (sceneRef.current) {
      sceneRef.current.classList.remove('animate-coin-bounce');
      void sceneRef.current.offsetWidth;
      sceneRef.current.classList.add('animate-coin-bounce');
    }
  }, [flipKey, face, flipping]);

  return (
    <div className={cn('relative flex items-center justify-center select-none my-3', className)}>
      <div
        ref={sceneRef}
        className="w-[155px] h-[155px] sm:w-[165px] sm:h-[165px]"
        style={{ perspective: 1000 }}
      >
        <div
          ref={coinRef}
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 2.6s cubic-bezier(0.22, 0.61, 0.36, 1)',
            transform: `rotateY(${face === 'tails' ? 180 : 0}deg)`,
          }}
        >
          {/* Front: ОРЁЛ */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
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

          {/* Back: РЕШКА */}
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
            style={{
              transform: 'rotateY(180deg)',
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
    </div>
  );
}
