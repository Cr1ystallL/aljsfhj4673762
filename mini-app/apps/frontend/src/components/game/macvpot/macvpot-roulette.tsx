'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useAnimation } from 'framer-motion';
import { soundManager } from '@/lib/sound/sound-manager';
import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';
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
  const { t } = useT();
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
      className="w-full relative min-h-[168px] justify-center rounded-[20px] border border-white/12 bg-white/[0.04] py-5 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl flex flex-col"
    >
      {/* Waiting / settle: a thin glass pointer, not a neon bar. */}
      <div className="absolute top-0 bottom-0 left-1/2 z-20 -translate-x-1/2 pointer-events-none flex flex-col items-center">
        <div
          className={cn(
            'w-px flex-1 bg-gradient-to-b from-[#F4E8C8]/70 via-white/35 to-[#F4E8C8]/70',
            !isSpinning && bets.length > 0 && 'animate-pulse'
          )}
        />
      </div>
      <div className="absolute top-2 left-1/2 z-20 -translate-x-1/2 pointer-events-none">
        <div className="h-2.5 w-2.5 rotate-45 rounded-[1px] bg-[#F4E8C8] shadow-[0_0_12px_rgba(244,232,200,0.28)]" />
      </div>

      <div className="absolute top-0 bottom-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-[#050505] to-transparent z-30 pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-[#050505] to-transparent z-30 pointer-events-none" />

      {bets.length === 0 ? (
        <div className="w-full py-8 flex flex-col items-center justify-center text-center px-4 relative z-10">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            {t('macvpot.emptyTitle')}
          </span>
          <span className="text-sm font-roobert text-white/55 mt-1.5">
            {t('macvpot.emptyHint')}
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
              const name = item.user?.firstName || item.user?.username || t('macvpot.player');
              const initial = name.charAt(0).toUpperCase();

              return (
                <div
                  key={idx}
                  className="flex-shrink-0 p-1.5"
                  style={{ width: `${ITEM_WIDTH}px`, height: '140px' }}
                >
                  <div className="w-full h-full rounded-[16px] border border-white/12 bg-white/[0.04] relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {item.user?.photoUrl ? (
                      <Image
                        src={item.user.photoUrl}
                        alt={name}
                        width={120}
                        height={140}
                        className="absolute inset-0 w-full h-full object-cover opacity-90"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 w-full h-full bg-[#121214] flex items-center justify-center text-frost-white/80 text-2xl font-roobert font-light">
                        {initial}
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none" />

                    <div className="absolute top-2 left-2 right-2 text-center z-10">
                      <span className="text-[11px] font-roobert text-frost-white truncate block">
                        {name}
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                      <span className="text-[10px] font-roobert tabular-nums text-[#F4E8C8] bg-black/55 px-2 py-0.5 rounded-pill border border-white/12">
                        {item.chance > 0 ? `${item.chance}%` : t('macvpot.jackpot')}
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
