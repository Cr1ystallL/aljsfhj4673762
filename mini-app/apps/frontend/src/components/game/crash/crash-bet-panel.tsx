'use client';

import { Minus, Plus } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

/**
 * Crash Bet Panel — Monopo Saigon Style
 *
 * One betting slot. The card is split into two rows:
 *   1. Top row, two columns: stake | auto-cashout (each with ± controls).
 *   2. Bottom row: a single full-width pill CTA that adapts to the slot's
 *      lifecycle.
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

  const decAuto = () =>
    onAutoCashoutChange(Math.max(1.01, +(autoCashoutMultiplier - 0.1).toFixed(2)));
  const incAuto = () =>
    onAutoCashoutChange(+(autoCashoutMultiplier + 0.1).toFixed(2));

  return (
    <BetPanelShell>
      <div className="grid grid-cols-2 items-stretch">
        <div className="px-4 py-3 border-r border-white/10">
          <StakeField
            amount={amount}
            onAmountChange={onAmountChange}
            minBet={minBet}
            maxBet={maxBet}
            disabled={inputsLocked}
            label={t('common.bet')}
            decreaseLabel={t('common.decreaseBet')}
            increaseLabel={t('common.increaseBet')}
          />
        </div>

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

      <BetPanelCtaRow>
        <GamePrimaryButton
          onClick={onPrimary}
          disabled={ctaDisabled}
          tone={ctaActive ? 'solid' : 'muted'}
        >
          {busy ? '…' : ctaLabel}
        </GamePrimaryButton>
      </BetPanelCtaRow>
    </BetPanelShell>
  );
});
