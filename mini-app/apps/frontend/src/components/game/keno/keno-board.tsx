'use client';

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';
import type { KenoPhase } from './keno-bet-panel';
import { KENO_BOARD_SIZE, KENO_DRAW_COUNT } from './keno-multipliers';

interface KenoBoardProps {
  picks: number[];
  onTogglePick: (num: number) => void;
  drawnNumbers: number[];
  lastDrawn?: number | null;
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
  lastDrawn = null,
  phase,
  maxPick,
  drawCount = KENO_DRAW_COUNT,
}: KenoBoardProps) {
  const drawComplete = drawnNumbers.length >= drawCount;

  const handleCellClick = (num: number) => {
    if (phase !== 'idle') return;
    if (!picks.includes(num) && picks.length >= maxPick) return;
    onTogglePick(num);
  };

  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-[22px] opacity-70"
        style={{
          background:
            'radial-gradient(80% 55% at 50% 0%, rgba(244,232,200,0.07) 0%, transparent 70%)',
        }}
      />
      <div className="relative grid grid-cols-8 gap-1.5 sm:gap-2">
        {CELLS.map((num) => (
          <KenoCell
            key={num}
            num={num}
            kind={kindOf(num, picks, drawnNumbers, drawComplete)}
            fresh={lastDrawn === num}
            clickable={phase === 'idle'}
            onClick={handleCellClick}
          />
        ))}
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
