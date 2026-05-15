'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Bet Panel — Monopo Saigon Style
 *
 * Compact bet-slot that mirrors the screen reference: stake row with
 * halve / double pills, then a full-width primary CTA. We don't expose
 * the auto-toggle from the reference because Plinko is single-shot —
 * each tap drops one ball — but the layout matches the same family of
 * cards used by Crash and Mines.
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
  const halve = () => onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const dbl = () => onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            Ставка
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={halve}
              disabled={busy}
              className="px-2 py-0.5 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[10px] font-roobert tabular-nums"
            >
              ½
            </button>
            <button
              onClick={dbl}
              disabled={busy}
              className="px-2 py-0.5 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[10px] font-roobert tabular-nums"
            >
              ×2
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
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
            className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[22px] font-light tabular-nums focus:outline-none"
            step={1}
            min={minBet}
            max={maxBet}
          />
        </div>
      </div>

      <div className="px-3 pb-3 pt-1 border-t border-white/10">
        <motion.button
          onClick={onPrimary}
          disabled={busy}
          whileHover={!busy ? { scale: 1.01 } : undefined}
          whileTap={!busy ? { scale: 0.99 } : undefined}
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
            'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2',
            busy && 'bg-white/[0.06] text-frost-white/70 border border-white/15'
          )}
        >
          {busy ? '…' : 'Сбросить'}
        </motion.button>
      </div>
    </div>
  );
}
