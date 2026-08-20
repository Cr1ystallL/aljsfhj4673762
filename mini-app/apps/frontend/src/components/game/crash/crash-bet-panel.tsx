'use client';

import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

/**
 * Crash Bet Panel — Monopo Saigon Style
 *
 * One betting slot. The card is split into two rows:
 *   1. Top row, two columns: stake | auto-cashout (each with ± controls).
 *   2. Bottom row: a single full-width pill CTA that adapts to the slot's
 *      lifecycle.
 *
 * Why two rows? On narrow Telegram WebView widths the previous 3-column
 * layout pushed the CTA off-screen. Stacking keeps the action discoverable
 * on every device.
 *
 * CTA labels per phase:
 *   - idle (open betting)        → "Play"            (place bet)
 *   - idle (round in progress)   → "Round in progress"        (disabled)
 *   - queued / locked            → "Cancel"          (refund)
 *   - cashable (round active)    → "Cash Out · x1.32"   (cashout)
 *   - finished_won               → "Cashed Out"           (terminal)
 *   - finished_lost              → "Lost"         (terminal)
 */

export type BetSlotPhase =
  | 'idle'
  | 'queued'
  | 'cashable'
  | 'finished_won'
  | 'finished_lost'
  | 'locked';

interface CrashBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  autoCashoutEnabled: boolean;
  onAutoCashoutToggle: (enabled: boolean) => void;
  autoCashoutMultiplier: number;
  onAutoCashoutChange: (next: number) => void;

  slotPhase: BetSlotPhase;
  multiplier: number;
  bettingClosed: boolean;
  minBet: number;
  maxBet: number;
  onPrimary: () => void;
  busy?: boolean;
}

export const CrashBetPanel = memo(function CrashBetPanel({
  amount,
  onAmountChange,
  autoCashoutEnabled,
  onAutoCashoutToggle,
  autoCashoutMultiplier,
  onAutoCashoutChange,
  slotPhase,
  multiplier,
  bettingClosed,
  minBet,
  maxBet,
  onPrimary,
  busy = false,
}: CrashBetPanelProps) {
  const { t } = useT();
  const inputsLocked = slotPhase !== 'idle';

  const [inputValue, setInputValue] = useState(amount.toString());
  useEffect(() => {
    setInputValue(amount.toString());
  }, [amount]);

  const ctaLabel = (() => {
    switch (slotPhase) {
      case 'idle':
        return bettingClosed ? t('crash.roundInProgress') : t('crash.play');
      case 'queued':
        return t('common.cancel');
      case 'locked':
        return t('crash.locked');
      case 'cashable':
        return t('common.cashOutWithMult', { x: multiplier.toFixed(2) });
      case 'finished_won':
        return t('common.cashedOut');
      case 'finished_lost':
        return t('common.lost');
    }
  })();

  const ctaActive =
    slotPhase === 'cashable' ||
    (slotPhase === 'idle' && !bettingClosed) ||
    slotPhase === 'queued';

  const ctaDisabled =
    busy ||
    slotPhase === 'finished_won' ||
    slotPhase === 'finished_lost' ||
    slotPhase === 'locked' ||
    (slotPhase === 'idle' && bettingClosed);

  const decAmount = () =>
    onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const incAmount = () =>
    onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));
  const decAuto = () =>
    onAutoCashoutChange(Math.max(1.01, +(autoCashoutMultiplier - 0.1).toFixed(2)));
  const incAuto = () =>
    onAutoCashoutChange(+(autoCashoutMultiplier + 0.1).toFixed(2));

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] overflow-hidden">
      {/* Row 1 — Stake + Auto cashout */}
      <div className="grid grid-cols-2 items-stretch">
        {/* Stake */}
        <div className="px-4 py-3 border-r border-white/10">
          <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            {t('common.bet')}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={decAmount}
              disabled={inputsLocked}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label={t('common.decreaseBet')}
            >
              <Minus size={12} strokeWidth={2.2} />
            </button>
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) {
                  onAmountChange(Math.max(minBet, Math.min(maxBet, v)));
                } else {
                  setInputValue(amount.toString());
                }
              }}
              disabled={inputsLocked}
              className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[22px] font-light tabular-nums focus:outline-none text-center"
              step={1}
              min={minBet}
              max={maxBet}
            />
            <button
              onClick={incAmount}
              disabled={inputsLocked}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label={t('common.increaseBet')}
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Auto cashout */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert truncate">
              {t('crash.autoCashout')}
            </span>
            <button
              onClick={() => onAutoCashoutToggle(!autoCashoutEnabled)}
              disabled={inputsLocked}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[9px] uppercase tracking-[0.16em] font-roobert transition-colors',
                autoCashoutEnabled
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-transparent text-frost-white/70 border-white/20 hover:border-white/35'
              )}
            >
              {autoCashoutEnabled ? t('common.on') : t('common.off')}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={decAuto}
              disabled={inputsLocked || !autoCashoutEnabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label={t('common.decreaseMult')}
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
              disabled={inputsLocked || !autoCashoutEnabled}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label={t('common.increaseMult')}
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2 — Primary CTA, full width */}
      <div className="px-3 pb-3 pt-1 border-t border-white/10">
        <motion.button
          onClick={onPrimary}
          disabled={ctaDisabled}
          whileTap={!ctaDisabled ? { scale: 0.99 } : undefined}
          className={cn(
            'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors',
            ctaActive
              ? 'bg-frost-white text-midnight-canvas hover:bg-frost-white/90'
              : 'bg-white/[0.06] text-frost-white/70 border border-white/15 hover:bg-white/10',
            ctaDisabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {busy ? '…' : ctaLabel}
        </motion.button>
      </div>
    </div>
  );
});
