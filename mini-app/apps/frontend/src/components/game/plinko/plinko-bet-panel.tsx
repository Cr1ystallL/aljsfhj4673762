'use client';

import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

interface PlinkoBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  minBet: number;
  maxBet: number;
  busy?: boolean;

  autoEnabled: boolean;
  onAutoToggle: (enabled: boolean) => void;

  canAfford?: boolean;

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
  canAfford = true,
  onPrimary,
}: PlinkoBetPanelProps) {
  const { t } = useT();
  const inputsLocked = busy || autoEnabled;
  const ctaDisabled = (busy && !autoEnabled) || (!autoEnabled && !canAfford);
  const ctaActive = autoEnabled || (!busy && canAfford);
  const ctaLabel = autoEnabled
    ? t('common.stop')
    : busy
      ? '…'
      : !canAfford
        ? t('common.insufficientFunds')
        : t('plinko.drop');

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
              {t('common.autoBet')}
            </span>
            <button
              type="button"
              onClick={() => onAutoToggle(!autoEnabled)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[9px] uppercase tracking-[0.16em] font-roobert transition-colors',
                autoEnabled
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-transparent text-frost-white/70 border-white/20 hover:border-white/35'
              )}
            >
              {autoEnabled ? t('common.on') : t('common.off')}
            </button>
          </div>
          <div className="mt-2 font-roobert text-[22px] font-light tabular-nums text-frost-white">
            {autoEnabled ? t('common.on') : t('common.off')}
          </div>
        </div>
      </div>

      <BetPanelCtaRow>
        <GamePrimaryButton
          onClick={onPrimary}
          disabled={ctaDisabled}
          tone={ctaActive ? 'solid' : 'muted'}
        >
          {ctaLabel}
        </GamePrimaryButton>
      </BetPanelCtaRow>
    </BetPanelShell>
  );
}
