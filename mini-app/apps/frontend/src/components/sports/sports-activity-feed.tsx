'use client';

import { useEffect, useState } from 'react';
import { sportsService } from '@/services/sports.service';
import { useT } from '@/i18n/use-t';

export function SportsActivityFeed() {
  const { t } = useT();
  const [items, setItems] = useState<Array<{ id: string; text: string; at: number }>>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await sportsService.fetchFeed();
        if (alive) setItems(next.slice(0, 6));
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 10000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101217] px-3 py-2.5">
      <div className="font-roobert text-[10px] uppercase tracking-[0.16em] text-whisper-gray mb-1.5">
        {t('sports.activity')}
      </div>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="font-roobert text-[12px] text-frost-white/85 truncate">
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
