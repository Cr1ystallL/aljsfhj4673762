'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useT } from '@/i18n/use-t';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaseHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  multiplier?: number;
  payout: number;
  timestamp: number;
  caseId: string;
  caseName?: string;
  casePrice?: number;
  /** Prize identifier such as `2.5x` or `10x`. */
  prizeId?: string;
  prizeColor: string;
}

function getMultiplierNumber(entry: CaseHistoryEntry): number {
  if (entry.prizeId) {
    const v = parseFloat(entry.prizeId);
    if (Number.isFinite(v)) return v;
  }
  if (entry.multiplier != null && Number.isFinite(entry.multiplier)) {
    return entry.multiplier;
  }
  if (entry.casePrice && entry.casePrice > 0 && entry.payout) {
    return +(entry.payout / entry.casePrice).toFixed(2);
  }
  return 0;
}

export function CasesHistory() {
  const { t } = useT();
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/games/cases/history?limit=30', { credentials: 'include' });
        if (!alive || !res.ok) return;
        const data = await res.json();
        setHistory(data.history || []);
      } catch (err) {
        // ignore
      }
    };

    void fetchHistory();
    const interval = setInterval(fetchHistory, 3500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (history.length === 0) {
    return (
      <div className="w-full h-16 flex items-center justify-center text-white/40 text-sm font-roobert">
        {t('profile.loadingHistory')}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden flex gap-2.5 overflow-x-auto pb-3 scrollbar-hide [&::-webkit-scrollbar]:hidden">
      {history.map((entry) => {
        const mult = getMultiplierNumber(entry);
        const isMegaWin = mult >= 10.0;

        return (
          <div
            key={entry.id}
            className={cn(
              'flex-shrink-0 flex flex-col items-center justify-between w-32 min-w-[128px] h-[132px] rounded-2xl border p-2 relative overflow-hidden transition-all select-none',
              isMegaWin
                ? 'border-amber-400/80 bg-gradient-to-b from-amber-950/40 via-[#120f08] to-black shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                : 'border-white/10 bg-white/[0.03] backdrop-blur-md hover:border-white/20'
            )}
          >
            {/* Top highlight glow for mega wins */}
            {isMegaWin && (
              <div
                aria-hidden
                className="absolute -top-6 inset-x-0 h-12 bg-amber-400/30 blur-lg pointer-events-none"
              />
            )}

            {/* 1. Who opened it */}
            <div className="w-full flex items-center gap-1.5 px-0.5 min-w-0 z-10">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 flex-shrink-0 border border-white/15 shadow-sm">
                {entry.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white/70">
                    {entry.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[10.5px] font-medium text-frost-white/90 truncate leading-none">
                {entry.name}
              </span>
            </div>

            {/* 2. Which case was opened */}
            <div className="relative w-12 h-12 my-auto flex items-center justify-center">
              <Image
                src={`/images/cases/${entry.caseId}.png`}
                alt={entry.caseName ?? entry.caseId}
                fill
                className="object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                unoptimized
              />
            </div>

            {/* 3. Bottom title & Price (or Mega Win badge if >= 10x) */}
            <div className="w-full flex flex-col items-center gap-0.5 z-10">
              <div className="w-full text-center font-roobert text-[11px] font-semibold text-frost-white truncate px-1 leading-tight">
                {entry.caseName ?? 'Кейс'}
              </div>

              {isMegaWin ? (
                <div className="w-full mt-0.5 flex items-center justify-center gap-1 py-0.5 px-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 text-black font-roobert font-extrabold text-[10px] shadow-sm tracking-tight">
                  <Sparkles size={10} className="stroke-[2.5]" />
                  <span>×{mult >= 10 ? mult.toFixed(0) : mult.toFixed(1)} WIN</span>
                </div>
              ) : (
                <div className="w-full text-center font-roobert text-[9.5px] text-whisper-gray/70 tabular-nums truncate">
                  {entry.casePrice !== undefined ? `${entry.casePrice} zł` : 'Бесплатный'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
