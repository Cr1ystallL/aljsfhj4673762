'use client';

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionProps {
  question: string;
  children: ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}

export function Accordion({ question, children, defaultOpen = false, accent = 'text-amber-300' }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div
      className={cn(
        'rounded-2xl border transition-colors',
        open ? 'border-white/15 bg-white/[0.045]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.035]'
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="font-roobert text-[14px] sm:text-[14.5px] font-semibold text-white/90 leading-snug">
          {question}
        </span>
        <span
          className={cn(
            'mt-0.5 shrink-0 w-6 h-6 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center transition-transform duration-300',
            open && `rotate-180 ${accent}`
          )}
        >
          <ChevronDown size={14} strokeWidth={2.4} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-[13.5px] leading-relaxed text-white/65">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
