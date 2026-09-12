'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useT } from '@/i18n/use-t';

export interface LiveBetRow {
  id: string;
  name: string;
  photoUrl?: string | null;
  vipLevel?: number;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp?: number;
}

interface LiveBetsTableProps {
  entries: LiveBetRow[];
  currency?: string;
  playerCount?: number;
  totalWagered?: number;
}

export function LiveBetsTable({
  entries,
  currency = 'zł',
  playerCount,
  totalWagered,
}: LiveBetsTableProps) {
  const { localeTag } = useT();

  const count = playerCount !== undefined ? playerCount : new Set(entries.map((e) => e.name)).size;
  const sum =
    totalWagered !== undefined
      ? totalWagered
      : entries.reduce((acc, e) => acc + (e.betAmount || 0), 0);

  return (
    <div style={{ borderTop: '1px solid rgb(26, 26, 26)' }}>
      {/* Stats header */}
      <div
        className="flex items-center justify-between py-3"
        style={{ borderBottom: '1px solid rgb(15, 15, 15)' }}
      >
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {count} {count === 1 ? 'игрок' : count >= 2 && count <= 4 ? 'игрока' : 'игроков'}
        </span>
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {sum.toLocaleString(localeTag, { maximumFractionDigits: 0 })}{' '}
          {currency}
        </span>
      </div>

      {/* List */}
      <div className="max-h-[280px] overflow-y-auto scrollbar-hide">
        {entries.length === 0 ? (
          <div
            className="py-10 text-center font-sans text-[#636363]"
            style={{ fontSize: 12 }}
          >
            Ожидание ставок
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((b) => {
              const won = b.payout > 0 && b.multiplier > 0;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-3 py-3 px-2 rounded-md transition-colors border-b border-[#0a0a0a]"
                >
                  {/* Avatar with VIP badge */}
                  <UserAvatar
                    photoUrl={b.photoUrl}
                    name={b.name}
                    vipLevel={b.vipLevel ?? 0}
                    size="xs"
                  />

                  {/* Name + Bet Amount */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-sans text-[#ffffff] truncate"
                      style={{ fontSize: 13, fontWeight: 400 }}
                    >
                      {b.name}
                    </div>
                    <div
                      className="font-sans text-[#636363] flex items-center gap-1 tabular-nums"
                      style={{ fontSize: 10 }}
                    >
                      {b.betAmount.toLocaleString(localeTag, {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {currency}
                    </div>
                  </div>

                  {/* Multiplier Badge */}
                  <span
                    className={cn(
                      'font-sans tabular-nums text-xs px-2 py-0.5 rounded-full border',
                      won
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold'
                        : 'border-white/10 bg-white/[0.04] text-white/40'
                    )}
                  >
                    {won ? `×${b.multiplier.toFixed(2)}` : '0×'}
                  </span>

                  {/* Payout */}
                  <div
                    className={cn(
                      'w-20 text-right font-sans tabular-nums text-xs',
                      won ? 'text-white font-medium' : 'text-[#636363]'
                    )}
                  >
                    {won
                      ? `+${b.payout.toLocaleString(localeTag, {
                          maximumFractionDigits: 2,
                        })}`
                      : '0'}{' '}
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
