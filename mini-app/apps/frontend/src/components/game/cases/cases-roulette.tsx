'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import type { CasePrize } from '@/app/game/cases/page';
import { soundManager } from '@/lib/sound/sound-manager';
import { haptics } from '@/lib/haptics';

interface RouletteProps {
  count: number;
  prizes: CasePrize[];
  winningPrizeIds: string[];
  isSpinning: boolean;
  isTurbo: boolean;
  onSpinComplete: () => void;
}

function generateSequence(allPrizes: CasePrize[], winningId: string | null, length = 80, winIndex = 70) {
  const seq: CasePrize[] = [];
  const fatCoins = allPrizes.slice(-3); // last 3 are typically 10x, 25x, 100x

  for (let i = 0; i < length; i++) {
    if (winningId && i === winIndex) {
      const winner = allPrizes.find(p => p.id === winningId) || allPrizes[0];
      seq.push(winner);
    } else {
      // Reduced near-miss teaser frequency from 40% to 8% so it doesn't constantly tease and frustrate
      if (winningId && (i === winIndex - 1 || i === winIndex + 1) && Math.random() < 0.08) {
        seq.push(fatCoins[Math.floor(Math.random() * fatCoins.length)]);
      } else {
        // Random item based on actual weight logic for visual filler
        const totalW = allPrizes.reduce((sum, p) => sum + p.weight, 0);
        let rnd = Math.random() * totalW;
        let selected = allPrizes[0];
        for (const p of allPrizes) {
          rnd -= p.weight;
          if (rnd <= 0) {
            selected = p;
            break;
          }
        }
        seq.push(selected);
      }
    }
  }
  return seq;
}

const ITEM_WIDTH = 120;

