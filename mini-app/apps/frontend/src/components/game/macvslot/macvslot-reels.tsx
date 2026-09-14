'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { SlotSymbol, WinningLine } from './macvslot-types';
import { SYMBOL_IMAGES } from './macvslot-types';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotReelsProps {
  grid: SlotSymbol[][]; // 5 reels x 3 rows
  winningLines: WinningLine[];
  isSpinning: boolean;
  isTurbo: boolean;
  onSpinComplete?: () => void;
}

const ALL_SYMBOLS: SlotSymbol[] = [
  'macvjet',
  'mines',
  'wheel',
  'coinflip',
  'wield',
  'scatter',
  'a',
  'k',
  'q',
  'j',
  '10',
];

export function MacvSlotReels({
  grid,
  winningLines,
  isSpinning,
  isTurbo,
  onSpinComplete,
}: MacvSlotReelsProps) {
  // Track which reels have stopped: [r0, r1, r2, r3, r4]
  const [reelsStopped, setReelsStopped] = useState<boolean[]>([true, true, true, true, true]);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const spinTimerRefs = useRef<NodeJS.Timeout[]>([]);

  // Collect winning cells for quick lookup: "reel,row"
  const winningCellsSet = useMemo(() => {
    const set = new Set<string>();
    if (!isSpinning && reelsStopped.every(Boolean)) {
      if (winningLines.length > 0) {
        // Highlight either the cycling active line or all winning cells
        const curLine = winningLines[activeLineIndex % winningLines.length];
        if (curLine) {
          for (const [reel, row] of curLine.positions) {
            set.add(`${reel},${row}`);
          }
        }
      }
    }
    return set;
  }, [winningLines, activeLineIndex, isSpinning, reelsStopped]);

  // Cycle through winning lines every 2 seconds when round is over
  useEffect(() => {
    if (isSpinning || winningLines.length <= 1) return;
    const interval = setInterval(() => {
      setActiveLineIndex((prev) => (prev + 1) % winningLines.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isSpinning, winningLines.length]);

  // Handle spin timings
  useEffect(() => {
    if (isSpinning) {
      // Clear previous timers
      spinTimerRefs.current.forEach(clearTimeout);
      spinTimerRefs.current = [];
      setReelsStopped([false, false, false, false, false]);

      const baseDelay = isTurbo ? 180 : 650;
      const stagger = isTurbo ? 60 : 250;

      for (let reel = 0; reel < 5; reel++) {
        const timer = setTimeout(() => {
          setReelsStopped((prev) => {
            const next = [...prev];
            next[reel] = true;
            return next;
          });

          // Play audio tick
          soundManager.play('ui.click', { volume: 0.35 });

          // If last reel stops, trigger completion
          if (reel === 4) {
            onSpinComplete?.();
          }
        }, baseDelay + reel * stagger);

        spinTimerRefs.current.push(timer);
      }
    } else {
      setReelsStopped([true, true, true, true, true]);
    }

    return () => {
      spinTimerRefs.current.forEach(clearTimeout);
    };
  }, [isSpinning, isTurbo, onSpinComplete]);

  return (
    <div className="relative w-full max-w-[840px] aspect-[1671/941] mx-auto select-none">
      {/* 1. Behind the frame: Dark Glassmorphic Backdrop */}
      <div className="absolute top-[20.5%] bottom-[10.5%] left-[4.4%] right-[4.4%] rounded-xl overflow-hidden shadow-2xl bg-gradient-to-b from-[#050608] via-[#090b10] to-[#050608] border border-amber-500/20">
        {/* Subtle dark texture overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-black/60 pointer-events-none" />

        {/* 2. Horizontal Dividers: 2 subtle glowing golden lines dividing rows 1/2 and 2/3 */}
        <div
          className="absolute left-0 right-0 top-[33.333%] h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent pointer-events-none z-10"
          style={{ boxShadow: '0 0 6px rgba(245, 158, 11, 0.25)' }}
        />
        <div
          className="absolute left-0 right-0 top-[66.666%] h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent pointer-events-none z-10"
          style={{ boxShadow: '0 0 6px rgba(245, 158, 11, 0.25)' }}
        />

        {/* 3. 5 Reel Columns */}
        <div className="grid grid-cols-5 h-full w-full relative z-0">
          {grid.map((reelSymbols, reelIdx) => {
            const isReelSpinning = !reelsStopped[reelIdx];

            return (
              <div
                key={reelIdx}
                className="relative h-full flex flex-col justify-between overflow-hidden"
              >
                {isReelSpinning ? (
                  // Spinning animation strip
                  <div className="w-full h-full flex flex-col items-center justify-around animate-pulse py-1">
                    {[0, 1, 2].map((i) => {
                      const randomSym = ALL_SYMBOLS[(reelIdx * 3 + i) % ALL_SYMBOLS.length];
                      return (
                        <div
                          key={i}
                          className="w-full h-[33.33%] flex items-center justify-center p-1.5 sm:p-2.5 filter blur-[1.5px] opacity-75 scale-95"
                        >
                          <div className="relative w-full h-full max-w-[85px] max-h-[85px]">
                            <Image
                              src={SYMBOL_IMAGES[randomSym]}
                              alt="symbol"
                              fill
                              sizes="(max-width: 768px) 60px, 90px"
                              className="object-contain"
                              priority
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Static / Stopped symbols with bounce-in
                  <motion.div
                    initial={{ y: -15, opacity: 0.9 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 450,
                      damping: 25,
                      mass: 0.8,
                    }}
                    className="w-full h-full flex flex-col justify-around py-0.5"
                  >
                    {reelSymbols.map((symbol, rowIdx) => {
                      const isWinning = winningCellsSet.has(`${reelIdx},${rowIdx}`);

                      return (
                        <div
                          key={rowIdx}
                          className="relative w-full h-[33.33%] flex items-center justify-center p-1 sm:p-2"
                        >
                          <div
                            className={cn(
                              'relative w-full h-full max-w-[82px] max-h-[82px] transition-all duration-300 flex items-center justify-center',
                              isWinning &&
                                'scale-110 drop-shadow-[0_0_16px_rgba(251,191,36,0.95)] z-20'
                            )}
                          >
                            {/* Win highlight halo */}
                            {isWinning && (
                              <div className="absolute inset-[-6px] rounded-2xl bg-amber-400/20 animate-pulse blur-sm -z-10 border border-amber-300/60" />
                            )}
                            <Image
                              src={SYMBOL_IMAGES[symbol]}
                              alt={symbol}
                              fill
                              sizes="(max-width: 768px) 70px, 95px"
                              className={cn(
                                'object-contain transition-transform duration-200',
                                isWinning && 'animate-bounce'
                              )}
                              priority
                            />
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Winning Payline SVG overlay */}
        {!isSpinning && winningLines.length > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-25 overflow-visible">
            {(() => {
              const curLine = winningLines[activeLineIndex % winningLines.length];
              if (!curLine) return null;

              // Calculate cell centers
              const points = curLine.positions.map(([reel, row]) => {
                const x = ((reel + 0.5) / 5) * 100;
                const y = ((row + 0.5) / 3) * 100;
                return `${x}%,${y}%`;
              });

              return (
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="filter drop-shadow-[0_0_8px_#f59e0b] animate-pulse"
                />
              );
            })()}
          </svg>
        )}
      </div>

      {/* 5. Foreground Frame: ramka.webp positioned on top */}
      <div className="absolute inset-0 pointer-events-none z-30 w-full h-full">
        <Image
          src="/MacvSlot/ramka.webp"
          alt="MacvSpin Frame"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 840px"
          className="object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)]"
        />
      </div>
    </div>
  );
}
