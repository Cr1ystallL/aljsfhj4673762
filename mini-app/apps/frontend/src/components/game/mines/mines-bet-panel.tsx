'use client';

import { Bomb, Gem, Minus, Plus } from 'lucide-react';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

/**
 * Mines Bet Panel — Monopo Saigon Style
 *
 * Two-row card. Top: stake (with halve / double pills) and mine count
 * (with halve / double pills, plus a soft caption "1..24"). Bottom:
 * a single full-width pill CTA whose label and behaviour adapt to the
 * round state:
 *
 *   - Idle (no round)     → "Play"
 *   - Active (≥1 reveal)  → "Cash Out · x1.32"
 *   - Active (no reveals) → "Cash Out" (disabled — must reveal first)
 *   - Bust / Cashed       → "New round"
 */

export type MinesPhase = 'idle' | 'active' | 'cashed' | 'busted';

interface MinesBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  mineCount: number;
  onMineCountChange: (next: number) => void;

  phase: MinesPhase;
  /** Multiplier earned so far this round; used in the cashout label. */
  currentMultiplier: number;
  /** True while a request is in flight. */
  busy?: boolean;

  minBet: number;
  maxBet: number;
  /** True if the user has revealed at least one safe cell. */
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
  const inputsLocked = phase !== 'idle';

  const ctaLabel = (() => {
    if (busy) return '…';
    if (phase === 'idle') return 'Играть';
    if (phase === 'active') {
      return canCashout
        ? `Забрать · x${currentMultiplier.toFixed(2)}`
        : 'Откройте ячейку';
    }
    return 'Новый раунд';
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
    <BetPanelShell className="backdrop-blur-xl">
      <div className="grid grid-cols-2 items-stretch">
        <div className="px-4 py-3 border-r border-white/10">
          <StakeField
            variant="halve-double"
            amount={amount}
            onAmountChange={onAmountChange}
            minBet={minBet}
            maxBet={maxBet}
            disabled={inputsLocked}
            label="Ставка"
          />
        </div>

        {/* Mines */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert truncate">
              Мины
            </span>
            <span className="text-[9px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
              1–24
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={decMines}
              disabled={inputsLocked || mineCount <= 1}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Меньше мин"
            >
              <Minus size={12} strokeWidth={2.2} />
            </button>
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
            <button
              onClick={incMines}
              disabled={inputsLocked || mineCount >= 24}
              className="w-7 h-7 rounded-pill border border-white/15 text-frost-white/80 flex items-center justify-center hover:border-white/30 hover:text-frost-white transition-colors disabled:opacity-40"
              aria-label="Больше мин"
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
          tone={
            ctaActive && phase === 'active' && canCashout
              ? 'gradient'
              : ctaActive
                ? 'solid'
                : 'muted'
          }
        >
          {phase === 'active' && canCashout && (
            <Gem size={13} strokeWidth={1.8} />
          )}
          {ctaLabel}
        </GamePrimaryButton>
      </BetPanelCtaRow>
    </BetPanelShell>
  );
}
