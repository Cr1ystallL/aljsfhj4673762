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

function generateSequence(allPrizes: CasePrize[], winningId: string | null, length = 60, winIndex = 50) {
  const sequence: CasePrize[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winIndex && winningId) {
      const winner = allPrizes.find((p) => p.id === winningId);
      sequence.push(winner || allPrizes[0]);
    } else {
      const r = Math.random();
      let picked = allPrizes[0];
      if (r > 0.6) picked = allPrizes[1];
      if (r > 0.85) picked = allPrizes[2];
      if (r > 0.95) picked = allPrizes[3];
      if (r > 0.99) picked = allPrizes[4];
      sequence.push(picked);
    }
  }
  return sequence;
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
      <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white/50 -translate-x-1/2 z-10 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none" />

      {tracks.length > 0 && tracks.map((track, trackIdx) => (
        <div key={trackIdx} className="w-full overflow-hidden">
          <motion.div 
            custom={trackIdx}
            animate={controls}
            className="flex"
            style={{ willChange: 'transform' }}
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
