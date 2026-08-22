'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';
import { KENO_DRAW_COUNT } from './keno-multipliers';

interface KenoDrawTrayProps {
  drawn: number[];
  picks: number[];
  drawCount?: number;
  lastDrawn?: number | null;
}

export function KenoDrawTray({
  drawn,
  picks,
  drawCount = KENO_DRAW_COUNT,
  lastDrawn = null,
}: KenoDrawTrayProps) {
  const { t } = useT();
  const reduceMotion = useReducedMotion();
  const slots = Array.from({ length: drawCount }, (_, i) => drawn[i] ?? null);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
        {t('keno.draw')}
      </span>
      <div className="flex items-center justify-center gap-1.5">
        {slots.map((n, i) => {
          const hit = n != null && picks.includes(n);
          const fresh = n != null && n === lastDrawn;
          return (
            <motion.div
              key={i}
              animate={
                reduceMotion || !fresh
                  ? { scale: 1 }
                  : { scale: [1.12, 1] }
              }
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'w-9 h-9 rounded-full border flex items-center justify-center font-roobert tabular-nums text-[13px]',
                n == null
                  ? 'border-white/10 bg-white/[0.03] text-transparent'
                  : hit
                    ? 'border-[rgba(160,224,171,0.45)] bg-[rgba(160,224,171,0.12)] text-[#E8F8EC]'
                    : 'border-white/16 bg-white/[0.06] text-frost-white'
              )}
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
            >
              {n}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
