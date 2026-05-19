'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { CoinflipMode } from '@/lib/games/coinflip/types';

/**
 * Coinflip Bet Panel — Monopo Saigon Style
 *
 * Two columns:
 *   - Stake (left): zł input with halve / double pills.
 *   - Mode (right): dropdown selecting "Multiplier" (multiply) /
 *     "Quick play" (quick).
 *
 * Mirrors the layout from the design reference but built entirely out
 * of frosted-glass pills — no off-palette accents.
 *
 * The mode dropdown is rendered via a React portal anchored to the
 * trigger button. Sibling cards below the panel (history, multiplier
 * strip) all have their own backdrop-blur stacking contexts, which
 * silently steal pointer events from any z-indexed child of the panel.
 * Portaling lifts the menu into <body> where nothing can paint over it.
 */

const MODE_LABEL: Record<CoinflipMode, string> = {
  multiply: 'Multiplier',
  quick: 'Quick play',
};

interface CoinflipBetPanelProps {
  amount: number;
  onAmountChange: (next: number) => void;
  mode: CoinflipMode;
  onModeChange: (next: CoinflipMode) => void;

  minBet: number;
  maxBet: number;
  /** Disable mid-round so the user can't change parameters during a flip. */
  locked?: boolean;
}

export function CoinflipBetPanel({
  amount,
  onAmountChange,
  mode,
  onModeChange,
  minBet,
  maxBet,
  locked = false,
}: CoinflipBetPanelProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const halve = () =>
    onAmountChange(Math.max(minBet, +(amount / 2 || minBet).toFixed(2)));
  const dbl = () =>
    onAmountChange(Math.min(maxBet, +(amount * 2 || minBet).toFixed(2)));

  /** Recompute menu placement on open + on viewport changes. */
  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const place = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
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

  /** Close on outside click / Escape. */
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = triggerRef.current;
      if (!t) return;
      if (t.contains(e.target as Node)) return;
      // Anything else outside both the button and the menu — close.
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
    <div className="relative rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl">
      <div className="grid grid-cols-2 items-stretch">
        {/* Stake */}
        <div className="px-4 py-3 border-r border-white/10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
              Bet
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={halve}
                disabled={locked}
                className="px-2 py-0.5 rounded-pill border border-white/15 text-frost-white/70 hover:text-frost-white hover:border-white/25 disabled:opacity-40 transition-colors text-[10px] font-roobert tabular-nums"
              >
                ½
              </button>
              <button
                onClick={dbl}
                disabled={locked}
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
              disabled={locked}
              className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[20px] font-light tabular-nums focus:outline-none"
              step={1}
              min={minBet}
              max={maxBet}
            />
          </div>
        </div>

        {/* Mode */}
        <div className="px-4 py-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
            Mode
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
            <span className="font-roobert text-[12px] truncate">
              {MODE_LABEL[mode]}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={1.8}
              className={cn('transition-transform', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {/* Portal-rendered menu — escapes any backdrop-blur stacking context */}
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
                  {MODE_LABEL[k]}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
