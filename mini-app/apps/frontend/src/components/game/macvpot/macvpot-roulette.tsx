'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useAnimation } from 'framer-motion';
import { soundManager } from '@/lib/sound/sound-manager';
import type { MacvpotParticipant } from '@/app/game/macvpot/page';

interface MacvpotRouletteProps {
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
    const dummy: MacvpotParticipant = {
      betId: 'dummy',
      userId: 'dummy',
      amount: 0,
      ticketStart: 0,
      ticketEnd: 0,
      chance: 100,
      placedAt: Date.now(),
      user: { firstName: 'Ожидание игроков', photoUrl: null },
    };
    return Array.from({ length }, () => dummy);
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
      // Teaser mechanic: 30% chance near winner index to place highest bettor
      seq.push(getRandomItem());
    }
  }

  return seq;
}

export function MacvpotRoulette({
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

  // Generate track sequence when bets or state changes
  useEffect(() => {
    if (!isSpinning) {
      const initialSeq = generateRouletteSequence(bets, null, 80, 70);
      setTrack(initialSeq);
      void controls.set({ x: 0 });
    }
  }, [bets, isSpinning, controls]);

  useEffect(() => {
    if (isSpinning && winnerUserId) {
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
  }, [isSpinning, winnerUserId, bets, spinDurationMs, controls, onSpinComplete]);

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-2 relative bg-black/40 rounded-2xl py-6 border border-white/10 overflow-hidden shadow-2xl backdrop-blur-xl"
    >
      {/* Center glowing radial aura */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140px] h-[160%] opacity-40 pointer-events-none blur-[45px] z-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.9) 0%, transparent 70%)' }}
      />

      {/* Central target selector line with glass glow effect */}
      <div className="absolute top-0 bottom-0 left-1/2 w-[6px] bg-gradient-to-b from-purple-400 via-white to-purple-400 -translate-x-1/2 z-20 shadow-[0_0_20px_rgba(168,85,247,0.9)] backdrop-blur-md pointer-events-none border-x border-white/40 rounded-full" />

      {/* Side vignettes for edge fading */}
      <div className="absolute top-0 bottom-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-[#0c0c14] to-transparent z-30 pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-[#0c0c14] to-transparent z-30 pointer-events-none" />

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
            const chanceColor =
              item.chance >= 50
                ? 'from-purple-600 to-indigo-600'
                : item.chance >= 20
                ? 'from-blue-600 to-cyan-600'
                : 'from-slate-700 to-slate-800';

            return (
              <div
                key={idx}
                className="flex-shrink-0 flex items-center justify-center p-2"
                style={{ width: `${ITEM_WIDTH}px`, height: '130px' }}
              >
                <div className="w-full h-full rounded-xl border border-white/10 bg-white/[0.04] p-2 flex flex-col items-center justify-center gap-1.5 backdrop-blur-sm relative overflow-hidden shadow-md group">
                  <div
                    className={`w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr ${chanceColor} shadow-lg relative flex items-center justify-center overflow-hidden`}
                  >
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
                      <div className="w-full h-full rounded-full bg-midnight-canvas flex items-center justify-center text-frost-white font-bold text-base">
                        {initial}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-semibold text-frost-white/90 truncate max-w-[100px]">
                    {name}
                  </span>

                  <span className="text-[10px] font-medium text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/20">
                    {item.chance > 0 ? `${item.chance}%` : 'Jackpot'}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
