'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Plinko "My Wins" Strip — Monopo Saigon Style
 *
 * Horizontal scroller of the current player's drops with multiplier ≥ 5x.
 * Sits between the bet panel and the live feed and is the user's
 * personal highlight reel. Empty state nudges them toward going for a
 * big win.
 *
 * Each card: multiplier pill, payout, stake. Frosted card with a soft
 * deep-ocean wash on the leading side.
 */

export interface PlinkoMyWin {
  id: string;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface PlinkoMyWinsProps {
  wins: PlinkoMyWin[];
  currency?: string;
}

export function PlinkoMyWins({ wins, currency = '₽' }: PlinkoMyWinsProps) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Sparkles size={12} className="text-frost-white/65" strokeWidth={1.6} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          Мои выигрыши · от x5
        </span>
      </div>

      {wins.length === 0 ? (
        <div className="px-3 py-3 text-center font-roobert text-[12px] text-whisper-gray">
          Поймайте x5 и больше — сюда попадут ваши лучшие дропы.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 py-3">
          <AnimatePresence initial={false}>
            {wins.map((w) => (
              <motion.div
                key={w.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="shrink-0 min-w-[120px] rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-md px-3 py-2"
                style={{
                  background:
                    w.multiplier >= 100
                      ? 'linear-gradient(135deg, rgba(255,172,46,0.18), rgba(165,45,37,0.22))'
                      : w.multiplier >= 10
                      ? 'linear-gradient(135deg, rgba(255,172,46,0.14), rgba(255,172,46,0.04))'
                      : 'rgba(255,255,255,0.04)',
                }}
              >
                <div
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-pill border text-[10px] font-roobert tabular-nums',
                    w.multiplier >= 100
                      ? 'border-[rgba(165,45,37,0.6)] bg-[rgba(165,45,37,0.18)] text-frost-white'
                      : w.multiplier >= 10
                      ? 'border-[rgba(255,172,46,0.5)] bg-[rgba(255,172,46,0.14)] text-frost-white'
                      : 'border-white/15 bg-white/[0.06] text-frost-white/85'
                  )}
                >
                  x{w.multiplier.toFixed(2)}
                </div>
                <div className="mt-1 font-roobert text-[14px] tabular-nums text-frost-white">
                  +
                  {w.payout.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  {currency}
                </div>
                <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                  ставка{' '}
                  {w.betAmount.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  {currency}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
