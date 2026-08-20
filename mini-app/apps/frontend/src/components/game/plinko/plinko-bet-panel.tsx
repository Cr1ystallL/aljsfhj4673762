'use client';

import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

/**
 * Plinko Bet Panel — stake row + auto toggle + primary CTA.
 * Visual pieces come from the shared game kit so Crash / Mines / Plinko
 * stay on the same radius, type, and pill language.
 */

interface PlinkoBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  minBet: number;
  maxBet: number;
  busy?: boolean;

  autoEnabled: boolean;
  onAutoToggle: (enabled: boolean) => void;

  /** True when the user has enough balance for the current stake. */
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
  const ctaDisabled = (busy && !autoEnabled) || (!autoEnabled && !canAfford);
  const ctaLabel = autoEnabled
    ? t('common.stop')
    : busy
      ? '…'
      : !canAfford
        ? t('common.insufficientFunds')
        : t('plinko.drop');

  return (
    <BetPanelShell className="backdrop-blur-xl">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
        <StakeField
          variant="halve-double"
          amount={amount}
          onAmountChange={onAmountChange}
          minBet={minBet}
          maxBet={maxBet}
          disabled={busy || autoEnabled}
          inputClassName="text-[18px]"
        />

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
          {t('bridges.autoBet')}
          <span
            className={cn(
              'text-[9px] tracking-[0.16em]',
              autoEnabled ? 'text-midnight-canvas/70' : 'text-frost-white/55'
            )}
          >
            {autoEnabled ? t('common.on') : t('common.off')}
          </span>
        </button>
      </div>

      <BetPanelCtaRow>
        <GamePrimaryButton
          onClick={onPrimary}
          disabled={ctaDisabled}
          tone={
            autoEnabled ? 'stop' : !busy && canAfford ? 'gradient' : 'muted'
          }
        >
          {ctaLabel}
        </GamePrimaryButton>
      </BetPanelCtaRow>
    </BetPanelShell>
  );
}
