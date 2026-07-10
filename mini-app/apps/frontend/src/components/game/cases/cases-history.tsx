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
    <div className="w-full overflow-hidden flex gap-2 overflow-x-auto pb-4 custom-scrollbar">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="flex-shrink-0 flex items-center gap-3 w-48 rounded-lg border border-white/5 p-2 bg-white/[0.03] backdrop-blur-md"
          style={{ borderLeft: `4px solid ${entry.prizeColor}` }}
        >
          {/* Case Photo */}
          <div className="w-10 h-10 relative flex-shrink-0">
             <Image
                src={entry.caseId === 'case_1' ? '/images/cases/poor_case.png' : `/images/cases/${entry.caseId}.png`}
                alt={entry.caseName}
                fill
                className="object-contain"
                unoptimized
             />
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            {/* User details */}
            <div className="flex items-center gap-1.5 justify-center mb-1">
              <div className="w-4 h-4 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                {entry.photoUrl ? (
                  <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">?</div>
                )}
              </div>
              <span className="text-[11px] font-medium text-white/80 truncate">
                {entry.name}
              </span>
            </div>
            
            {/* Won Amount */}
            <div className="text-center font-roobert font-semibold text-[13px]" style={{ color: entry.prizeColor }}>
              {entry.payout.toLocaleString('ru-RU')} zł
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
