'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';
import { BetPanelShell } from '@/components/game/kit';

export interface KenoLiveBetEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface KenoLiveBetsProps {
  entries: KenoLiveBetEntry[];
  currency?: string;
}

export function KenoLiveBets({ entries, currency = 'zł' }: KenoLiveBetsProps) {
  const { t, localeTag } = useT();

  return (
    <BetPanelShell>
      <div className="flex items-center px-3 py-2.5 border-b border-white/10">
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          {t('keno.live')}
        </span>
      </div>

      <div className="max-h-[280px] overflow-y-auto scrollbar-hide">
        <AnimatePresence initial={false}>
          {entries.map((row) => {
            const won = row.payout > 0 && row.multiplier > 0;
            return (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2.5 border-t border-white/5 first:border-t-0"
              >
                {row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photoUrl}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/12 flex items-center justify-center text-[10px] font-roobert text-frost-white/70 shrink-0">
                    {row.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-xs text-frost-white truncate font-roobert">
                    {row.name}
                  </div>
                  <div className="text-[10px] text-white/40 tabular-nums">
                    {row.betAmount.toLocaleString(localeTag, {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                </div>

                <span
                  className={cn(
                    'text-[10px] font-roobert tabular-nums px-1.5 py-0.5 rounded-pill border',
                    won
                      ? 'border-white/16 text-frost-white/90'
                      : 'border-white/8 text-white/35'
                  )}
                >
                  {won ? `×${row.multiplier.toFixed(2)}` : '—'}
                </span>

                <span
                  className={cn(
                    'text-right w-14 font-roobert text-[11px] tabular-nums',
                    won ? 'text-frost-white' : 'text-white/30'
                  )}
                >
                  {won ? '+' : ''}
                  {(won ? row.payout : 0).toLocaleString(localeTag, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-whisper-gray font-roobert">
            {t('keno.waitingBets')}
          </div>
        )}
      </div>
    </BetPanelShell>
  );
}
