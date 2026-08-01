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

const ITEM_WIDTH = 130; // Width of each avatar item card in px

function generateRouletteSequence(
  bets: MacvpotParticipant[],
  winnerUserId: string | null,
  length = 80,
  winIndex = 70
): MacvpotParticipant[] {
  if (bets.length === 0) {
    return [];
  }

  const winner = bets.find((b) => b.userId === winnerUserId) || bets[0];

  // Weighted random distribution array based on chances
  const weightedPool: MacvpotParticipant[] = [];
  for (const b of bets) {
    const weight = Math.max(1, Math.round(b.chance));
    for (let i = 0; i < weight; i++) {
      weightedPool.push(b);
    }
  }

  const getRandomItem = () => {
    return weightedPool[Math.floor(Math.random() * weightedPool.length)] || bets[0];
  };

  const seq: MacvpotParticipant[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winIndex && winnerUserId) {
      seq.push(winner);
    } else {
      seq.push(getRandomItem());
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
      const initialSeq = generateRouletteSequence(bets, null, 80, 70);
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

      const winSeq = generateRouletteSequence(bets, winnerUserId, 80, 70);
      setTrack(winSeq);

      // Reset to start position instantly
      void controls.set({ x: 0 });
      lastPassedRef.current = 0;
      soundManager.play('ui.click');

      const durationSec = Math.max(3, spinDurationMs / 1000);

      setTimeout(() => {
        const containerWidth = containerRef.current?.offsetWidth || 340;
        const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
        // Random micro-offset inside target card (-40px to +40px)
        const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.7);

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
      className="w-full flex flex-col gap-2 relative bg-black/60 rounded-3xl py-6 border border-white/10 overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] backdrop-blur-2xl min-h-[140px] justify-center"
    >
      {/* Central target liquid glass selector line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-[4px] bg-gradient-to-b from-amber-300 via-white to-amber-300 -translate-x-1/2 z-20 shadow-[0_0_15px_rgba(255,255,255,0.8)] pointer-events-none rounded-full" />

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
                  className="flex-shrink-0 flex items-center justify-center p-2"
                  style={{ width: `${ITEM_WIDTH}px`, height: '130px' }}
                >
                  <div className="w-full h-full rounded-2xl border border-white/10 bg-white/[0.04] p-2 flex flex-col items-center justify-center gap-1.5 backdrop-blur-md relative overflow-hidden shadow-lg group">
                    <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-white/20 via-amber-400/40 to-white/20 shadow-md relative flex items-center justify-center overflow-hidden">
                      {item.user?.photoUrl ? (
                        <Image
                          src={item.user.photoUrl}
                          alt={name}
                          width={44}
                          height={44}
                          className="rounded-full object-cover w-full h-full"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-base">
                          {initial}
                        </div>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-white/90 truncate max-w-[100px]">
                      {name}
                    </span>

                    <span className="text-[10px] font-semibold text-amber-300 bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/10">
                      {item.chance > 0 ? `${item.chance}%` : 'Jackpot'}
                    </span>
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
