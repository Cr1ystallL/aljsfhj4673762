'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * Crash Player Feed — Monopo Saigon Style
 *
 * Live list of player bets/winnings. Frosted rows, frost white text,
 * no strong shadows. Scrollable with hidden scrollbar to keep the
 * surface clean.
 */

export interface CrashPlayerEntry {
  id: string;
  name: string;
  avatarColor?: string; // tailwind bg color class
  amount: number;
  multiplier?: number;
  status: 'active' | 'cashed' | 'lost';
  currency?: string;
}

interface CrashPlayerFeedProps {
  entries: CrashPlayerEntry[];
}

export function CrashPlayerFeed({ entries }: CrashPlayerFeedProps) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      {/* Column headings */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 border-b border-white/10">
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
          Игрок
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert text-right w-16">
          Коэфф.
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert text-right w-20">
          Выигрыш
        </span>
      </div>

      {/* Rows */}
      <div className="max-h-[260px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        <AnimatePresence initial={false}>
          {entries.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-pill flex items-center justify-center text-[11px] font-roobert text-frost-white shrink-0 ${
                    p.avatarColor ?? 'bg-white/10'
                  }`}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-roobert text-[13px] text-frost-white truncate">
                    {p.name}
                  </div>
                  <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                    {p.amount.toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {p.currency ?? '₽'}
                  </div>
                </div>
              </div>

              <div className="text-right w-16 font-roobert text-[12px] tabular-nums">
                {p.status === 'cashed' && p.multiplier ? (
                  <span className="text-frost-white">x{p.multiplier.toFixed(2)}</span>
                ) : p.status === 'lost' ? (
                  <span className="text-whisper-gray">—</span>
                ) : (
                  <span className="text-whisper-gray">…</span>
                )}
              </div>

              <div className="text-right w-20 font-roobert text-[12px] tabular-nums">
                {p.status === 'cashed' && p.multiplier ? (
                  <span className="text-frost-white">
                    +{(p.amount * p.multiplier).toLocaleString('ru-RU', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : p.status === 'lost' ? (
                  <span className="text-[#ff8a76]/80">−{p.amount.toLocaleString('ru-RU')}</span>
                ) : (
                  <span className="text-whisper-gray">…</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Игроки появятся здесь, как только сделают ставки
          </div>
        )}
      </div>
    </div>
  );
}
