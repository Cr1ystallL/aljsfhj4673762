'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * HelpButton — Monopo Saigon Style
 *
 * Tiny `?` pill rendered next to admin labels. Clicking it opens a modal
 * with a plain-language explanation of what the adjacent control does
 * and why it matters. Used everywhere in `/system/console/*` to keep
 * the UI self-documenting.
 *
 * `title` is the modal header and `children` is the body — accept any
 * markup so we can include lists, code, formulas, etc. without a
 * dedicated CMS.
 */
interface HelpButtonProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Override the default 14px size for tighter rows. */
  size?: number;
}

export function HelpButton({
  title,
  children,
  className,
  size = 14,
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Что это: ${title}`}
        className={cn(
          'inline-flex items-center justify-center rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/65 hover:text-frost-white hover:border-white/25 transition-colors',
          className
        )}
        style={{ width: size + 12, height: size + 12 }}
      >
        <HelpCircle size={size} strokeWidth={1.7} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-3 sm:px-6 pb-3 sm:pb-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative w-full max-w-[460px] rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5"
              style={{ background: 'rgba(10, 10, 10, 0.96)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-roobert text-frost-white text-[18px] leading-tight">
                  {title}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors shrink-0"
                >
                  <X size={18} strokeWidth={1.8} />
                </button>
              </div>
              <div className="font-roobert text-[14px] text-frost-white/85 leading-relaxed space-y-2">
                {children}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
