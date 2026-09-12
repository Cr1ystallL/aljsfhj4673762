'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

export interface PersonalRecentBet {
  id: string;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp?: number;
  details?: string;
}

interface PersonalRecentBetsProps {
  bets: PersonalRecentBet[];
  currency?: string;
  title?: string;
  emptyText?: string;
}

export function PersonalRecentBets({
  bets,
  currency = 'zł',
  title = 'Недавние ставки',
  emptyText = 'Нет недавних ставок',
}: PersonalRecentBetsProps) {
  const { localeTag } = useT();

  return (
    <section className="rounded-[20px] border border-white/12 bg-white/[0.03] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl h-full flex flex-col min-h-[140px]">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/10">
        <History size={13} className="text-frost-white/65" strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert font-semibold">
          {title}
        </span>
      </div>

      {bets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center font-roobert text-[12px] text-whisper-gray">
          {emptyText}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3.5 py-3 flex-1 items-center">
          <AnimatePresence initial={false}>
            {bets.slice(0, 10).map((b) => {
              const won = b.payout > 0 && b.multiplier > 0;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="shrink-0 min-w-[125px] rounded-[14px] border border-white/10 px-3 py-2.5"
                  style={{
                    background: won
                      ? b.multiplier >= 5
                        ? 'linear-gradient(135deg, rgba(255,172,46,0.16), rgba(186,230,253,0.10))'
                        : 'rgba(255,255,255,0.04)'
                      : 'rgba(165,45,37,0.10)',
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-pill border text-[10px] font-roobert font-bold tabular-nums',
                        won
                          ? b.multiplier >= 5
                            ? 'border-[rgba(255,172,46,0.5)] bg-[rgba(255,172,46,0.14)] text-amber-300'
                            : 'border-white/15 bg-white/[0.06] text-frost-white/85'
                          : 'border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.16)] text-[#ff8a76]'
                      )}
                    >
                      {won ? `x${b.multiplier.toFixed(2)}` : 'Проигрыш'}
                    </div>
                    {b.details && (
                      <span className="text-[9px] text-whisper-gray truncate font-mono">
                        {b.details}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      'mt-1.5 font-roobert text-[14px] font-bold tabular-nums',
                      won ? 'text-frost-white' : 'text-[#ff8a76]'
                    )}
                  >
                    {won ? '+' : '−'}
                    {(won ? b.payout : b.betAmount).toLocaleString(localeTag, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                  <div className="mt-0.5 font-roobert text-[10px] text-whisper-gray tabular-nums">
                    Ставка:{' '}
                    {b.betAmount.toLocaleString(localeTag, {
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
