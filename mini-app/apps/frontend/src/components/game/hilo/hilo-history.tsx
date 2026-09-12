'use client';

import { LiveBetsTable, type LiveBetRow } from '@/components/game/kit';

export interface HiloHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  multiplier: number;
  payout: number;
  timestamp: number;
}

interface HiloHistoryProps {
  entries: HiloHistoryEntry[];
  currency?: string;
}

export function HiloHistory({ entries, currency = 'zł' }: HiloHistoryProps) {
  const formattedRows: LiveBetRow[] = entries.map((e) => ({
    id: e.id,
    name: e.name,
    photoUrl: e.photoUrl,
    betAmount: e.betAmount,
    multiplier: e.multiplier,
    payout: e.payout,
    timestamp: e.timestamp,
  }));

  return <LiveBetsTable entries={formattedRows} currency={currency} />;
}
