'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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

const TINTS = [
  'bg-[#a05cd6]',
  'bg-[#f0a060]',
  'bg-[#5cb6d6]',
  'bg-[#d65c80]',
  'bg-[#7ed09a]',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

export function KenoLiveBets({ entries, currency = 'TON' }: KenoLiveBetsProps) {
  return (
    <section className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden mt-2">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-white/5">
        <span className="text-xs uppercase tracking-wider text-white/50 font-bold">
          Live Ставки
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-white/5">
        <AnimatePresence initial={false}>
          {entries.map((row) => {
            const won = row.payout > 0 && row.multiplier > 0;
            return (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2"
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
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                      tintFor(row.id)
                    )}
                  >
                    {row.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-xs text-white/90 truncate font-medium">
                    {row.name}
                  </div>
                  <div className="text-[10px] text-white/40 tabular-nums">
                    {row.betAmount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </div>
                </div>

                <span
                  className={cn(
                    'text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md border',
                    won
                      ? row.multiplier >= 10
                        ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
                        : 'border-white/20 text-white/90 bg-white/10'
                      : 'border-destructive/30 text-destructive/80 bg-destructive/10'
                  )}
                >
                  {won ? `x${row.multiplier.toFixed(2)}` : '0x'}
                </span>

                <span
                  className={cn(
                    'text-right w-14 font-mono text-[11px] tabular-nums',
                    won ? 'text-emerald-400' : 'text-white/30'
                  )}
                >
                  {won ? '+' : ''}
                  {(won ? row.payout : 0).toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] text-white/30">
            Ожидание ставок...
          </div>
        )}
      </div>
    </section>
  );
}
