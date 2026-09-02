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
  const sceneRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const currentRotationRef = useRef<number>(face === 'tails' ? 180 : 0);
  const prevFlipKeyRef = useRef(flipKey);

  // Sync if face is updated when idle (e.g. loaded from server state)
  useEffect(() => {
    if (!flipping && coinRef.current) {
      const targetMod = face === 'tails' ? 180 : 0;
      const currentMod = ((currentRotationRef.current % 360) + 360) % 360;
      if (currentMod !== targetMod) {
        currentRotationRef.current = targetMod;
        coinRef.current.style.transform = `rotateY(${targetMod}deg)`;
      }
    }
  }, [face, flipping]);

  // Trigger spin animation whenever flipKey changes or flipping becomes true
  useEffect(() => {
    if (flipKey === 0 && !flipping) return;
    if (flipKey === prevFlipKeyRef.current && !flipping) return;
    prevFlipKeyRef.current = flipKey;

    const coinEl = coinRef.current;
    const sceneEl = sceneRef.current;
    const shadowEl = shadowRef.current;
    if (!coinEl) return;

    const startAngle = currentRotationRef.current;
    const targetMod = face === 'heads' ? 0 : 180;
    const currentMod = ((startAngle % 360) + 360) % 360;
    const diff = (targetMod - currentMod + 360) % 360;
    // 6 full revolutions (2160 deg) + exact delta to land on target face
    const endAngle = startAngle + 2160 + diff;
    currentRotationRef.current = endAngle;

    // 1. Spin Animation via Web Animations API (Native GPU execution, no CSS matrix glitch)
    const anim = coinEl.animate(
      [
        { transform: `rotateY(${startAngle}deg)` },
        { transform: `rotateY(${endAngle}deg)` },
      ],
      {
        duration: 2400,
        easing: 'cubic-bezier(0.16, 0.84, 0.28, 1)',
        fill: 'forwards',
      }
    );

    anim.onfinish = () => {
      coinEl.style.transform = `rotateY(${endAngle}deg)`;
    };

    // 2. Vertical Jump (Bounce) Animation
    if (sceneEl) {
      sceneEl.animate(
        [
          { transform: 'translateY(0px) scale(1)' },
          { transform: 'translateY(-75px) scale(1.14)', offset: 0.25 },
          { transform: 'translateY(0px) scale(1)', offset: 0.55 },
          { transform: 'translateY(-18px) scale(1.04)', offset: 0.7 },
          { transform: 'translateY(0px) scale(1)', offset: 0.85 },
          { transform: 'translateY(-5px) scale(1.01)', offset: 0.92 },
          { transform: 'translateY(0px) scale(1)' },
        ],
        {
          duration: 2400,
          easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          fill: 'forwards',
        }
      );
    }

    // 3. Dynamic Floor Shadow Animation
    if (shadowEl) {
      shadowEl.animate(
        [
          { transform: 'scale(1)', opacity: '0.6', filter: 'blur(4px)' },
          { transform: 'scale(0.55)', opacity: '0.15', filter: 'blur(14px)', offset: 0.25 },
          { transform: 'scale(1.08)', opacity: '0.7', filter: 'blur(3px)', offset: 0.55 },
          { transform: 'scale(0.85)', opacity: '0.4', filter: 'blur(7px)', offset: 0.7 },
          { transform: 'scale(1.02)', opacity: '0.65', filter: 'blur(3.5px)', offset: 0.85 },
          { transform: 'scale(1)', opacity: '0.6', filter: 'blur(4px)' },
        ],
        {
          duration: 2400,
          easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          fill: 'forwards',
        }
      );
    }
  }, [flipKey, face, flipping]);

  return (
    <div className={cn('relative flex flex-col items-center justify-center select-none my-3 py-3', className)}>
      {/* 3D Scene Wrapper with Perspective */}
      <div
        ref={sceneRef}
        className="w-[155px] h-[155px] sm:w-[170px] sm:h-[170px]"
        style={{
          perspective: '1200px',
          WebkitPerspective: '1200px',
        }}
      >
        {/* Tilting container for natural table angle */}
        <div
          className="w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            transform: 'rotateX(12deg)',
          }}
        >
          {/* Rotating Coin Container */}
          <div
            ref={coinRef}
            className="relative w-full h-full"
            style={{
              transformStyle: 'preserve-3d',
              WebkitTransformStyle: 'preserve-3d',
              transform: `rotateY(${face === 'tails' ? 180 : 0}deg)`,
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
      </div>

      {/* Dynamic floor shadow */}
      <div
        ref={shadowRef}
        className="w-28 h-5 rounded-[100%] bg-black/45 blur-sm mt-3 pointer-events-none"
      />
    </div>
  );
}

