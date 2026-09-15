'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { SlotSymbol, WinningLine, StickyMultiplier } from './macvslot-types';
import { SYMBOL_IMAGES } from './macvslot-types';
import { soundManager } from '@/lib/sound/sound-manager';

interface MacvSlotReelsProps {
  grid: SlotSymbol[][]; // 5 reels x 3 rows
  spinId?: string;
  winningLines: WinningLine[];
  isSpinning: boolean;
  isTurbo: boolean;
  isScatterAnticipating?: boolean;
  stickyMultipliers?: StickyMultiplier[];
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
  'x2',
  'x3',
  'x5',
];

// Compact seamless tape strip for infinite roll without DOM bloat
const TAPE_SYMBOLS: SlotSymbol[] = [
  'macvjet',
  'mines',
  'x2',
  'wheel',
  'scatter',
  'wield',
  'a',
  '10',
  'x3',
  'macvjet',
  'mines',
  'wheel',
  'scatter',
  'wield',
  'a',
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
  spinId = 'init',
  winningLines,
  isSpinning,
  isTurbo,
  isScatterAnticipating = false,
  stickyMultipliers,
  onSpinComplete,
}: MacvSlotReelsProps) {
  // Track which of the 5 reels have stopped: [r0, r1, r2, r3, r4]
  const [reelsStopped, setReelsStopped] = useState<boolean[]>([true, true, true, true, true]);
  // Internal displayedGrid locks symbols on each stopped reel so symbols never jump or glitch
  const [displayedGrid, setDisplayedGrid] = useState<SlotSymbol[][]>(grid);
  const [suspenseReel, setSuspenseReel] = useState<number | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const spinTimerRefs = useRef<NodeJS.Timeout[]>([]);

  // Quick lookup for sticky multiplier cells: "reel,row" -> symbol
  const stickyMap = useMemo(() => {
    const map = new Map<string, 'x2' | 'x3' | 'x5'>();
    if (stickyMultipliers && stickyMultipliers.length > 0) {
      for (const item of stickyMultipliers) {
        map.set(`${item.reel},${item.row}`, item.symbol);
      }
    }
    return map;
  }, [stickyMultipliers]);

  // Preload all 11 symbol images into memory on mount to prevent lazy-load placeholders
  useEffect(() => {
    if (typeof window === 'undefined') return;
    ALL_SYMBOLS.forEach((sym) => {
      const img = new window.Image();
      img.src = SYMBOL_IMAGES[sym];
    });
  }, []);

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

  // Count total scatters landed on stopped reels so all scatters glow when 3+ hit
  const landedScatterCount = useMemo(() => {
    let count = 0;
    for (let r = 0; r < 5; r++) {
      if (reelsStopped[r]) {
        for (let row = 0; row < 3; row++) {
          if (displayedGrid[r]?.[row] === 'scatter') count++;
        }
      }
    }
    return count;
  }, [displayedGrid, reelsStopped]);

  // Keep displayedGrid in sync when idle (e.g. initial load or reset)
  useEffect(() => {
    if (!isSpinning && reelsStopped.every(Boolean)) {
      setDisplayedGrid(grid);
    }
  }, [grid, isSpinning, reelsStopped]);

  // Cycle through winning lines every 1.8s
  useEffect(() => {
    if (isSpinning || winningLines.length <= 1) return;
    const interval = setInterval(() => {
      setActiveLineIndex((prev) => (prev + 1) % winningLines.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isSpinning, winningLines.length]);

  // When spin starts, set all reels to rolling immediately
  useEffect(() => {
    if (isSpinning) {
      setReelsStopped([false, false, false, false, false]);
      setSuspenseReel(null);
    } else {
      setReelsStopped([true, true, true, true, true]);
      setSuspenseReel(null);
      spinTimerRefs.current.forEach(clearTimeout);
      spinTimerRefs.current = [];
    }
  }, [isSpinning]);

  // When spinId arrives from server (outcome ready), schedule the sequential reel stops with anticipation
  useEffect(() => {
    if (!isSpinning || !spinId || spinId === 'init') return;

    spinTimerRefs.current.forEach(clearTimeout);
    spinTimerRefs.current = [];

    const baseDelay = isTurbo ? 180 : 520;
    const standardStagger = isTurbo ? 70 : 220;
    const suspenseDuration = isTurbo ? 750 : 1600;

    // Check which reels have scatters in the final grid
    const reelScatters = [0, 1, 2, 3, 4].map(
      (r) => grid[r]?.includes('scatter') ?? false
    );

    let accumulatedTime = baseDelay;
    let landedScatters = 0;

    for (let reel = 0; reel < 5; reel++) {
      // Suspense triggers if at least 2 scatters landed on earlier stopped reels.
      // Since scatters can ONLY appear on reels 0, 2, 4 (reels 1, 3, 5),
      // the anticipation for the 3rd bonus scatter can ONLY happen on reel 4 (reel 5)!
      const isSuspense = reel === 4 && landedScatters >= 2;

      if (isSuspense) {
        const suspenseStartDelay = accumulatedTime;
        const suspenseTimer = setTimeout(() => {
          setSuspenseReel(reel);
          soundManager.play('ui.click', { volume: 0.6 });
          if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
            (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('medium');
          }
        }, suspenseStartDelay);
        spinTimerRefs.current.push(suspenseTimer);

        accumulatedTime += standardStagger + suspenseDuration;
      } else if (reel > 0) {
        accumulatedTime += standardStagger;
      }

      const stopTime = accumulatedTime;
      const stopTimer = setTimeout(() => {
        // Lock this stopped reel's exact symbols in displayedGrid
        setDisplayedGrid((prev) => {
          const next = [...prev];
          if (grid[reel]) {
            next[reel] = grid[reel];
          }
          return next;
        });

        setReelsStopped((prev) => {
          const next = [...prev];
          next[reel] = true;
          return next;
        });

        if (reelScatters[reel]) {
          soundManager.play('game.win', { volume: 0.65 });
          if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
            (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
          }
        } else {
          soundManager.play('ui.click', { volume: 0.4 });
          if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
            (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light');
          }
        }

        if (reel === 4) {
          setSuspenseReel(null);
          // Wait 360ms for the physical landing bounce of reel 4 to completely settle before completing spin
          const settleTimer = setTimeout(() => {
            onSpinComplete?.();
          }, 360);
          spinTimerRefs.current.push(settleTimer);
        }
      }, stopTime);

      spinTimerRefs.current.push(stopTimer);

      if (reelScatters[reel]) {
        landedScatters++;
      }
    }

    return () => {
      spinTimerRefs.current.forEach(clearTimeout);
    };
  }, [spinId, isSpinning, isTurbo, grid, onSpinComplete]);

  const currentWinningLine = winningLines[activeLineIndex % winningLines.length];
  const lineColor = LINE_COLORS[activeLineIndex % LINE_COLORS.length] || '#fbbf24';
  const isAnySuspense = suspenseReel !== null;

  return (
    <div className="relative w-full max-w-full sm:max-w-[1020px] xl:max-w-[1120px] aspect-[1671/941] mx-auto select-none">
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
          {displayedGrid.map((reelSymbols, reelIdx) => {
            const isReelSpinning = !reelsStopped[reelIdx];
            const isSuspense = suspenseReel === reelIdx;

            return (
              <div
                key={reelIdx}
                className={cn(
                  'relative h-full flex flex-col justify-between overflow-visible transition-all duration-300',
                  isSuspense && 'scale-105 z-25'
                )}
              >
                {/* Golden Anticipation Spotlight Border */}
                {isSuspense && (
                  <div className="absolute inset-0 z-20 pointer-events-none rounded-lg border-2 border-amber-400 bg-gradient-to-b from-amber-400/25 via-amber-300/10 to-amber-500/30 animate-pulse shadow-[0_0_25px_rgba(251,191,36,0.9),inset_0_0_15px_rgba(251,191,36,0.4)]">
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-400 text-black font-brand font-black text-[8px] sm:text-[9px] uppercase tracking-wider shadow-lg whitespace-nowrap animate-bounce">
                      SCATTER?
                    </div>
                  </div>
                )}

                {isReelSpinning ? (
                  // REAL SLIDE-DOWN SPINNING REEL STRIP
                  <div
                    className={cn(
                      'w-full h-full relative overflow-hidden',
                      isAnySuspense && !isSuspense && 'opacity-35 filter brightness-50'
                    )}
                  >
                    <motion.div
                      animate={{ y: ['-50%', '0%'] }}
                      transition={{
                        repeat: Infinity,
                        duration: isSuspense ? 0.35 : (isTurbo ? 0.15 : 0.22),
                        ease: 'linear',
                      }}
                      className="w-full h-[200%] flex flex-col items-center filter blur-[1.2px] opacity-90"
                    >
                      {/* Seamless 14-symbol rolling strip */}
                      {TAPE_SYMBOLS.map((sym, i) => (
                        <div
                          key={i}
                          className="w-full h-[14.285%] flex items-center justify-center p-1 shrink-0"
                        >
                          <div className="relative w-full h-full max-w-[85px] max-h-[85px]">
                            <Image
                              src={SYMBOL_IMAGES[sym]}
                              alt="spin"
                              fill
                              unoptimized
                              priority={i < 4}
                              sizes="(max-width: 768px) 70px, 95px"
                              className="object-contain"
                            />
                          </div>
                        </div>
                      ))}
                    </motion.div>

                    {/* Anchored already-landed sticky multipliers over rolling tape (only for symbols already landed on previous spins!) */}
                    {stickyMap.size > 0 && (
                      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-around py-0.5">
                        {[0, 1, 2].map((rowIdx) => {
                          const stickySym = stickyMap.get(`${reelIdx},${rowIdx}`);
                          if (!stickySym) return <div key={rowIdx} className="w-full h-[33.33%]" />;
                          return (
                            <div key={rowIdx} className="relative w-full h-[33.33%] flex items-center justify-center p-0.5 sm:p-1 md:p-2">
                              <div className="relative w-full h-full max-h-[96px] flex items-center justify-center drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]">
                                {/* Subtle ambient glow - no harsh card outlines or borders */}
                                <div className="absolute inset-1 rounded-full bg-amber-400/20 blur-md pointer-events-none -z-10 animate-pulse" />
                                <Image
                                  src={SYMBOL_IMAGES[stickySym]}
                                  alt={stickySym}
                                  fill
                                  unoptimized
                                  className="object-contain"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                      const isMultiplier = symbol === 'x2' || symbol === 'x3' || symbol === 'x5';
                      const isSticky = stickyMap.has(`${reelIdx},${rowIdx}`);
                      const isScatter = symbol === 'scatter';
                      const isScatterHit3 = isScatter && landedScatterCount >= 3;
                      const isScatterShaking =
                        isScatter && (isScatterAnticipating || (isAnySuspense && reelsStopped[reelIdx]) || isScatterHit3);
                      const isDimmedBySuspense = isAnySuspense && !isSuspense && !isScatter;

                      return (
                        <div
                          key={rowIdx}
                          className="relative w-full h-[33.33%] flex items-center justify-center p-0.5 sm:p-1 md:p-2"
                        >
                          <motion.div
                            animate={
                              isScatterShaking
                                ? {
                                    scale: [1.1, 1.25, 1.15, 1.25, 1.1],
                                    rotate: [-2.5, 2.5, -2, 2, 0],
                                    filter: [
                                      'drop-shadow(0 0 10px rgba(251,191,36,0.8))',
                                      'drop-shadow(0 0 24px rgba(251,191,36,1))',
                                      'drop-shadow(0 0 14px rgba(251,191,36,0.85))',
                                    ],
                                  }
                                : undefined
                            }
                            transition={
                              isScatterShaking
                                ? {
                                    repeat: Infinity,
                                    duration: 0.85,
                                    ease: 'easeInOut',
                                  }
                                : undefined
                            }
                            className={cn(
                              'relative w-full h-full max-h-[96px] transition-all duration-300 flex items-center justify-center',
                              isWield ? 'max-w-[102px] scale-110' : 'max-w-[94px]',
                              isMultiplier && 'drop-shadow-[0_0_10px_rgba(251,191,36,0.65)] scale-105',
                              isScatterShaking && 'z-30 scale-125',
                              isWinning && !isScatterShaking &&
                                'scale-108 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)] z-25',
                              isDimmedBySuspense && 'opacity-35 filter brightness-50 grayscale-[30%]'
                            )}
                          >
                            {/* Multiplier subtle ambient glow (no card outlines or box borders) */}
                            {(isMultiplier || isSticky) && (
                              <div className="absolute inset-1 rounded-full bg-amber-400/20 blur-md pointer-events-none -z-10 animate-pulse" />
                            )}
                            {/* Scatter anticipation radiating background aura */}
                            {isScatterShaking && (
                              <div className="absolute inset-[-12px] rounded-full bg-amber-400/35 blur-xl animate-pulse -z-10" />
                            )}

                            {/* Softer, subtler ambient win glow without harsh borders */}
                            {isWinning && !isScatterShaking && (
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
                              unoptimized
                              sizes="(max-width: 768px) 80px, 105px"
                              className={cn(
                                'object-contain transition-transform duration-200',
                                isWinning && !isScatterShaking && 'animate-pulse'
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
