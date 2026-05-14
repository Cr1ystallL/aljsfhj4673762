'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Crash History Strip - Monopo Saigon Style
 *
 * Pill-shaped multiplier chips floating on a frosted glass surface.
 * Restrained palette: tones of deep ocean gradient for high crashes,
 * whisper gray for typical, frost white text everywhere.
 */

interface HistoryItem {
  crashPoint: number;
}

interface CrashHistoryStripProps {
  history: HistoryItem[];
}

function chipStyle(value: number): string {
  if (value >= 10) {
    // Highest accent — deep ocean gradient
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
  const visible = expanded ? history.slice(0, 32) : history.slice(0, 7);

  return (
    <div className="rounded-card bg-white/[0.04] border border-white/10 backdrop-blur-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
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
            <span className="text-whisper-gray text-[11px] font-roobert">No history yet</span>
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
