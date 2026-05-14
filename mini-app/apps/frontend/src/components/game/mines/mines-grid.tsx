'use client';

import { motion } from 'framer-motion';
import { Bomb, Gem } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mines Grid — Monopo Saigon Style
 *
 * 5×5 board of pill-rounded tiles. Each cell has up to four visual states:
 *   - idle        → number 1..25, frosted glass tile, hoverable.
 *   - revealed    → diamond icon, deep-ocean tint (cell user opened safely).
 *   - safe-shown  → diamond icon, frost tint (revealed at end of round so
 *                   the user sees the full board — never clicked).
 *   - exploded    → bomb icon, soft red tint (cell that ended the round).
 *   - mine-shown  → bomb icon, neutral frost (mine revealed at end of
 *                   round, but not the one user hit).
 *
 * The grid is purely presentational — clicks bubble up via onCellClick.
 * Pass `minePositions` only after the round resolves; that toggles the
 * full-board reveal so the user can see where every mine and every safe
 * cell was.
 */

type CellState = 'idle' | 'revealed' | 'exploded' | 'mine-shown' | 'safe-shown';

interface MinesGridProps {
  /** Indices 0..24 the user has revealed safely. */
  revealed: number[];
  /** All mine positions (only known once the round ends). */
  minePositions?: number[];
  /** The cell that ended the round, if any. */
  hitPosition?: number | null;
  /** When true, all clicks are ignored — round over or no active round. */
  disabled?: boolean;
  onCellClick?: (index: number) => void;
}

const CELLS = Array.from({ length: 25 }, (_, i) => i);

export function MinesGrid({
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
      // Round is over — reveal the full board.
      return minePositions.includes(i) ? 'mine-shown' : 'safe-shown';
    }
    return 'idle';
  };

  return (
    <div className="grid grid-cols-5 gap-2">
      {CELLS.map((i) => {
        const state = cellState(i);
        const isClickable = !disabled && state === 'idle';
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => isClickable && onCellClick?.(i)}
            disabled={!isClickable}
            whileTap={isClickable ? { scale: 0.94 } : undefined}
            className={cn(
              'aspect-square rounded-card border flex items-center justify-center font-roobert font-light tabular-nums select-none transition-colors',
              state === 'idle' &&
                'border-white/10 bg-white/[0.04] backdrop-blur-md text-frost-white/55 hover:text-frost-white hover:border-white/25',
              state === 'revealed' &&
                'border-white/25 bg-[linear-gradient(135deg,rgba(160,224,171,0.22),rgba(255,172,46,0.15))] text-frost-white',
              state === 'safe-shown' &&
                'border-white/15 bg-white/[0.06] text-frost-white/70',
              state === 'exploded' &&
                'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]',
              state === 'mine-shown' &&
                'border-white/10 bg-white/[0.04] text-whisper-gray',
              !isClickable && 'cursor-default'
            )}
            aria-label={`Клетка ${i + 1}`}
          >
            {state === 'idle' && (
              <span className="text-[14px]">{i + 1}</span>
            )}
            {(state === 'revealed' || state === 'safe-shown') && (
              <Gem size={18} strokeWidth={1.6} />
            )}
            {(state === 'exploded' || state === 'mine-shown') && (
              <Bomb size={18} strokeWidth={1.6} />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
