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
              initial={{ scale: 0.8, opacity: 0 }}
              animate={
                isJustDrawn
                  ? { scale: [1, 1.22, 1], filter: ['brightness(2)', 'brightness(1)'] }
                  : { scale: 1, opacity: 1, filter: 'brightness(1)' }
              }
              whileHover={{ scale: phase === 'idle' ? 1.06 : 1, y: phase === 'idle' ? -2 : 0 }}
              whileTap={{ scale: 0.95, y: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
                delay: isJustDrawn ? 0 : num * 0.005,
              }}
              className={cn(
                'relative flex items-center justify-center rounded-lg sm:rounded-xl text-xs sm:text-base font-bold transition-all duration-300',
                'border overflow-hidden select-none',
                // Base styling (Unpicked, Undrawn) - 3D dark glass cube
                !isPicked && !isDrawn && 'bg-white/[0.04] border-white/10 text-white/40 shadow-inner hover:text-white/90 hover:bg-white/[0.08] hover:border-white/20',
                // Picked but not yet revealed - 3D blue/primary cube
                isPicked && !isDrawn && 'bg-gradient-to-b from-primary/50 to-primary/20 border-primary/60 border-t-primary/90 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]',
                // Drawn but not picked (House ball) - Warm amber glow
                !isPicked && isDrawn && 'bg-gradient-to-b from-amber-500/30 to-amber-900/40 border-amber-400/50 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)]',
                // Hit (Picked and Drawn) - Spectacular Glowing Emerald Cube
                isHit && 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 border-emerald-300 text-white shadow-[inset_0px_2px_4px_rgba(255,255,255,0.6),_0_0_25px_rgba(52,211,153,0.9)] z-10',
                // Missed (Picked but not Drawn)
                isMiss && 'bg-destructive/20 border-destructive/30 text-white/30 opacity-50'
              )}
            >
              {/* Hit animation ripple & particle ring */}
              <AnimatePresence>
                {isHit && (
                  <motion.div
                    className="absolute inset-0 bg-emerald-400/40 rounded-lg sm:rounded-xl pointer-events-none"
                    initial={{ scale: 0.6, opacity: 1 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              
              {/* Drawn animation ring */}
              <AnimatePresence>
                {isDrawn && !isHit && (
                  <motion.div
                    className="absolute inset-0 border-2 border-amber-400/60 rounded-lg sm:rounded-xl pointer-events-none"
                    initial={{ scale: 0.5, opacity: 1 }}
                    animate={{ scale: 1.2, opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  />
                )}
              </AnimatePresence>

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
