'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { motion, useAnimation } from 'framer-motion';
import type { CasePrize } from '@/app/game/cases/page';
import { soundManager } from '@/lib/sound/sound-manager';

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
      // "Teaser" mechanics: 40% chance to put a fat coin right next to the winner
      if (winningId && (i === winIndex - 1 || i === winIndex + 1) && Math.random() < 0.4) {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const lastPassedRef = useRef<number>(0);

  // Generate idle tracks
  useEffect(() => {
    if (!isSpinning) {
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
      // 1. Generate new tracks with winners
      const newTracks = winningPrizeIds.map((winId, i) => generateSequence(prizes, winId, 80, i % 2 !== 0 ? 10 : 70));
      setTracks(newTracks);
      
      // 2. Instantly reset position to start
      void controls.set((i) => {
        const isReverse = i % 2 !== 0;
        return { x: isReverse ? -(70 * ITEM_WIDTH) : 0 };
      });
      lastPassedRef.current = 0;
      soundManager.play('ui.click');
      
      // 3. Wait for DOM to paint new tracks, then animate
      setTimeout(() => {
        const containerWidth = containerRef.current?.offsetWidth || 300;
        const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
        const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.8);
        
        const duration = isTurbo ? 3.5 : 8; // seconds for framer-motion
        
        // Start animation
        void controls.start((i) => {
          const isReverse = i % 2 !== 0;
          const targetOffset = isReverse ? -(10 * ITEM_WIDTH) + centerOffset : -(70 * ITEM_WIDTH) + centerOffset;
          return {
            x: targetOffset + randomStop,
            transition: { duration, ease: [0.15, 0.85, 0.15, 1] }
          };
        }).then(() => {
          soundManager.play('game.win');
          onSpinComplete();
        });
      }, 50);
    }
  }, [isSpinning, winningPrizeIds, isTurbo, controls]); // Removed onSpinComplete to avoid infinite triggers if it changes

  return (
    <div className="w-full flex flex-col gap-2 relative bg-black/20 rounded-xl py-6 border-y border-white/10 overflow-hidden shadow-inner" ref={containerRef}>
      {/* Center gradient glow */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-[150%] opacity-30 pointer-events-none blur-[40px] z-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, transparent 70%)' }}
      />
      
      {/* Center line with liquid glass effect */}
      <div className="absolute top-0 bottom-0 left-1/2 w-[6px] bg-white/20 -translate-x-1/2 z-20 shadow-[0_0_15px_rgba(255,255,255,0.8)] backdrop-blur-sm pointer-events-none border-x border-white/30 rounded-full" />
      
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
            {...(trackIdx === 0 ? {
              onUpdate: (latest) => {
                if (!isSpinning) return;
                const currentPassed = Math.floor(Math.abs(parseFloat(String(latest.x))) / ITEM_WIDTH);
                if (currentPassed > lastPassedRef.current) {
                  soundManager.play('cases.tick');
                  lastPassedRef.current = currentPassed;
                }
              }
            } : {})}
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
    </div>
  );
}
