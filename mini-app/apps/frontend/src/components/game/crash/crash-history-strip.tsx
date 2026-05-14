'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Crash History Strip — Monopo Saigon Style
 *
 * Pill-shaped multiplier chips on a frosted-glass surface. Collapsed shows
 * the most recent 7 crashes; expanded reveals the last 20 in a flowing grid.
 * Color tiers come from the deep-ocean palette — restrained, never harsh.
 */

interface HistoryItem {
  crashPoint: number;
}

interface CrashHistoryStripProps {
  history: HistoryItem[];
}

function chipStyle(value: number): string {
  if (value >= 10) {
    return 'bg-[linear-gradient(90deg,rgba(160,224,171,0.35),rgba(255,172,46,0.35)_50%,rgba(165,45,37,0.35))] text-frost-white border-white/25';
  }
  if (value >= 5) {
    return 'bg-[linear-gradient(90deg,rgba(160,224,171,0.18),rgba(255,172,46,0.18))] text-frost-white border-white/20';
  }
  if (value >= 2) {
    return 'bg-white/[0.08] text-frost-white border-white/15';
  }
  return 'bg-white/[0.04] text-whisper-gray border-white/10';
}

export function CrashHistoryStrip({ history }: CrashHistoryStripProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history.slice(0, 20) : history.slice(0, 7);

  return (
    <div className="rounded-card bg-white/[0.04] border border-white/10 backdrop-blur-xl px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            'flex-1 min-w-0',
            expanded
              ? 'flex flex-wrap gap-1.5'
              : 'flex items-center gap-1.5 overflow-x-auto scrollbar-hide'
          )}
        >
          <AnimatePresence initial={false}>
            {visible.map((item, idx) => (
              <motion.div
                key={`${idx}-${item.crashPoint}`}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={cn(
                  'shrink-0 px-2.5 py-1 rounded-pill border text-[11px] font-roobert font-normal tracking-normal',
                  chipStyle(item.crashPoint)
                )}
              >
                x{item.crashPoint.toFixed(2)}
              </motion.div>
            ))}
          </AnimatePresence>
          {history.length === 0 && (
            <span className="text-whisper-gray text-[11px] font-roobert">
              История появится после первого раунда
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 w-7 h-7 rounded-pill border border-white/15 flex items-center justify-center text-frost-white/70 hover:text-frost-white hover:border-white/25 transition-colors"
          aria-label="Toggle history"
        >
          <ChevronDown
            size={14}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>
    </div>
  );
}
