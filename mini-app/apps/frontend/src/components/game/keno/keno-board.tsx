'use client';

import { memo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';
import { soundManager } from '@/lib/sound/sound-manager';
import type { KenoPhase } from './keno-bet-panel';
import { KENO_BOARD_SIZE, KENO_DRAW_COUNT } from './keno-multipliers';

interface KenoBoardProps {
  picks: number[];
  onTogglePick: (num: number) => void;
  drawnNumbers: number[];
  lastDrawnNumber?: number | null;
  phase: KenoPhase;
  maxPick: number;
  drawCount?: number;
}

const CELLS = Array.from({ length: KENO_BOARD_SIZE }, (_, i) => i + 1);

type CellKind = 'idle' | 'picked' | 'house' | 'hit' | 'miss';

function kindOf(
  num: number,
  picks: number[],
  drawn: number[],
  drawComplete: boolean
): CellKind {
  const picked = picks.includes(num);
  const isDrawn = drawn.includes(num);
  if (picked && isDrawn) return 'hit';
  if (isDrawn) return 'house';
  if (picked && drawComplete) return 'miss';
  if (picked) return 'picked';
  return 'idle';
}

export function KenoBoard({
  picks,
  onTogglePick,
  drawnNumbers,
  lastDrawnNumber,
  phase,
  maxPick,
  drawCount = KENO_DRAW_COUNT,
}: KenoBoardProps) {
  const drawComplete = drawnNumbers.length >= drawCount;

  const handleCellClick = (num: number) => {
    if (phase !== 'idle') return;
    
    // Prevent adding if max is reached, unless deselecting
    if (!picks.includes(num) && picks.length >= maxPick) {
      soundManager.play('error');
      return;
    }

    soundManager.play('tick');
    onTogglePick(num);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center py-2 px-2 sm:px-4 lg:px-8">
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5 w-full max-w-[850px] aspect-[8/5]">
        {CELLS.map((num) => {
          const isPicked = picks.includes(num);
          const isDrawn = drawnNumbers.includes(num);
          const isHit = isPicked && isDrawn;
          const isJustDrawn = lastDrawnNumber === num;
          const isMiss = isPicked && !isDrawn && phase === 'revealing' && drawnNumbers.length >= 7;
          
          return (
            <motion.button
              key={num}
              onClick={() => handleCellClick(num)}
              disabled={phase !== 'idle'}
              animate={
                isJustDrawn
                  ? {
                      scale: isHit ? [1, 1.32, 0.95, 1] : [1, 1.2, 0.98, 1],
                      rotate: isHit ? [0, -3, 3, 0] : 0,
                      filter: isHit ? ['brightness(2.2)', 'brightness(1)'] : ['brightness(1.6)', 'brightness(1)'],
                    }
                  : { scale: 1, opacity: 1, filter: 'brightness(1)' }
              }
              whileHover={{ scale: phase === 'idle' ? 1.06 : 1, y: phase === 'idle' ? -2 : 0 }}
              whileTap={{ scale: 0.94, y: 1 }}
              transition={{
                duration: isJustDrawn ? 0.45 : 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn(
                'relative flex items-center justify-center rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all duration-250',
                'border overflow-hidden select-none',
                // Base styling (Unpicked, Undrawn)
                !isPicked && !isDrawn && 'bg-white/[0.04] border-white/10 text-white/40 shadow-inner hover:text-white/90 hover:bg-white/[0.08] hover:border-white/20',
                // Picked but not yet revealed
                isPicked && !isDrawn && !isMiss && 'bg-gradient-to-b from-blue-500/60 to-blue-700/30 border-blue-400/80 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]',
                // Drawn but not picked (House ball)
                !isPicked && isDrawn && 'bg-gradient-to-b from-amber-500/35 to-amber-900/50 border-amber-400/70 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.5)]',
                // Hit (Picked and Drawn) - Glowing Emerald Gem
                isHit && 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 border-emerald-300 text-white shadow-[inset_0px_2px_6px_rgba(255,255,255,0.7),0_0_30px_rgba(52,211,153,0.95)] z-20',
                // Missed (Picked but not Drawn after round finishes)
                isMiss && 'bg-red-950/30 border-red-500/30 text-white/30 opacity-45'
              )}
            >
              {/* Hit explosive ripple & burst ring */}
              <AnimatePresence>
                {isHit && isJustDrawn && (
                  <>
                    <motion.div
                      key={`hit-burst-${num}`}
                      className="absolute inset-0 bg-emerald-300/60 rounded-lg sm:rounded-xl pointer-events-none"
                      initial={{ scale: 0.8, opacity: 1 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.65, ease: 'easeOut' }}
                    />
                    <motion.div
                      key={`hit-ring-${num}`}
                      className="absolute inset-0 border-2 border-white rounded-lg sm:rounded-xl pointer-events-none"
                      initial={{ scale: 0.6, opacity: 1 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </>
                )}
              </AnimatePresence>
              
              {/* House drawn ring */}
              <AnimatePresence>
                {isDrawn && !isHit && isJustDrawn && (
                  <motion.div
                    key={`house-burst-${num}`}
                    className="absolute inset-0 border-2 border-amber-300/80 rounded-lg sm:rounded-xl pointer-events-none"
                    initial={{ scale: 0.6, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>

              {/* Top highlight glare */}
              {(isHit || (isPicked && !isDrawn)) && (
                <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
              )}

              <span className="relative z-10 font-mono tracking-tight">{num}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

const KenoCell = memo(function KenoCell({
  num,
  kind,
  fresh,
  clickable,
  onClick,
}: {
  num: number;
  kind: CellKind;
  fresh: boolean;
  clickable: boolean;
  onClick: (n: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const canPress = clickable;

  const face =
    kind === 'hit'
      ? {
          background:
            'linear-gradient(160deg, rgba(160,224,171,0.22) 0%, rgba(12,18,14,0.94) 72%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
          border: '1px solid rgba(160,224,171,0.38)',
          color: '#E8F8EC',
        }
      : kind === 'house'
        ? {
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(14,14,16,0.94) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: 'rgba(255,255,255,0.82)',
          }
        : kind === 'picked'
          ? {
              background:
                'linear-gradient(180deg, rgba(244,232,200,0.16) 0%, rgba(18,16,12,0.94) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(244,232,200,0.22)',
              border: '1px solid rgba(244,232,200,0.28)',
              color: '#F4E8C8',
            }
          : kind === 'miss'
            ? {
                background: 'rgba(12,12,14,0.92)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.28)',
              }
            : {
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(18,19,22,0.92) 48%, rgba(8,8,10,0.98) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.40)',
              };

  const className = cn(
    'relative aspect-square rounded-[12px] flex items-center justify-center font-roobert tabular-nums select-none text-[13px] sm:text-[14px]',
    !canPress && 'cursor-default'
  );

  const inner = (
    <span className="relative z-10 font-medium tracking-tight">{num}</span>
  );

  if (canPress) {
    return (
      <Pressable
        type="button"
        onClick={() => onClick(num)}
        className={className}
        style={face}
        aria-label={`${num}`}
        aria-pressed={kind === 'picked'}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <motion.div
      aria-hidden={!clickable}
      animate={
        reduceMotion || !fresh
          ? { scale: 1 }
          : { scale: [1.08, 1] }
      }
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={face}
    >
      {inner}
    </motion.div>
  );
});
