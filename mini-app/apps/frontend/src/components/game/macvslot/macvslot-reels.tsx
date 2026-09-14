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
  isScatterAnticipating?: boolean;
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

const LINE_COLORS = [
  '#fbbf24', // Amber/Gold
  '#a3e635', // Lime Green
  '#f97316', // Bright Orange
  '#38bdf8', // Cyan
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#ef4444', // Red
  '#8b5cf6', // Purple
];

export function MacvSlotReels({
  grid,
  winningLines,
  isSpinning,
  isTurbo,
  isScatterAnticipating = false,
  onSpinComplete,
}: MacvSlotReelsProps) {
  // Track which of the 5 reels have stopped: [r0, r1, r2, r3, r4]
  const [reelsStopped, setReelsStopped] = useState<boolean[]>([true, true, true, true, true]);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const spinTimerRefs = useRef<NodeJS.Timeout[]>([]);

  // Collect winning cells for quick lookup: "reel,row"
  const winningCellsSet = useMemo(() => {
    const set = new Set<string>();
    if (!isSpinning && reelsStopped.every(Boolean)) {
      if (winningLines.length > 0) {
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

  // Cycle through winning lines every 1.8s
  useEffect(() => {
    if (isSpinning || winningLines.length <= 1) return;
    const interval = setInterval(() => {
      setActiveLineIndex((prev) => (prev + 1) % winningLines.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isSpinning, winningLines.length]);

  // Handle sequential spin timings: Reel 1 -> 2 -> 3 -> 4 -> 5
  useEffect(() => {
    if (isSpinning) {
      spinTimerRefs.current.forEach(clearTimeout);
      spinTimerRefs.current = [];
      setReelsStopped([false, false, false, false, false]);

      const baseDelay = isTurbo ? 180 : 550;
      const stagger = isTurbo ? 60 : 220;

      for (let reel = 0; reel < 5; reel++) {
        const timer = setTimeout(() => {
          setReelsStopped((prev) => {
            const next = [...prev];
            next[reel] = true;
            return next;
          });

          // Play authentic reel landing sound
          soundManager.play('ui.click', { volume: 0.4 });

          // Haptic impact for mobile
          if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
            (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light');
          }

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

  const currentWinningLine = winningLines[activeLineIndex % winningLines.length];
  const lineColor = LINE_COLORS[activeLineIndex % LINE_COLORS.length] || '#fbbf24';

  return (
    <div className="relative w-full max-w-[960px] sm:max-w-[1020px] xl:max-w-[1120px] aspect-[1671/941] mx-auto select-none">
      {/* 1. Behind the frame: Exact pixel-calibrated Inner Stage */}
      {/* Measured from ramka.webp: top: 29.3%, bottom: 15.0%, left: 8.2%, right: 8.2% */}
      <div
        className="absolute rounded-xl overflow-hidden shadow-2xl bg-gradient-to-b from-[#050608] via-[#090b10] to-[#050608] border border-amber-500/25"
        style={{
          top: '29.3%',
          bottom: '15.0%',
          left: '8.2%',
          right: '8.2%',
        }}
      >
        {/* Ambient inner shadow/glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-black/70 pointer-events-none z-10" />

        {/* 2. Horizontal Dividers: 2 subtle glowing golden lines dividing row 1/row 2 and row 2/row 3 */}
        <div
          className="absolute left-0 right-0 top-[33.333%] h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/35 to-transparent pointer-events-none z-10"
          style={{ boxShadow: '0 0 8px rgba(251, 191, 36, 0.3)' }}
        />
        <div
          className="absolute left-0 right-0 top-[66.666%] h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/35 to-transparent pointer-events-none z-10"
          style={{ boxShadow: '0 0 8px rgba(251, 191, 36, 0.3)' }}
        />

        {/* 3. The 5 Reel Columns */}
        <div className="grid grid-cols-5 h-full w-full relative z-0">
          {grid.map((reelSymbols, reelIdx) => {
            const isReelSpinning = !reelsStopped[reelIdx];

            return (
              <div
                key={reelIdx}
                className="relative h-full flex flex-col justify-between overflow-hidden"
              >
                {isReelSpinning ? (
                  // REAL SLIDE-DOWN SPINNING REEL STRIP
                  <div className="w-full h-full relative overflow-hidden">
                    <motion.div
                      animate={{ y: ['-50%', '0%'] }}
                      transition={{
                        repeat: Infinity,
                        duration: isTurbo ? 0.15 : 0.22,
                        ease: 'linear',
                      }}
                      className="w-full flex flex-col items-center filter blur-[1.5px] opacity-85"
                    >
                      {/* Repeated symbol loop to simulate continuous rapid tape rolling */}
                      {[...ALL_SYMBOLS, ...ALL_SYMBOLS].map((sym, i) => (
                        <div
                          key={i}
                          className="w-full h-[60px] sm:h-[80px] md:h-[95px] flex items-center justify-center p-1.5 shrink-0"
                        >
                          <div className="relative w-full h-full max-w-[85px] max-h-[85px]">
                            <Image
                              src={SYMBOL_IMAGES[sym]}
                              alt="spin"
                              fill
                              sizes="(max-width: 768px) 70px, 95px"
                              className="object-contain"
                            />
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </div>
                ) : (
                  // STOPPED: Symbols land and drop from top with physical bounce
                  <motion.div
                    initial={{ y: -70, opacity: 0.85 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 24,
                      mass: 0.8,
                    }}
                    className="w-full h-full flex flex-col justify-around py-0.5"
                  >
                    {reelSymbols.map((symbol, rowIdx) => {
                      const isWinning = winningCellsSet.has(`${reelIdx},${rowIdx}`);
                      const isWield = symbol === 'wield';
                      const isScatter = symbol === 'scatter';
                      const isScatterActive = isScatter && isScatterAnticipating;

                      return (
                        <div
                          key={rowIdx}
                          className="relative w-full h-[33.33%] flex items-center justify-center p-1 sm:p-2"
                        >
                          <motion.div
                            animate={
                              isScatterActive
                                ? {
                                    scale: [1.18, 1.32, 1.22, 1.32],
                                    rotate: [-3, 3, -2, 2, 0],
                                    filter: [
                                      'drop-shadow(0 0 12px rgba(251,191,36,0.85))',
                                      'drop-shadow(0 0 28px rgba(251,191,36,1))',
                                      'drop-shadow(0 0 16px rgba(251,191,36,0.9))',
                                    ],
                                  }
                                : undefined
                            }
                            transition={
                              isScatterActive
                                ? {
                                    repeat: Infinity,
                                    duration: 0.35,
                                    ease: 'easeInOut',
                                  }
                                : undefined
                            }
                            className={cn(
                              'relative w-full h-full max-h-[88px] transition-all duration-300 flex items-center justify-center',
                              isWield ? 'max-w-[96px] scale-110' : 'max-w-[86px]',
                              isScatterActive && 'z-30 scale-125',
                              isWinning && !isScatterActive &&
                                'scale-108 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)] z-25'
                            )}
                          >
                            {/* Scatter anticipation radiating background aura */}
                            {isScatterActive && (
                              <div className="absolute inset-[-12px] rounded-full bg-amber-400/35 blur-xl animate-pulse -z-10" />
                            )}

                            {/* Softer, subtler ambient win glow without harsh borders */}
                            {isWinning && !isScatterActive && (
                              <div
                                className="absolute inset-[-4px] rounded-full animate-pulse blur-md -z-10"
                                style={{
                                  backgroundColor: `${lineColor}30`,
                                }}
                              />
                            )}
                            <Image
                              src={SYMBOL_IMAGES[symbol]}
                              alt={symbol}
                              fill
                              sizes="(max-width: 768px) 80px, 105px"
                              className={cn(
                                'object-contain transition-transform duration-200',
                                isWinning && !isScatterActive && 'animate-pulse'
                              )}
                              priority
                            />
                          </motion.div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Winning Payline SVG Overlay (Standard user-space 1000x600 coordinates) */}
        {!isSpinning && winningLines.length > 0 && currentWinningLine && (
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
          >
            {(() => {
              // Calculate numeric user-space center coordinates of each winning symbol
              const points = currentWinningLine.positions.map(([reel, row]) => {
                const x = (reel + 0.5) * 200;
                const y = (row + 0.5) * 200;
                return `${x},${y}`;
              });

              return (
                <g>
                  {/* Soft glowing background path */}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="8"
                    strokeOpacity="0.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="blur-sm"
                  />
                  {/* Sharp core neon line */}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_0_8px_#fbbf24]"
                  />
                  {/* Colored outline line */}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* 5. Foreground Frame: ramka.webp with unoptimized to preserve full 1671x941 pixel-crisp quality */}
      <div className="absolute inset-0 pointer-events-none z-30 w-full h-full">
        <Image
          src="/MacvSlot/ramka.webp"
          alt="MacvSpin Frame"
          fill
          priority
          unoptimized
          sizes="(max-width: 1200px) 100vw, 1120px"
          className="object-contain drop-shadow-[0_16px_35px_rgba(0,0,0,0.9)]"
        />
      </div>
    </div>
  );
}
