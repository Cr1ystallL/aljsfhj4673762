'use client';

import { LiveBetsTable, type LiveBetRow } from '@/components/game/kit';

export interface MinesHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  vipLevel?: number;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface MinesHistoryProps {
  entries: MinesHistoryEntry[];
  currency?: string;
}

export function MinesHistory({ entries, currency = 'zł' }: MinesHistoryProps) {
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
