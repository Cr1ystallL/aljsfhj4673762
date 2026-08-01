'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useAnimation } from 'framer-motion';
import { soundManager } from '@/lib/sound/sound-manager';
import type { MacvpotParticipant } from '@/app/game/macvpot/page';

interface MacvpotRouletteProps {
  roundId: string;
  bets: MacvpotParticipant[];
  winningTicket: number | null;
  winnerUserId: string | null;
  isSpinning: boolean;
  spinDurationMs: number;
  onSpinComplete: () => void;
}

const ITEM_WIDTH = 120; // Width of each avatar item card in px

// Seeded PRNG for stable deterministic sector track order
function seededPRNG(seedStr: string) {
  let h = 2166136261 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return function () {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    return (h += h << 5) >>> 0;
  };
}

function generateRouletteSequence(
  roundId: string,
  bets: MacvpotParticipant[],
  winnerUserId: string | null,
  length = 80,
  winIndex = 70
): MacvpotParticipant[] {
  if (bets.length === 0) {
    return [];
  }

  const prng = seededPRNG(roundId || 'macvpot_seed');
  const winner = bets.find((b) => b.userId === winnerUserId) || bets[0];

  // Weighted random distribution array based on chances
  const weightedPool: MacvpotParticipant[] = [];
  for (const b of bets) {
    const weight = Math.max(1, Math.round(b.chance));
    for (let i = 0; i < weight; i++) {
      weightedPool.push(b);
    }
  }

  const seq: MacvpotParticipant[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winIndex && winnerUserId) {
      seq.push(winner);
    } else {
      const randVal = prng();
      const item = weightedPool[randVal % weightedPool.length] || bets[0];
      seq.push(item);
    }
  }

  return seq;
}

export function MacvpotRoulette({
  roundId,
  bets,
  winningTicket,
  winnerUserId,
  isSpinning,
  spinDurationMs,
  onSpinComplete,
}: MacvpotRouletteProps) {
  const [track, setTrack] = useState<MacvpotParticipant[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const lastPassedRef = useRef<number>(-1);
  const spunRoundIdRef = useRef<string | null>(null);

  // Generate track sequence when bets or roundId changes
  useEffect(() => {
    if (!isSpinning) {
      const initialSeq = generateRouletteSequence(roundId, bets, null, 80, 70);
      setTrack(initialSeq);
      void controls.set({ x: 0 });
      spunRoundIdRef.current = null;
    }
  }, [bets, isSpinning, controls, roundId]);

  useEffect(() => {
    if (isSpinning && winnerUserId && bets.length > 0) {
      // Prevent double spinning for the same round
      if (spunRoundIdRef.current === roundId) {
        return;
      }
      spunRoundIdRef.current = roundId;

      const winSeq = generateRouletteSequence(roundId, bets, winnerUserId, 80, 70);
      setTrack(winSeq);

      // Reset to start position instantly
      void controls.set({ x: 0 });
      lastPassedRef.current = 0;
      soundManager.play('ui.click');

      const durationSec = Math.max(3, spinDurationMs / 1000);

      setTimeout(() => {
        const containerWidth = containerRef.current?.offsetWidth || 340;
        const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
        // Random micro-offset inside target card (-35px to +35px)
        const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.6);

        const targetX = -(70 * ITEM_WIDTH) + centerOffset + randomStop;

        void controls
          .start({
            x: targetX,
            transition: {
              duration: durationSec,
              ease: [0.12, 0.8, 0.15, 1], // Smooth cubic-bezier deceleration curve
            },
          })
          .then(() => {
            soundManager.play('game.win');
            onSpinComplete();
          });
      }, 50);
    }
  }, [isSpinning, winnerUserId, bets, spinDurationMs, controls, onSpinComplete, roundId]);

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-2 relative bg-black/80 rounded-3xl py-5 border border-white/10 overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.9)] backdrop-blur-2xl min-h-[160px] justify-center"
    >
      {/* Central target liquid glass selector line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-[4px] bg-gradient-to-b from-amber-300 via-white to-amber-300 -translate-x-1/2 z-20 shadow-[0_0_15px_rgba(255,255,255,0.9)] pointer-events-none rounded-full" />

      {/* Side vignettes for edge fading */}
      <div className="absolute top-0 bottom-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-black to-transparent z-30 pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-black to-transparent z-30 pointer-events-none" />

      {bets.length === 0 ? (
        /* Empty Roulette State */
        <div className="w-full py-8 flex flex-col items-center justify-center text-center px-4 relative z-10">
          <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            Рулетка пуста
          </span>
          <span className="text-sm font-medium text-white/50 mt-1">
            Ожидание ставок участников для запуска вращения
          </span>
        </div>
      ) : (
        <div className="w-full overflow-hidden relative z-10">
          <motion.div
            animate={controls}
            className="flex"
            style={{ willChange: 'transform' }}
            onUpdate={(latest) => {
              if (!isSpinning) return;
              const containerWidth = containerRef.current?.offsetWidth || 340;
              const currentItemIndex = Math.floor(
                (containerWidth / 2 - parseFloat(String(latest.x))) / ITEM_WIDTH
              );

              if (currentItemIndex !== lastPassedRef.current && currentItemIndex >= 0) {
                soundManager.play('cases.tick');
                lastPassedRef.current = currentItemIndex;
              }
            }}
          >
            {track.map((item, idx) => {
              const name = item.user?.firstName || item.user?.username || 'Игрок';
              const initial = name.charAt(0).toUpperCase();

              return (
                <div
                  key={idx}
                  className="flex-shrink-0 p-1.5"
                  style={{ width: `${ITEM_WIDTH}px`, height: '140px' }}
                >
                  <div className="w-full h-full rounded-2xl border border-white/20 bg-black relative overflow-hidden shadow-xl group">
                    {/* Full-Cover Avatar Fill */}
                    {item.user?.photoUrl ? (
                      <Image
                        src={item.user.photoUrl}
                        alt={name}
                        width={120}
                        height={140}
                        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center text-white text-3xl font-black">
                        {initial}
                      </div>
                    )}

                    {/* Dark Gradients for Text Legibility */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none" />

                    {/* Top: Player Name */}
                    <div className="absolute top-2 left-2 right-2 text-center z-10">
                      <span className="text-[11px] font-bold text-white drop-shadow-md truncate block">
                        {name}
                      </span>
                    </div>

                    {/* Bottom: Chance Badge */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                      <span className="text-[10px] font-extrabold text-amber-300 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-full border border-amber-400/40 shadow-md">
                        {item.chance > 0 ? `${item.chance}%` : 'Jackpot'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
