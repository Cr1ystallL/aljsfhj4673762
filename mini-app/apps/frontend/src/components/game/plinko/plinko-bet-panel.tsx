'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Plinko Bet Panel — Monopo Saigon Style
 *
 * One compact card that fits on the first viewport with the board:
 *
 *   ┌─ stake row ─────────────────────────┐
 *   │  ½  ₽ amount  ×2     [Авто  ON]     │
 *   └─────────────────────────────────────┘
 *   ┌─ primary CTA ───────────────────────┐
 *   │           Сбросить                  │
 *   └─────────────────────────────────────┘
 *
 * Auto toggle is owned by the parent page; this component only renders
 * its current state and reports the user's intent.
 */

interface PlinkoBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  minBet: number;
  maxBet: number;
  busy?: boolean;

  autoEnabled: boolean;
  onAutoToggle: (enabled: boolean) => void;

  onPrimary: () => void;
}

export function PlinkoBetPanel({
  amount,
  onAmountChange,
  minBet,
  maxBet,
  busy = false,
  autoEnabled,
  onAutoToggle,
  onPrimary,
}: PlinkoBetPanelProps) {
  const halve = () =>
    onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const dbl = () =>
    onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));

  const ctaLabel = autoEnabled
    ? 'Остановить'
    : busy
    ? '…'
    : 'Сбросить';

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
      {/* Top row: stake controls + Auto toggle */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={halve}
            disabled={busy || autoEnabled}
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
              disabled={busy || autoEnabled}
              className="w-full min-w-0 bg-transparent text-frost-white font-roobert text-[18px] font-light tabular-nums focus:outline-none"
              step={1}
              min={minBet}
              max={maxBet}
            />
          </div>

          <button
            onClick={dbl}
            disabled={busy || autoEnabled}
            className="shrink-0 px-2.5 py-1 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[11px] font-roobert tabular-nums"
          >
            ×2
          </button>
        </div>

        {/* Auto toggle */}
        <button
          type="button"
          onClick={() => onAutoToggle(!autoEnabled)}
          className={cn(
            'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border text-[10px] uppercase tracking-[0.18em] font-roobert transition-colors',
            autoEnabled
              ? 'bg-frost-white text-midnight-canvas border-frost-white'
              : 'bg-transparent text-frost-white/70 border-white/20 hover:border-white/35'
          )}
        >
          Авто
          <span
            className={cn(
              'text-[9px] tracking-[0.16em]',
              autoEnabled ? 'text-midnight-canvas/70' : 'text-frost-white/55'
            )}
          >
            {autoEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Primary CTA */}
      <div className="px-3 pb-3 pt-1 border-t border-white/10">
        <motion.button
          onClick={onPrimary}
          disabled={busy && !autoEnabled}
          whileHover={!busy ? { scale: 1.01 } : undefined}
          whileTap={!busy ? { scale: 0.99 } : undefined}
          style={
            !busy || autoEnabled
              ? autoEnabled
                ? {
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }
                : {
                    background:
                      'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
                    color: '#0a0a0a',
                  }
              : undefined
          }
          className={cn(
            'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2',
            busy && !autoEnabled && 'bg-white/[0.06] text-frost-white/70 border border-white/15'
          )}
        >
          {ctaLabel}
        </motion.button>
      </div>
    </div>
  );
}
