'use client';

import { motion } from 'framer-motion';
import { Bomb, Gem, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const halveAmount = () =>
    onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const doubleAmount = () =>
    onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));
  const decMines = () => onMineCountChange(Math.max(1, mineCount - 1));
  const incMines = () => onMineCountChange(Math.min(24, mineCount + 1));

  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
      {/* Row 1 — Stake + Mines */}
      <div className="grid grid-cols-2 items-stretch">
        {/* Stake */}
        <div className="px-4 py-3 border-r border-white/10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
              Ставка
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={halveAmount}
                disabled={inputsLocked}
                className="px-2 py-0.5 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[10px] font-roobert tabular-nums"
              >
                ½
              </button>
              <button
                onClick={doubleAmount}
                disabled={inputsLocked}
                className="px-2 py-0.5 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[10px] font-roobert tabular-nums"
              >
                ×2
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-whisper-gray text-[12px] font-roobert">zł</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v))
                  onAmountChange(Math.max(minBet, Math.min(maxBet, v)));
              }}
              disabled={inputsLocked}
              className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[22px] font-light tabular-nums focus:outline-none"
              step={1}
              min={minBet}
              max={maxBet}
            />
          </div>
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

      {/* Row 2 — Primary CTA */}
      <div className="px-3 pb-3 pt-1 border-t border-white/10">
        <motion.button
          onClick={onPrimary}
          disabled={ctaDisabled}
          whileHover={!ctaDisabled ? { scale: 1.01 } : undefined}
          whileTap={!ctaDisabled ? { scale: 0.99 } : undefined}
          style={
            ctaActive && phase === 'active' && canCashout
              ? {
                  background:
                    'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 55%, rgb(165, 45, 37) 100%)',
                  color: '#0a0a0a',
                }
              : undefined
          }
          className={cn(
            'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2',
            ctaActive
              ? phase === 'active' && canCashout
                ? 'hover:opacity-90'
                : 'bg-frost-white text-midnight-canvas hover:bg-frost-white/90'
              : 'bg-white/[0.06] text-frost-white/70 border border-white/15 hover:bg-white/10',
            ctaDisabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {phase === 'active' && canCashout && (
            <Gem size={13} strokeWidth={1.8} />
          )}
          {ctaLabel}
        </motion.button>
      </div>
    </div>
  );
}
