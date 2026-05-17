'use client';

import { motion } from 'framer-motion';
import { Bomb, Gem } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Mines Grid — Monopo Saigon Style
 *
 * 5×5 board of pill-rounded tiles. Each cell has up to four visual states:
 *   - idle        → number 1..25, frosted glass tile, hoverable.
 *   - revealed    → diamond icon, deep-ocean tint.
 *   - safe-shown  → diamond icon, frost tint (revealed at end of round).
 *   - exploded    → bomb icon, deep-amber → red gradient.
 *   - mine-shown  → bomb icon, soft red tint.
 *
 * Optimisation note: `backdrop-blur` on every idle tile (25 layers) was
 * the single biggest GPU drain on iPhone — every paint required 25 blur
 * passes against the page background. Using `backdrop-blur-md` carries
 * a paint-rect-multiplier penalty *per layer*, so we kill it on touch
 * devices via the global media query and rely on the slightly more
 * opaque `bg-white/[0.04]` solid fill.
 *
 * The previous implementation also wrapped every cell in a `motion.button`
 * with an `animate` prop on every render. Now only the cells that just
 * resolved animate — idle cells are plain `<button>` elements.
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
      {/* Soft Deep Ocean halo — barely visible, just enough atmosphere. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-card opacity-60"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 100%, rgba(165, 45, 37, 0.10) 0%, rgba(255, 172, 46, 0.06) 45%, rgba(160, 224, 171, 0.04) 70%, transparent 90%)',
        }}
      />

      <div className="relative grid grid-cols-5 gap-2">
        {CELLS.map((i) => {
          const state = cellState(i);
          return (
            <Cell
              key={i}
              index={i}
              state={state}
              disabled={disabled}
              onCellClick={onCellClick}
            />
          );
        })}
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
  const isClickable = !disabled && state === 'idle';

  // Idle cells render a plain button — no framer-motion overhead at all.
  // The reveal animation only runs on the cell that just changed state,
  // and the cells that get exposed at end of round draw without animation.
  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => isClickable && onCellClick?.(index)}
        disabled={!isClickable}
        className={cn(
          'relative aspect-square rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-md flex items-center justify-center font-roobert font-light tabular-nums select-none text-frost-white/55 transition-colors active:bg-white/[0.08]',
          !isClickable && 'cursor-default'
        )}
        aria-label={`Клетка ${index + 1}`}
      >
        <span className="relative text-[14px]">{index + 1}</span>
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      disabled
      animate={state === 'revealed' ? { scale: [0.85, 1.05, 1] } : { scale: 1 }}
      transition={
        state === 'revealed'
          ? { duration: 0.35, ease: 'easeOut' }
          : { duration: 0.2 }
      }
      className={cn(
        'relative aspect-square rounded-card border flex items-center justify-center font-roobert font-light tabular-nums select-none overflow-hidden cursor-default',
        state === 'revealed' &&
          'border-[rgba(160,224,171,0.45)] text-frost-white shadow-[inset_0_0_18px_rgba(160,224,171,0.18)]',
        state === 'safe-shown' &&
          'border-white/15 bg-white/[0.05] text-frost-white/70',
        state === 'exploded' &&
          'border-[rgba(165,45,37,0.6)] text-frost-white shadow-[inset_0_0_22px_rgba(165,45,37,0.35)]',
        state === 'mine-shown' &&
          'border-[rgba(165,45,37,0.25)] bg-[rgba(165,45,37,0.10)] text-[#ff8a76]'
      )}
      aria-label={`Клетка ${index + 1}`}
    >
      {state === 'revealed' && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(160, 224, 171, 0.32) 0%, rgba(255, 172, 46, 0.18) 100%)',
          }}
        />
      )}
      {state === 'exploded' && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(255, 172, 46, 0.28) 0%, rgba(165, 45, 37, 0.55) 100%)',
          }}
        />
      )}

      <span className="relative">
        {state === 'revealed' && (
          <Gem
            size={20}
            strokeWidth={1.6}
            className="text-[#a0e0ab]"
            style={{ filter: 'drop-shadow(0 0 6px rgba(160, 224, 171, 0.45))' }}
          />
        )}
        {state === 'safe-shown' && (
          <Gem size={18} strokeWidth={1.6} className="text-frost-white/75" />
        )}
        {state === 'exploded' && (
          <Bomb
            size={20}
            strokeWidth={1.6}
            className="text-[#ff8a76]"
            style={{ filter: 'drop-shadow(0 0 8px rgba(165, 45, 37, 0.55))' }}
          />
        )}
        {state === 'mine-shown' && (
          <Bomb size={18} strokeWidth={1.6} className="text-[#ff8a76]/85" />
        )}
      </span>
    </motion.button>
  );
});
