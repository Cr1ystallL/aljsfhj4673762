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
 *   - exploded    → bomb icon over a deep-amber → red gradient (cell that
 *                   ended the round).
 *   - mine-shown  → bomb icon, soft red tint (mine revealed at end of
 *                   round, but not the one user hit).
 *
 * Colour comes exclusively from the brand Deep Ocean Gradient (green →
 * amber → red); no off-palette accents. The icons themselves are the
 * primary signal and are tinted with subtle gradient fills.
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
          const isClickable = !disabled && state === 'idle';
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => isClickable && onCellClick?.(i)}
              disabled={!isClickable}
              whileTap={isClickable ? { scale: 0.94 } : undefined}
              animate={
                state === 'revealed' ? { scale: [0.85, 1.05, 1] } : { scale: 1 }
              }
              transition={
                state === 'revealed'
                  ? { duration: 0.35, ease: 'easeOut' }
                  : { duration: 0.2 }
              }
              className={cn(
                'relative aspect-square rounded-card border flex items-center justify-center font-roobert font-light tabular-nums select-none transition-colors overflow-hidden',
                state === 'idle' &&
                  'border-white/10 bg-white/[0.04] backdrop-blur-md text-frost-white/55 hover:text-frost-white hover:border-white/25 hover:bg-white/[0.07]',
                state === 'revealed' &&
                  'border-[rgba(160,224,171,0.45)] text-frost-white shadow-[inset_0_0_18px_rgba(160,224,171,0.18)]',
                state === 'safe-shown' &&
                  'border-white/15 bg-white/[0.05] text-frost-white/70',
                state === 'exploded' &&
                  'border-[rgba(165,45,37,0.6)] text-frost-white shadow-[inset_0_0_22px_rgba(165,45,37,0.35)]',
                state === 'mine-shown' &&
                  'border-[rgba(165,45,37,0.25)] bg-[rgba(165,45,37,0.10)] text-[#ff8a76]',
                !isClickable && 'cursor-default'
              )}
              aria-label={`Клетка ${i + 1}`}
            >
              {/* Decorative gradient fills for the resolved states */}
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
                {state === 'idle' && (
                  <span className="text-[14px]">{i + 1}</span>
                )}
                {state === 'revealed' && (
                  <Gem
                    size={20}
                    strokeWidth={1.6}
                    className="text-[#a0e0ab]"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(160, 224, 171, 0.45))' }}
                  />
                )}
                {state === 'safe-shown' && (
                  <Gem
                    size={18}
                    strokeWidth={1.6}
                    className="text-frost-white/75"
                  />
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
        })}
      </div>
    </div>
  );
}
