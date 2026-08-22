'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Pressable } from '@/components/ui/pressable';

/**
 * Mines field — stone tiles, glass diamond, steel mine.
 * No Lucide gem/bomb: those read as emoji on a 5×5 board.
 * Idle cells stay cheap (no blur, no Framer) for 25 tiles on WebView.
 */

type CellState = 'idle' | 'revealed' | 'exploded' | 'mine-shown' | 'safe-shown';

interface MinesGridProps {
  revealed: number[];
  minePositions?: number[];
  hitPosition?: number | null;
  disabled?: boolean;
  onCellClick?: (index: number) => void;
}

const CELLS = Array.from({ length: 25 }, (_, i) => i);

function DiamondGlyph({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
      className={lit ? 'drop-shadow-[0_0_8px_rgba(186,230,253,0.35)]' : ''}
    >
      <path
        d="M12 3.2 20.2 10.4 12 20.8 3.8 10.4Z"
        fill={lit ? 'rgba(186,230,253,0.22)' : 'rgba(255,255,255,0.06)'}
        stroke={lit ? 'rgba(224,242,254,0.92)' : 'rgba(255,255,255,0.45)'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12 3.2 8.2 10.4h7.6Z"
        fill={lit ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)'}
        stroke="none"
      />
      <path
        d="M3.8 10.4h16.4M8.2 10.4 12 20.8 15.8 10.4"
        fill="none"
        stroke={lit ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}
        strokeWidth="0.9"
      />
    </svg>
  );
}

function MineGlyph({ hot }: { hot: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <circle
        cx="12"
        cy="13"
        r="6.4"
        fill={hot ? 'rgba(40,18,16,0.95)' : 'rgba(22,22,24,0.95)'}
        stroke={hot ? 'rgba(255,138,118,0.85)' : 'rgba(255,255,255,0.28)'}
        strokeWidth="1.3"
      />
      <circle cx="10.2" cy="11.2" r="1.6" fill="rgba(255,255,255,0.14)" />
      <path
        d="M12 4.2v2.4M12 19.4v1.2M5.2 13H4M20 13h-1.2M7.2 7.4l-0.9-0.9M17.7 17.9l-0.9-0.9M16.8 7.4l0.9-0.9M7.2 18.6l-0.9 0.9"
        stroke={hot ? 'rgba(255,172,46,0.75)' : 'rgba(255,255,255,0.28)'}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const MinesGrid = memo(function MinesGrid({
  revealed,
  minePositions,
  hitPosition,
  disabled = false,
  onCellClick,
}: MinesGridProps) {
  const cellState = (i: number): CellState => {
    if (hitPosition === i) return 'exploded';
    if (revealed.includes(i)) return 'revealed';
    if (minePositions) {
      return minePositions.includes(i) ? 'mine-shown' : 'safe-shown';
    }
    return 'idle';
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-[22px] opacity-70"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 110%, rgba(148,163,184,0.12) 0%, transparent 70%)',
        }}
      />
      <div className="relative grid grid-cols-5 gap-2">
        {CELLS.map((i) => (
          <Cell
            key={i}
            index={i}
            state={cellState(i)}
            disabled={disabled}
            onCellClick={onCellClick}
          />
        ))}
      </div>
    </div>
  );
});

const Cell = memo(function Cell({
  index,
  state,
  disabled,
  onCellClick,
}: {
  index: number;
  state: CellState;
  disabled: boolean;
  onCellClick?: (i: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const isClickable = !disabled && state === 'idle';

  if (state === 'idle') {
    return (
      <Pressable
        type="button"
        onClick={() => isClickable && onCellClick?.(index)}
        disabled={!isClickable}
        className={cn(
          'relative aspect-square rounded-[14px] border border-white/10 flex items-center justify-center font-roobert tabular-nums select-none text-white/40',
          !isClickable && 'cursor-default'
        )}
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(18,19,22,0.92) 48%, rgba(8,8,10,0.98) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
        aria-label={`Cell ${index + 1}`}
      >
        <span className="relative text-[13px] font-medium tracking-tight">
          {index + 1}
        </span>
      </Pressable>
    );
  }

  return (
    <motion.button
      type="button"
      disabled
      animate={
        reduceMotion
          ? { scale: 1, opacity: 1 }
          : state === 'revealed'
            ? { scale: [0.92, 1] }
            : state === 'exploded'
              ? { scale: [1.04, 1] }
              : { scale: 1 }
      }
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative aspect-square rounded-[14px] border flex items-center justify-center select-none overflow-hidden cursor-default',
        state === 'revealed' && 'border-sky-200/35',
        state === 'safe-shown' && 'border-white/12 bg-white/[0.04]',
        state === 'exploded' && 'border-rose-400/45',
        state === 'mine-shown' && 'border-white/10 bg-[#141214]'
      )}
      style={
        state === 'revealed'
          ? {
              background:
                'linear-gradient(160deg, rgba(186,230,253,0.20) 0%, rgba(12,16,22,0.92) 70%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
            }
          : state === 'exploded'
            ? {
                background:
                  'linear-gradient(160deg, rgba(255,172,46,0.22) 0%, rgba(80,18,16,0.92) 70%)',
                boxShadow: 'inset 0 0 16px rgba(165,45,37,0.35)',
              }
            : undefined
      }
      aria-label={`Cell ${index + 1}`}
    >
      <span className="relative">
        {state === 'revealed' && <DiamondGlyph lit />}
        {state === 'safe-shown' && <DiamondGlyph lit={false} />}
        {state === 'exploded' && <MineGlyph hot />}
        {state === 'mine-shown' && <MineGlyph hot={false} />}
      </span>
    </motion.button>
  );
});
