'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import type { CasePrize } from '@/app/cases/page';
import { soundManager } from '@/lib/sound/sound-manager';

interface RouletteProps {
  count: number;
  prizes: CasePrize[]; // All possible prizes
  winningPrizeIds: string[]; // Length 1-3 depending on count
  isSpinning: boolean;
  isTurbo: boolean;
  onSpinComplete: () => void;
}

// Helper to generate a random sequence of prizes
function generateSequence(allPrizes: CasePrize[], winningId: string | null, length = 60, winIndex = 50) {
  const sequence: CasePrize[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winIndex && winningId) {
      const winner = allPrizes.find((p) => p.id === winningId);
      sequence.push(winner || allPrizes[0]);
    } else {
      // Bias towards lower tiers to make winning look harder
      const r = Math.random();
      let picked = allPrizes[0]; // 0.1x
      if (r > 0.6) picked = allPrizes[1]; // 40% for 0.2x
      if (r > 0.85) picked = allPrizes[2]; // 15% for 0.5x
      if (r > 0.95) picked = allPrizes[3]; // 5% for 1x
      if (r > 0.99) picked = allPrizes[4]; // 1% for 2.5x
      sequence.push(picked);
    }
  }
  return sequence;
}

const ITEM_WIDTH = 120; // 120px width per item

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
  const tracksRefs = useRef<(HTMLDivElement | null)[]>([]);

  // When count changes, generate idle tracks if not spinning
  useEffect(() => {
    if (!isSpinning) {
      const newTracks = Array.from({ length: count }).map(() => generateSequence(prizes, null));
      setTracks(newTracks);
      tracksRefs.current.forEach(ref => {
        if (ref) {
          ref.style.transition = 'none';
          ref.style.transform = `translateX(0px)`;
        }
      });
    }
  }, [count, prizes, isSpinning]);

  useEffect(() => {
    // Initialize tracks when winning prizes change (i.e. new spin)
    if (isSpinning && winningPrizeIds.length > 0) {
      const newTracks = winningPrizeIds.map(winId => generateSequence(prizes, winId));
      setTracks(newTracks);
      
      // Reset position instantly
      tracksRefs.current.forEach(ref => {
        if (ref) {
          ref.style.transition = 'none';
          ref.style.transform = `translateX(0px)`;
        }
      });

      soundManager.play('ui.click');
      
      // Wait for React to render the tracks at offset=0
      setTimeout(() => {
        const duration = isTurbo ? 3500 : 8000;
        
        requestAnimationFrame(() => {
          if (containerRef.current) void containerRef.current.offsetWidth; // Force reflow
          
          const containerWidth = containerRef.current?.offsetWidth || 300;
          const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
          const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.8);
          const targetOffset = -(50 * ITEM_WIDTH) + centerOffset + randomStop;
          
          // Animate bypassing React state
          tracksRefs.current.forEach(ref => {
            if (ref) {
              ref.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.15, 1)`;
              ref.style.transform = `translateX(${targetOffset}px)`;
            }
          });
          
          // Callback when done
          setTimeout(() => {
            soundManager.play('game.win');
            onSpinComplete();
          }, duration + 200); // 200ms buffer
        });
      }, 50);
    }
  }, [isSpinning, winningPrizeIds, isTurbo]);

  return (
    <div className="w-full flex flex-col gap-2 relative bg-black/20 rounded-xl py-6 border-y border-white/10 overflow-hidden shadow-inner" ref={containerRef}>
      {/* Center indicator line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white/50 -translate-x-1/2 z-10 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none" />

      {tracks.length > 0 && tracks.map((track, trackIdx) => (
        <div key={trackIdx} className="w-full overflow-hidden">
          <div 
            ref={(el) => {
              if (el) tracksRefs.current[trackIdx] = el;
            }}
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
          </div>
        </div>
      ))}
    </div>
  );
}
