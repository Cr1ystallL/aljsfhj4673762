'use client';

import { LiveBetsTable, type LiveBetRow } from '@/components/game/kit';
import type { CoinflipHistoryEntry } from '@/lib/games/coinflip/types';

interface CoinflipHistoryProps {
  entries: CoinflipHistoryEntry[];
  currency?: string;
}

export function CoinflipHistory({ entries, currency = 'zł' }: CoinflipHistoryProps) {
  const formattedRows: LiveBetRow[] = entries.map((e) => ({
    id: e.id,
    name: e.name,
    photoUrl: e.photoUrl,
    vipLevel: e.vipLevel,
    betAmount: e.betAmount,
    multiplier: e.multiplier,
    payout: e.payout,
    timestamp: e.timestamp,
  }));

  return <LiveBetsTable entries={formattedRows} currency={currency} />;
}
