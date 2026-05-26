'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mines "Last bets" Strip — Monopo Saigon Style
 *
 * Horizontal scroller of the current player's most recent completed
 * mines bets. Each card carries the multiplier pill, payout and stake.
 * Sits directly under the bet panel so the player gets instant context
 * on how their last few rounds went.
 */

export interface MinesRecentBet {
  id: string;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface MinesRecentBetsProps {
  bets: MinesRecentBet[];
  currency?: string;
}

export function MinesRecentBets({ bets, currency = 'zł' }: MinesRecentBetsProps) {
  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <History size={12} className="text-frost-white/65" strokeWidth={1.6} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          Недавние ставки
        </span>
      </div>

      {bets.length === 0 ? (
        <div className="px-3 py-3 text-center font-roobert text-[12px] text-whisper-gray">
          Ваши последние раунды появятся здесь.
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 py-3">
          <AnimatePresence initial={false}>
            {bets.map((b) => {
              const won = b.payout > 0 && b.multiplier > 0;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="shrink-0 min-w-[120px] rounded-card border border-white/10 px-3 py-2"
                  style={{
                    background: won
                      ? b.multiplier >= 5
                        ? 'linear-gradient(135deg, rgba(255,172,46,0.16), rgba(160,224,171,0.10))'
                        : 'rgba(255,255,255,0.04)'
                      : 'rgba(165,45,37,0.10)',
                  }}
                >
                  <div
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-pill border text-[10px] font-roobert tabular-nums',
                      won
                        ? b.multiplier >= 5
                          ? 'border-[rgba(255,172,46,0.5)] bg-[rgba(255,172,46,0.14)] text-frost-white'
                          : 'border-white/15 bg-white/[0.06] text-frost-white/85'
                        : 'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.16)] text-[#ff8a76]'
                    )}
                  >
                    {won ? `x${b.multiplier.toFixed(2)}` : 'Бомба'}
                  </div>
                  <div
                    className={cn(
                      'mt-1 font-roobert text-[14px] tabular-nums',
                      won ? 'text-frost-white' : 'text-[#ff8a76]'
                    )}
                  >
                    {won ? '+' : '−'}
                    {(won
                      ? b.payout
                      : b.betAmount
                    ).toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                  <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                    ставка{' '}
                    {b.betAmount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
