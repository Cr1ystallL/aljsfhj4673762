'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CoinflipHistoryEntry } from '@/lib/games/coinflip/types';
import { UserAvatar } from '@/components/ui/user-avatar';

/**
 * Coinflip History — Monopo Saigon Style
 *
 * Live ticker of recent coinflip results. Two filter tabs:
 *   - All bets        — every recent flip
 *   - Rare wins       — only multiplier ≥ 5x
 *
 * Same visual language as the other game histories so we don't
 * fork another component.
 */

interface CoinflipHistoryProps {
  entries: CoinflipHistoryEntry[];
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

export function CoinflipHistory({ entries, currency = 'zł' }: CoinflipHistoryProps) {
  const [tab, setTab] = useState<'all' | 'rare'>('all');
  const visible =
    tab === 'rare' ? entries.filter((e) => e.multiplier >= 5) : entries;

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/10">
        {[
          { key: 'all', label: 'Все ставки' },
          { key: 'rare', label: 'Редкие выигрыши' },
        ].map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'all' | 'rare')}
              className={cn(
                'px-3 py-1.5 rounded-pill font-roobert text-[12px] transition-colors',
                active
                  ? 'bg-frost-white text-midnight-canvas'
                  : 'text-frost-white/70 hover:text-frost-white border border-white/15 bg-white/[0.04]'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[280px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        <AnimatePresence initial={false}>
          {visible.map((row) => (
            <motion.div
              key={row.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5"
            >
              <UserAvatar
                photoUrl={row.photoUrl}
                name={row.name}
                vipLevel={row.vipLevel ?? 0}
                size="xs"
              />

              <div className="min-w-0">
                <div className="font-roobert text-[13px] text-frost-white truncate">
                  {row.name}
                </div>
                <div className="font-roobert text-[11px] text-whisper-gray tabular-nums">
                  {row.betAmount.toLocaleString('ru-RU', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  {currency}
                </div>
              </div>

              {(() => {
                const effectiveMult = row.betAmount > 0
                  ? row.payout / row.betAmount
                  : row.multiplier;
                const tint =
                  effectiveMult >= 10
                    ? 'border-[rgba(165,45,37,0.45)] text-frost-white bg-[rgba(165,45,37,0.18)]'
                    : effectiveMult >= 2
                    ? 'border-[rgba(255,172,46,0.4)] text-frost-white bg-[rgba(255,172,46,0.14)]'
                    : effectiveMult >= 1
                    ? 'border-white/15 text-frost-white/85 bg-white/[0.05]'
                    : 'border-[rgba(165,45,37,0.35)] text-[#ff8a76]/85 bg-[rgba(165,45,37,0.10)]';
                return (
                  <span
                    className={cn(
                      'font-roobert text-[11px] tabular-nums px-2 py-0.5 rounded-pill border',
                      tint
                    )}
                  >
                    x{effectiveMult.toFixed(2)}
                  </span>
                );
              })()}

              <span
                className={cn(
                  'text-right w-16 font-roobert text-[12px] tabular-nums',
                  row.payout >= row.betAmount
                    ? 'text-frost-white'
                    : 'text-[#ff8a76]/85'
                )}
              >
                {row.payout >= row.betAmount ? '+' : ''}
                {row.payout.toLocaleString('ru-RU', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}{' '}
                {currency}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>

        {visible.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            {tab === 'rare'
              ? 'Редких выигрышей пока нет. Будьте первым.'
              : 'Ставки будут появляться здесь.'}
          </div>
        )}
      </div>
    </section>
  );
}
