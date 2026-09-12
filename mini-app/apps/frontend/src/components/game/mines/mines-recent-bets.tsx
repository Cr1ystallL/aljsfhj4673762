'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

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
  const { t, localeTag } = useT();

  const totalWon = bets.reduce((acc, b) => acc + (b.payout > 0 ? b.payout : 0), 0);

  return (
    <div style={{ borderTop: '1px solid rgb(26, 26, 26)' }}>
      {/* Stats header bar */}
      <div
        className="flex items-center justify-between py-3"
        style={{ borderBottom: '1px solid rgb(15, 15, 15)' }}
      >
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 11 }}
        >
          {t('mines.recent')} ({bets.length})
        </span>
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 11 }}
        >
          {totalWon > 0
            ? `Выигрыш: ${totalWon.toLocaleString(localeTag, { maximumFractionDigits: 2 })} ${currency}`
            : `${currency}`}
        </span>
      </div>

      {/* Vertical list styled like LiveBetsTable but slightly larger */}
      <div className="max-h-[300px] overflow-y-auto scrollbar-hide flex flex-col">
        {bets.length === 0 ? (
          <div
            className="py-10 text-center font-sans text-[#636363]"
            style={{ fontSize: 13 }}
          >
            {t('mines.recentEmpty')}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {bets.map((b) => {
              const won = b.payout > 0 && b.multiplier > 0;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center justify-between py-3 px-2 border-b border-[#0a0a0a] transition-colors hover:bg-white/[0.02]"
                >
                  {/* Left: Stake info */}
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-sans text-white font-medium truncate"
                      style={{ fontSize: 14 }}
                    >
                      {t('mines.stake')}{' '}
                      {b.betAmount.toLocaleString(localeTag, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {currency}
                    </div>
                    <div
                      className="font-sans text-[#636363] tabular-nums"
                      style={{ fontSize: 11 }}
                    >
                      {new Date(b.timestamp).toLocaleTimeString(localeTag, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                  </div>

                  {/* Center: Multiplier pill */}
                  <span
                    className={cn(
                      'mx-3 font-sans tabular-nums rounded-full border px-3 py-1 font-bold shrink-0',
                      won
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                        : 'border-red-500/35 bg-red-500/15 text-red-400'
                    )}
                    style={{ fontSize: 13 }}
                  >
                    {won ? `×${b.multiplier.toFixed(2)}` : t('mines.bust')}
                  </span>

                  {/* Right: Net Payout */}
                  <div
                    className={cn(
                      'w-28 text-right font-sans tabular-nums font-semibold shrink-0',
                      won ? 'text-emerald-400' : 'text-[#636363]'
                    )}
                    style={{ fontSize: 14 }}
                  >
                    {won
                      ? `+${b.payout.toLocaleString(localeTag, {
                          maximumFractionDigits: 2,
                        })}`
                      : `−${b.betAmount.toLocaleString(localeTag, {
                          maximumFractionDigits: 2,
                        })}`}{' '}
                    {currency}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
