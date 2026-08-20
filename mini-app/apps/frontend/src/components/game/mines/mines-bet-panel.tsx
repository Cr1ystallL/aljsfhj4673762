'use client';

import { Bomb, Minus, Plus } from 'lucide-react';
import { useT } from '@/i18n/use-t';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  KitStepperButton,
  StakeField,
} from '@/components/game/kit';

export type MinesPhase = 'idle' | 'active' | 'cashed' | 'busted';

interface MinesBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  mineCount: number;
  onMineCountChange: (next: number) => void;

  phase: MinesPhase;
  currentMultiplier: number;
  busy?: boolean;

  minBet: number;
  maxBet: number;
  canCashout: boolean;

  onPrimary: () => void;
}

export function MinesBetPanel({
  amount,
  onAmountChange,
  mineCount,
  onMineCountChange,
  phase,
  currentMultiplier,
  busy = false,
  minBet,
  maxBet,
  canCashout,
  onPrimary,
}: MinesBetPanelProps) {
  const { t } = useT();
  const inputsLocked = phase !== 'idle';

  const ctaLabel = (() => {
    if (busy) return '…';
    if (phase === 'idle') return t('mines.play');
    if (phase === 'active') {
      return canCashout
        ? t('common.cashOutWithMult', { x: currentMultiplier.toFixed(2) })
        : t('common.revealFirst');
    }
    return t('common.newRound');
  })();

  const ctaActive =
    phase === 'idle' ||
    (phase === 'active' && canCashout) ||
    phase === 'cashed' ||
    phase === 'busted';

  const ctaDisabled = busy || (phase === 'active' && !canCashout);

  const decMines = () => onMineCountChange(Math.max(1, mineCount - 1));
  const incMines = () => onMineCountChange(Math.min(24, mineCount + 1));

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
              {t('mines.mines')}
            </span>
            <span className="text-[9px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
              {t('mines.minesRange')}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <KitStepperButton
              onClick={decMines}
              disabled={inputsLocked || mineCount <= 1}
              ariaLabel={t('mines.fewerMines')}
            >
              <Minus size={12} strokeWidth={2.2} />
            </KitStepperButton>
            <div className="flex-1 flex items-center justify-center gap-2">
              <Bomb
                size={14}
                strokeWidth={1.6}
                className="text-[#ff8a76]/80"
              />
              <span className="font-roobert text-[22px] font-light tabular-nums text-frost-white">
                {mineCount}
              </span>
            </div>
            <KitStepperButton
              onClick={incMines}
              disabled={inputsLocked || mineCount >= 24}
              ariaLabel={t('mines.moreMines')}
            >
              <Plus size={12} strokeWidth={2.2} />
            </KitStepperButton>
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
