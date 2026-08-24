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
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        {slots.map((n, i) => {
          const hit = n != null && picks.includes(n);
          const fresh = n != null && n === lastDrawn;
          return (
            <motion.div
              key={`${i}-${n}`}
              initial={n != null ? { scale: 0.5, y: -10, opacity: 0 } : false}
              animate={
                reduceMotion || !fresh
                  ? { scale: 1, y: 0, opacity: 1 }
                  : { scale: [1.25, 1], y: 0, opacity: 1 }
              }
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center font-roobert tabular-nums text-xs sm:text-[13px] font-bold select-none transition-colors duration-300',
                n == null
                  ? 'border-white/10 bg-white/[0.03] text-transparent'
                  : hit
                    ? 'border-emerald-400/80 bg-gradient-to-b from-emerald-500/30 to-emerald-800/50 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.6)]'
                    : 'border-amber-400/50 bg-gradient-to-b from-white/10 to-black/60 text-frost-white shadow-[0_0_8px_rgba(245,158,11,0.3)]'
              )}
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}
            >
              {n}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
