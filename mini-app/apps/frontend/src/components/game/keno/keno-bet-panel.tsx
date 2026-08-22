'use client';

import { Dice5, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import { useT } from '@/i18n/use-t';
import { Pressable } from '@/components/ui/pressable';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

export type KenoPhase = 'idle' | 'playing' | 'revealing';
type KenoRisk = 'low' | 'medium' | 'high';

interface KenoBetPanelProps {
  amount: number;
  onAmountChange: (v: number) => void;
  risk: string;
  onRiskChange: (r: string) => void;
  picks: number[];
  onAutoPick: () => void;
  onClear: () => void;
  phase: KenoPhase;
  onBet: () => void;
  busy: boolean;
  maxPick: number;
  activeBalance: number;
  currency: string;
}

export function KenoBetPanel({
  amount,
  onAmountChange,
  risk,
  onRiskChange,
  picks,
  onAutoPick,
  onClear,
  phase,
  onBet,
  busy,
  maxPick,
  activeBalance,
}: KenoBetPanelProps) {
  const { t } = useT();
  const disabled = phase !== 'idle' || busy;
  const minBet = 1;
  const maxBet = Math.max(1, Math.floor(activeBalance) || 1);
  const canBet = picks.length >= 1 && picks.length <= maxPick && !disabled;

  const ctaLabel =
    phase === 'revealing'
      ? t('common.playing')
      : busy
        ? t('common.loading')
        : t('common.bet');

  return (
    <BetPanelShell>
      <div className="grid grid-cols-2 items-stretch">
        <div className="px-4 py-3 border-r border-white/10">
          <StakeField
            amount={amount}
            onAmountChange={onAmountChange}
            minBet={minBet}
            maxBet={maxBet}
            disabled={disabled}
            label={t('common.bet')}
            decreaseLabel={t('common.decreaseBet')}
            increaseLabel={t('common.increaseBet')}
          />
        </div>

        <div className="px-4 py-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            {t('common.risk')}
          </span>
          <div className="mt-2 flex flex-col gap-1">
            {(['low', 'medium', 'high'] as KenoRisk[]).map((r) => (
              <Pressable
                key={r}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onRiskChange(r);
                  soundManager.play('ui.click');
                }}
                className={cn(
                  'h-7 rounded-pill border text-[10px] uppercase tracking-[0.16em] font-roobert',
                  risk === r
                    ? 'bg-frost-white text-midnight-canvas border-frost-white'
                    : 'bg-transparent text-frost-white/70 border-white/20 disabled:opacity-40'
                )}
              >
                {r === 'low'
                  ? t('risk.low')
                  : r === 'medium'
                    ? t('risk.medium')
                    : t('risk.high')}
              </Pressable>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 grid grid-cols-2 gap-2 border-t border-white/10">
        <Pressable
          type="button"
          disabled={disabled}
          onClick={onAutoPick}
          className="h-9 rounded-pill border border-white/15 text-frost-white/80 font-roobert text-[11px] uppercase tracking-[0.16em] inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Dice5 className="w-3.5 h-3.5" />
          {t('common.auto')}
        </Pressable>
        <Pressable
          type="button"
          disabled={disabled || picks.length === 0}
          onClick={onClear}
          className="h-9 rounded-pill border border-white/15 text-frost-white/80 font-roobert text-[11px] uppercase tracking-[0.16em] inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('common.reset')}
        </Pressable>
      </div>

      <BetPanelCtaRow>
        <GamePrimaryButton
          onClick={onBet}
          disabled={!canBet}
          tone={canBet ? 'solid' : 'muted'}
        >
          {ctaLabel}
        </GamePrimaryButton>
      </BetPanelCtaRow>

      <div className="text-center pb-2.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
          {t('keno.picked', { n: picks.length, max: maxPick })}
        </span>
      </div>
    </BetPanelShell>
  );
}
