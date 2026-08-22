'use client';

import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';

interface KenoPayoutStripProps {
  table: number[];
  hits: number;
  drawComplete: boolean;
}

export function KenoPayoutStrip({ table, hits, drawComplete }: KenoPayoutStripProps) {
  const { t } = useT();

  return (
    <div className="w-full flex flex-wrap justify-center gap-1.5">
      {table.map((mult, idx) => {
        const live = hits === idx && (drawComplete || hits > 0);
        return (
          <div
            key={idx}
            className={cn(
              'min-w-[3.4rem] px-2 py-1.5 rounded-[12px] border flex flex-col items-center',
              live
                ? 'border-[#F4E8C8]/35 bg-[#F4E8C8]/10 text-[#F4E8C8]'
                : 'border-white/10 bg-white/[0.03] text-white/50',
              mult === 0 && !live && 'opacity-40'
            )}
          >
            <span className="text-[9px] uppercase tracking-[0.14em] font-roobert opacity-70">
              {t('keno.hits', { n: idx })}
            </span>
            <span className="mt-0.5 font-roobert tabular-nums text-[13px] font-light">
              ×{mult}
            </span>
          </div>
        );
      })}
    </div>
  );
}
