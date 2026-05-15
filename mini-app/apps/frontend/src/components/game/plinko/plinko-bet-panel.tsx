'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Bet Panel — Monopo Saigon Style
 *
 * Single horizontal row designed to fit on the first viewport together
 * with the board:
 *
 *   [ ½ ] [ ₽ amount ] [ ×2 ]   [ Сбросить · pill CTA  ]
 *
 * The CTA carries the brand Deep Ocean gradient so it remains the visual
 * focal point of the entire screen.
 */

interface PlinkoBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  minBet: number;
  maxBet: number;
  busy?: boolean;
  onPrimary: () => void;
}

export function PlinkoBetPanel({
  amount,
  onAmountChange,
  minBet,
  maxBet,
  busy = false,
  onPrimary,
}: PlinkoBetPanelProps) {
  const halve = () =>
    onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const dbl = () =>
    onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl p-1.5 grid grid-cols-[1fr_auto] items-stretch gap-1.5">
      {/* Stake row: ½  [ ₽ amount ]  ×2 */}
      <div className="flex items-center gap-1.5 px-2">
        <button
          onClick={halve}
          disabled={busy}
          className="shrink-0 px-2.5 py-1 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[11px] font-roobert tabular-nums"
        >
          ½
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-whisper-gray text-[12px] font-roobert">₽</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v))
                onAmountChange(Math.max(minBet, Math.min(maxBet, v)));
            }}
            disabled={busy}
            className="w-full min-w-0 bg-transparent text-frost-white font-roobert text-[18px] font-light tabular-nums focus:outline-none"
            step={1}
            min={minBet}
            max={maxBet}
          />
        </div>

        <button
          onClick={dbl}
          disabled={busy}
          className="shrink-0 px-2.5 py-1 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[11px] font-roobert tabular-nums"
        >
          ×2
        </button>
      </div>

      {/* Primary CTA — gradient pill */}
      <motion.button
        onClick={onPrimary}
        disabled={busy}
        whileHover={!busy ? { scale: 1.02 } : undefined}
        whileTap={!busy ? { scale: 0.98 } : undefined}
        style={
          !busy
            ? {
                background:
                  'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
                color: '#0a0a0a',
              }
            : undefined
        }
        className={cn(
          'min-w-[120px] px-5 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center',
          busy && 'bg-white/[0.06] text-frost-white/70 border border-white/15'
        )}
      >
        {busy ? '…' : 'Сбросить'}
      </motion.button>
    </div>
  );
}