export function CasesRoulette({
  count,
  prizes,
  winningPrizeIds,
  isSpinning,
  isTurbo,
  onSpinComplete
}: RouletteProps) {
  const [tracks, setTracks] = useState<CasePrize[][]>([]);
  const [isSuspenseFocus, setIsSuspenseFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const lastPassedRef = useRef<number[]>([]);
  const suspenseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate idle tracks
  useEffect(() => {
    if (!isSpinning) {
      setIsSuspenseFocus(false);
      const newTracks = Array.from({ length: count }).map((_, i) => generateSequence(prizes, null, 80, i % 2 !== 0 ? 10 : 70));
      setTracks(newTracks);
      void controls.set((i) => {
        const isReverse = i % 2 !== 0;
        return { x: isReverse ? -(70 * ITEM_WIDTH) : 0 };
      });
    }
  }, [count, prizes, isSpinning, controls]);

  useEffect(() => {
    if (isSpinning && winningPrizeIds.length > 0) {
      if (suspenseTimerRef.current) clearTimeout(suspenseTimerRef.current);
      setIsSuspenseFocus(false);

      // 1. Generate new tracks with winners
      const newTracks = winningPrizeIds.map((winId, i) => generateSequence(prizes, winId, 80, i % 2 !== 0 ? 10 : 70));
      setTracks(newTracks);
      
      // 2. Check if a high multiplier (fat coin) is landing or in the near-miss window
      const fatCoinIds = new Set(prizes.slice(-3).map(p => p.id));
      const hasBigXNearby = winningPrizeIds.some(winId => fatCoinIds.has(winId)) ||
        newTracks.some((track, i) => {
          const winIdx = i % 2 !== 0 ? 10 : 70;
          return fatCoinIds.has(track[winIdx - 1]?.id) || fatCoinIds.has(track[winIdx + 1]?.id);
        });

      // 3. Instantly reset position to start
      void controls.set((i) => {
        const isReverse = i % 2 !== 0;
        return { x: isReverse ? -(70 * ITEM_WIDTH) : 0 };
      });
      lastPassedRef.current = [];
      soundManager.play('ui.click');
      
      // 4. Wait for DOM to paint new tracks, then animate
      setTimeout(() => {
        const containerWidth = containerRef.current?.offsetWidth || 300;
        const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
        const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.8);
        
        const duration = isTurbo ? 3.5 : 8; // seconds for framer-motion

        // Deceleration Suspense: triggers when roulette enters the final slow rolling phase
        if (hasBigXNearby) {
          const suspenseStartMs = (duration * (isTurbo ? 0.65 : 0.70)) * 1000;
          suspenseTimerRef.current = setTimeout(() => {
            setIsSuspenseFocus(true);
            haptics.impact('medium');
          }, suspenseStartMs);
        }
        
        // Start animation
        void controls.start((i) => {
          const isReverse = i % 2 !== 0;
          const targetOffset = isReverse ? -(10 * ITEM_WIDTH) + centerOffset : -(70 * ITEM_WIDTH) + centerOffset;
          return {
            x: targetOffset + randomStop,
            transition: { duration, ease: [0.15, 0.85, 0.15, 1] }
          };
        }).then(() => {
          const hasActualBigWin = winningPrizeIds.some(winId => fatCoinIds.has(winId));
          if (!hasActualBigWin) {
            // Rapid unblur and scale-down reverse transition when the big X misses
            setIsSuspenseFocus(false);
          } else {
            haptics.notification('success');
          }
          soundManager.play('game.win');
          onSpinComplete();
        });
      }, 50);
    }

    return () => {
      if (suspenseTimerRef.current) clearTimeout(suspenseTimerRef.current);
    };
  }, [isSpinning, winningPrizeIds, isTurbo, controls, prizes]);

  return (
    <>
      {/* Ambient Backdrop Blur for Cinematic Big-X Suspense */}
      <AnimatePresence>
        {isSuspenseFocus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 pointer-events-none z-30 bg-black/45 backdrop-blur-[4px]"
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={{
          scale: isSuspenseFocus ? 1.05 : 1,
          boxShadow: isSuspenseFocus
            ? '0 0 40px rgba(251, 191, 36, 0.35), inset 0 0 20px rgba(251, 191, 36, 0.2)'
            : '0 0 0px transparent, inset 0 0 0px transparent',
        }}
        transition={{
          duration: isSuspenseFocus ? 0.75 : 0.28,
          ease: isSuspenseFocus ? [0.16, 1, 0.3, 1] : [0.4, 0, 0.2, 1],
        }}
        className={`w-full flex flex-col gap-2 relative bg-black/20 rounded-xl py-6 border-y ${
          isSuspenseFocus ? 'border-amber-400/60' : 'border-white/10'
        } overflow-hidden shadow-inner transition-colors duration-300 z-40`}
        ref={containerRef}
      >
        {/* Center gradient glow (gold aura when suspense active) */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140px] h-[150%] opacity-40 pointer-events-none blur-[45px] z-0 transition-all duration-500"
          style={{
            background: isSuspenseFocus
              ? 'radial-gradient(ellipse at center, rgba(251,191,36,0.9) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, transparent 70%)'
          }}
        />
        
        {/* Center line with liquid glass & suspense highlight */}
        <div
          className={`absolute top-0 bottom-0 left-1/2 w-[6px] -translate-x-1/2 z-20 backdrop-blur-sm pointer-events-none rounded-full transition-all duration-300 ${
            isSuspenseFocus
              ? 'bg-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.95)] border-x border-amber-200 animate-pulse'
              : 'bg-white/20 shadow-[0_0_15px_rgba(255,255,255,0.8)] border-x border-white/30'
          }`}
        />
        
        {/* Edge vignettes for smooth fade */}
        <div className="absolute top-0 bottom-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-[#111111]/90 to-transparent z-30 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-[#111111]/90 to-transparent z-30 pointer-events-none" />

        {tracks.length > 0 && tracks.map((track, trackIdx) => (
          <div key={trackIdx} className="w-full overflow-hidden relative z-10">
            <motion.div 
              custom={trackIdx}
              animate={controls}
              className="flex"
              style={{ willChange: 'transform' }}
              onUpdate={(latest) => {
                if (!isSpinning) return;
                const containerWidth = containerRef.current?.offsetWidth || 300;
                const currentItemIndex = Math.floor((containerWidth / 2 - parseFloat(String(latest.x))) / ITEM_WIDTH);
                
                if (lastPassedRef.current[trackIdx] === undefined) {
                  lastPassedRef.current[trackIdx] = currentItemIndex;
                } else if (currentItemIndex !== lastPassedRef.current[trackIdx]) {
                  soundManager.play('cases.tick');
                  lastPassedRef.current[trackIdx] = currentItemIndex;
                }
              }}
            >
              {track.map((p, i) => (
                <div 
                  key={i} 
                  className="flex-shrink-0 flex items-center justify-center p-2"
                  style={{ width: `${ITEM_WIDTH}px`, height: '110px' }}
                >
                  <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                    <Image
                      src={`/images/cases/${p.id}.png`}
                      alt={p.id}
                      fill
                      className="object-contain drop-shadow-md"
                      unoptimized
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </motion.div>
    </>
  );
}
