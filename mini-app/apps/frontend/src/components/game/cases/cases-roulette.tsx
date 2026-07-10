'use client';

import { useEffect, useState, useRef } from 'react';
import type { CasePrize } from '@/app/cases/page';
import { soundManager } from '@/lib/sound/sound-manager';

interface RouletteProps {
  prizes: CasePrize[]; // All possible prizes
  winningPrizeIds: string[]; // Length 1-3 depending on count
  isSpinning: boolean;
  isTurbo: boolean;
  onSpinComplete: () => void;
}

// Helper to generate a random sequence of prizes
function generateSequence(allPrizes: CasePrize[], winningId: string, length = 60, winIndex = 50) {
  const sequence: CasePrize[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winIndex) {
      const winner = allPrizes.find((p) => p.id === winningId);
      sequence.push(winner || allPrizes[0]);
    } else {
      // Pick random prize for visual fluff
      const r = Math.floor(Math.random() * allPrizes.length);
      sequence.push(allPrizes[r]);
    }
  }
  return sequence;
}

const ITEM_WIDTH = 120; // 120px width per item

export function CasesRoulette({
  prizes,
  winningPrizeIds,
  isSpinning,
  isTurbo,
  onSpinComplete
}: RouletteProps) {
  const [tracks, setTracks] = useState<CasePrize[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track animation state
  const [offset, setOffset] = useState<number>(0);
  const [transitionDuration, setTransitionDuration] = useState<number>(0);

  useEffect(() => {
    // Initialize tracks when winning prizes change (i.e. new spin)
    if (isSpinning && winningPrizeIds.length > 0) {
      const newTracks = winningPrizeIds.map(winId => generateSequence(prizes, winId));
      setTracks(newTracks);
      
      // Reset position instantly
      setTransitionDuration(0);
      setOffset(0);

      // Play start sound
      soundManager.play('ui.click'); // Replace with specific spin sound if exists
      
      // Wait a tick to apply transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const containerWidth = containerRef.current?.offsetWidth || 300;
          // target index is 50. We want it in the center.
          const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
          
          // Add a random small offset so it doesn't land perfectly in the exact center every time
          const randomStop = (Math.random() - 0.5) * (ITEM_WIDTH * 0.8);
          
          const targetOffset = -(50 * ITEM_WIDTH) + centerOffset + randomStop;
          
          const duration = isTurbo ? 3500 : 8000;
          setTransitionDuration(duration);
          setOffset(targetOffset);
          
          // Callback when done
          setTimeout(() => {
            soundManager.play('game.win'); // Play win sound
            onSpinComplete();
          }, duration + 200); // 200ms buffer
        });
      });
    }
  }, [isSpinning, winningPrizeIds, isTurbo]);

  return (
    <div className="w-full flex flex-col gap-2 relative bg-black/20 rounded-xl py-6 border-y border-white/10 overflow-hidden shadow-inner" ref={containerRef}>
      {/* Center indicator line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white/50 -translate-x-1/2 z-10 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none" />

      {tracks.length > 0 ? (
        tracks.map((track, trackIdx) => (
          <div key={trackIdx} className="w-full overflow-hidden">
            <div 
              className="flex"
              style={{
                transform: `translateX(${offset}px)`,
                transition: transitionDuration > 0 ? `transform ${transitionDuration}ms cubic-bezier(0.15, 0.85, 0.15, 1)` : 'none',
                willChange: 'transform'
              }}
            >
              {track.map((p, i) => (
                <div 
                  key={i} 
                  className="flex-shrink-0 flex items-center justify-center p-2"
                  style={{ width: `${ITEM_WIDTH}px`, height: '90px' }}
                >
                  <div 
                    className="w-full h-full rounded-lg border-2 shadow-lg flex flex-col items-center justify-center relative overflow-hidden bg-black/40 backdrop-blur-sm"
                    style={{ borderColor: p.color }}
                  >
                    <div className="absolute inset-0 opacity-20" style={{ backgroundColor: p.color }} />
                    <span className="font-roobert font-bold text-lg text-white z-10 drop-shadow-md">
                      {p.amount.toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        // Empty state (before first spin)
        <div className="w-full h-[90px] flex items-center justify-center text-white/30 font-medium">
          Нажмите "Крутить" чтобы начать
        </div>
      )}
    </div>
  );
}
