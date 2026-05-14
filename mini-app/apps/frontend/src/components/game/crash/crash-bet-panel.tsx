'use client';

import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Crash Bet Panel — Monopo Saigon Style
 *
 * One betting slot. Two-column layout: stake on the left, auto-cashout
 * on the right, primary CTA pill on the far right. Frosted glass card,
 * pill controls, frost white text, generous breathing room.
 */

export type BetSlotPhase = 'idle' | 'queued' | 'active' | 'cashable' | 'finished';

interface CrashBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  autoCashoutEnabled: boolean;
  onAutoCashoutToggle: (enabled: boolean) => void;
  autoCashoutMultiplier: number;
  onAutoCashoutChange: (next: number) => void;
  phase: BetSlotPhase;
  multiplier: number;
  minBet: number;
  maxBet: number;
  onPrimary: () => void;
  disabled?: boolean;
}

export function CrashBetPanel({
  amount,
  onAmountChange,
  autoCashoutEnabled,
  onAutoCashoutToggle,
  autoCashoutMultiplier,
  onAutoCashoutChange,
  phase,
  multiplier,
  minBet,
  maxBet,
  onPrimary,
  disabled = false,
}: CrashBetPanelProps) {
  const cta =
    phase === 'cashable'
      ? `Забрать · x${multiplier.toFixed(2)}`
      : phase === 'queued'
      ? 'Отменить'
      : phase === 'active'
      ? 'Ожидание'
      : 'Играть';

  const ctaActive = phase === 'cashable' || phase === 'idle';

  const decAmount = () => onAmountChange(Math.max(minBet, +(amount / 2).toFixed(2)));
  const incAmount = () => onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));
  const decAuto = () => onAutoCashoutChange(Math.max(1.01, +(autoCashoutMultiplier - 0.1).toFixed(2)));
  const incAuto = () => onAutoCashoutChange(+(autoCashoutMultiplier + 0.1).toFixed(2));

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_auto] items-stretch">
        {/* Stake */}
        <div className="px-4 py-3 border-r border-white/10">
          <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            Ставка
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={decAmount}
              disabled={disabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Уменьшить ставку"
            >
              <Minus size={12} strokeWidth={2.2} />
            </button>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onAmountChange(Math.max(minBet, Math.min(maxBet, v)));
              }}
              disabled={disabled}
              className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[22px] font-light tabular-nums focus:outline-none text-center"
              step={minBet}
              min={minBet}
              max={maxBet}
            />
            <button
              onClick={incAmount}
              disabled={disabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Увеличить ставку"
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Auto cashout */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert truncate">
              Авто-вывод
            </span>
            <button
              onClick={() => onAutoCashoutToggle(!autoCashoutEnabled)}
              disabled={disabled}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[9px] uppercase tracking-[0.16em] font-roobert transition-colors',
                autoCashoutEnabled
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-transparent text-frost-white/70 border-white/20 hover:border-white/35'
              )}
            >
              {autoCashoutEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={decAuto}
              disabled={disabled || !autoCashoutEnabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Уменьшить множитель"
            >
              <Minus size={12} strokeWidth={2.2} />
            </button>
            <div
              className={cn(
                'flex-1 text-center font-roobert text-[22px] font-light tabular-nums',
                autoCashoutEnabled ? 'text-frost-white' : 'text-whisper-gray'
              )}
            >
              x{autoCashoutMultiplier.toFixed(2)}
            </div>
            <button
              onClick={incAuto}
              disabled={disabled || !autoCashoutEnabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Увеличить множитель"
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Primary action */}
        <div className="p-2.5 flex items-stretch">
          <motion.button
            onClick={onPrimary}
            disabled={disabled || phase === 'active'}
            whileHover={!disabled ? { scale: 1.02 } : undefined}
            whileTap={!disabled ? { scale: 0.98 } : undefined}
            className={cn(
              'min-w-[96px] h-full px-5 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors',
              ctaActive
                ? 'bg-frost-white text-midnight-canvas hover:bg-frost-white/90'
                : 'bg-white/[0.06] text-frost-white/80 border border-white/15 hover:bg-white/10',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {cta}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
