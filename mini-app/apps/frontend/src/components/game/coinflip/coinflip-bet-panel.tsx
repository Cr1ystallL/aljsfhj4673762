'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { CoinflipMode } from '@/lib/games/coinflip/types';
import { useT } from '@/i18n/use-t';
import { BetPanelShell, StakeField } from '@/components/game/kit';

interface CoinflipBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  mode: CoinflipMode;
  onModeChange: (next: CoinflipMode) => void;

  minBet: number;
  maxBet: number;
  locked?: boolean;

  balanceAmount: number;
  balanceReady: boolean;
  currencyLabel: string;
  shortOnFunds: boolean;
}

export function CoinflipBetPanel({
  amount,
  onAmountChange,
  mode,
  onModeChange,
  minBet,
  maxBet,
  locked = false,
  balanceAmount,
  balanceReady,
  currencyLabel,
  shortOnFunds,
}: CoinflipBetPanelProps) {
  const { t, localeTag } = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const modeLabel =
    mode === 'multiply' ? t('coinflip.multiply') : t('coinflip.quick');

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const el = triggerRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      const menu = document.getElementById('coinflip-mode-menu');
      if (menu && menu.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <BetPanelShell>
      <div className="grid grid-cols-2 items-stretch">
        <div className="px-4 py-3 border-r border-white/10">
          <StakeField
            amount={amount}
            onAmountChange={onAmountChange}
            minBet={minBet}
            maxBet={maxBet}
            disabled={locked}
            label={t('common.bet')}
            decreaseLabel={t('common.decreaseBet')}
            increaseLabel={t('common.increaseBet')}
          />
          <div
            className={cn(
              'mt-1 font-roobert text-[10px] tabular-nums',
              shortOnFunds ? 'text-[#ff8a76]' : 'text-whisper-gray'
            )}
          >
            {balanceReady
              ? `${balanceAmount.toLocaleString(localeTag, {
                  maximumFractionDigits: 2,
                })} ${currencyLabel}`
              : t('common.loadingBalance')}
          </div>
        </div>

        <div className="px-4 py-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            {t('common.mode')}
          </span>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => !locked && setOpen((v) => !v)}
            disabled={locked}
            className={cn(
              'mt-2 w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:border-white/25 transition-colors disabled:opacity-50',
              open && 'border-white/30'
            )}
          >
            <span className="font-roobert text-[12px] truncate">{modeLabel}</span>
            <ChevronDown
              size={12}
              strokeWidth={1.8}
              className={cn('transition-transform', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {open && !locked && menuRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              id="coinflip-mode-menu"
              style={{
                position: 'fixed',
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
                background: 'rgba(10, 10, 10, 0.96)',
              }}
              className="z-[1000] rounded-card border border-white/15 backdrop-blur-2xl overflow-hidden shadow-2xl"
            >
              {(['multiply', 'quick'] as CoinflipMode[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    onModeChange(k);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 font-roobert text-[12px] hover:bg-white/5 transition-colors',
                    k === mode ? 'text-frost-white' : 'text-frost-white/70'
                  )}
                >
                  {k === 'multiply' ? t('coinflip.multiply') : t('coinflip.quick')}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </BetPanelShell>
  );
}
