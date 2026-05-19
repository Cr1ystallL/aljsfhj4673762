'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CoinSide } from '@/lib/games/coinflip/types';

/**
 * Coinflip Side Buttons — Monopo Saigon Style
 *
 * Two big pill buttons "Heads" / "Tails". Used both as the "place a
 * single bet on this side" CTA in quick mode and as the "pick next
 * round side" CTA in multiply mode.
 *
 * The active side gets the brand Deep Ocean gradient. Disabled state
 * dims everything to ~50% to make it obvious that the round is paused.
 */

interface CoinflipSideButtonsProps {
  onPick: (side: CoinSide) => void;
  /** While true the buttons stay visible but cannot be pressed. */
  disabled?: boolean;
  /** Optional pre-pick highlight. */
  selected?: CoinSide | null;
  /** Label for each button — stack a small caption under the heading. */
  captions?: { heads?: string; tails?: string };
}

export function CoinflipSideButtons({
  onPick,
  disabled = false,
  selected,
  captions,
}: CoinflipSideButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SideButton
        label="Heads"
        caption={captions?.heads}
        active={selected === 'heads'}
        disabled={disabled}
        onClick={() => onPick('heads')}
        accent="primary"
      />
      <SideButton
        label="Tails"
        caption={captions?.tails}
        active={selected === 'tails'}
        disabled={disabled}
        onClick={() => onPick('tails')}
        accent="ghost"
      />
    </div>
  );
}

function SideButton({
  label,
  caption,
  active,
  disabled,
  onClick,
  accent,
}: {
  label: string;
  caption?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  accent: 'primary' | 'ghost';
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      style={
        active
          ? {
              background:
                'linear-gradient(135deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 60%, rgb(165, 45, 37) 100%)',
              color: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.25)',
            }
          : accent === 'primary'
          ? {
              background:
                'linear-gradient(135deg, rgba(160, 224, 171, 0.15) 0%, rgba(255, 172, 46, 0.10) 60%, rgba(165, 45, 37, 0.10) 100%)',
              border: '1px solid rgba(255, 172, 46, 0.40)',
              color: '#ffffff',
            }
          : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ffffff',
            }
      }
      className={cn(
        'h-14 rounded-pill flex flex-col items-center justify-center gap-0.5 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span className="font-roobert text-[14px] uppercase tracking-[0.2em]">
        {label}
      </span>
      {caption && (
        <span className="font-roobert text-[10px] tabular-nums opacity-70">
          {caption}
        </span>
      )}
    </motion.button>
  );
}
