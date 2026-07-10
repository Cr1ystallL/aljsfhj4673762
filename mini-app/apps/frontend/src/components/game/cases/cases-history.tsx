'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface CaseHistoryEntry {
  id: string;
  name: string;
  photoUrl: string | null;
  betAmount: number;
  payout: number;
  timestamp: number;
  caseId: string;
  caseName: string;
  prizeColor: string;
}

export function CasesHistory() {
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
        Загрузка истории...
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex-shrink-0 flex flex-col items-center justify-between w-28 min-w-[112px] h-32 rounded-xl border p-2 bg-white/[0.02] backdrop-blur-md relative overflow-hidden"
          style={{ borderColor: entry.prizeColor }}
        >
          {/* Top: User info + Payout */}
          <div className="w-full flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 flex-shrink-0 border border-white/10">
                {entry.photoUrl ? (
                  <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold">?</div>
                )}
              </div>
              <span className="text-[10px] font-medium text-white/80 truncate max-w-[40px]">
                {entry.name}
              </span>
            </div>
          </div>
          
          {/* Middle: Case Photo */}
          <div className="w-14 h-14 relative my-1">
             <Image
                src={`/images/cases/${entry.caseId}.png`}
                alt={entry.caseName}
                fill
                className="object-contain"
                unoptimized
             />
          </div>

          {/* Bottom: Won Amount */}
          <div className="w-full text-center font-roobert font-bold text-[13px] rounded bg-black/20 py-1" style={{ color: entry.prizeColor, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            {entry.payout.toLocaleString('ru-RU')} zł
          </div>
        </div>
      ))}
    </div>
  );
}
