'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useT } from '@/i18n/use-t';

interface CaseHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  payout: number;
  timestamp: number;
  caseId: string;
  caseName?: string;
  casePrice?: number;
  /** Prize identifier such as `2.5x`. */
  prizeId?: string;
  prizeColor: string;
}

/** `2.5x` -> `×2.5`. Falls back to the raw id for anything unexpected. */
function formatMultiplier(prizeId: string | undefined): string | null {
  if (!prizeId) return null;
  const value = parseFloat(prizeId);
  return Number.isFinite(value) ? `×${value}` : prizeId;
}

export function CasesHistory() {
  const { t } = useT();
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/games/cases/history?limit=20', { credentials: 'include' });
        if (!alive || !res.ok) return;
        const data = await res.json();
        setHistory(data.history || []);
      } catch (err) {
        // ignore
      }
    };

    void fetchHistory();
    const interval = setInterval(fetchHistory, 3500); // 3.5s polling as per user's approval
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (history.length === 0) {
    return (
      <div className="w-full h-16 flex items-center justify-center text-white/40 text-sm">
        {t('profile.loadingHistory')}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden flex gap-3 overflow-x-auto pb-4 scrollbar-hide [&::-webkit-scrollbar]:hidden">
      {history.map((entry) => {
        const multiplier = formatMultiplier(entry.prizeId);

        return (
          <div
            key={entry.id}
            className="flex-shrink-0 flex flex-col items-center justify-between w-36 min-w-[144px] h-[152px] rounded-xl border p-2 bg-white/[0.02] backdrop-blur-md relative overflow-hidden"
            style={{ borderColor: entry.prizeColor }}
          >
            {/* Who opened it */}
            <div className="w-full flex items-center gap-1.5 px-1 min-w-0">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 flex-shrink-0 border border-white/10">
                {entry.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">?</div>
                )}
              </div>
              <span className="text-[10px] font-medium text-white/70 truncate">
                {entry.name}
              </span>
            </div>

            {/* Which case — the artwork alone doesn't tell them apart at 56px */}
            <div className="relative w-12 h-12 my-0.5">
              <Image
                src={`/images/cases/${entry.caseId}.png`}
                alt={entry.caseName ?? entry.caseId}
                fill
                className="object-contain"
                unoptimized
              />
            </div>

            <div className="w-full text-center font-roobert text-[11px] font-semibold text-frost-white truncate px-1">
              {entry.caseName ?? entry.caseId}
            </div>
            {entry.casePrice !== undefined && (
              <div className="w-full text-center font-roobert text-[9px] text-white/40 tabular-nums">
                кейс за {entry.casePrice.toLocaleString('ru-RU')} zł
              </div>
            )}

            {/* Outcome as a multiplier: "×2.5" reads far better than "0,1 zł" */}
            <div
              className="mt-1 w-full text-center font-roobert font-bold text-[13px] rounded bg-black/25 py-1 tabular-nums"
              style={{ color: entry.prizeColor, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              {multiplier ?? `${entry.payout.toLocaleString('ru-RU')} zł`}
              {multiplier && (
                <span className="ml-1 text-[9px] font-medium text-white/45">
                  {entry.payout.toLocaleString('ru-RU')} zł
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
