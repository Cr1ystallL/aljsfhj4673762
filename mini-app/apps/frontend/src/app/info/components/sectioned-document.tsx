'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DocSection {
  id: string;
  n: string;
  title: string;
  content: ReactNode;
}

interface SectionedDocumentProps {
  sections: DocSection[];
  /** Tailwind text colour for numbers. */
  accent: string;
  /** Tailwind classes for the active rail pill. */
  activeChip: string;
  /** Open this section id from the outside (e.g. after a search hit). */
  openId?: string | null;
  /** All sections forced open (search mode). */
  expandAll?: boolean;
}

/**
 * Numbered rail + one-open-at-a-time sections.
 *
 * Desktop: the rail is a sticky column of numbers to the left; mouse users
 * never have to scroll a horizontal strip. Phone: the same numbers wrap
 * into a row above the content. Clicking a number opens that section and
 * scrolls it under the sticky header.
 */
export function SectionedDocument({
  sections,
  accent,
  activeChip,
  openId,
  expandAll = false,
}: SectionedDocumentProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (openId) setActive(openId);
  }, [openId]);

  const scrollTo = useCallback((id: string) => {
    const el = refs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 124;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  const select = (id: string) => {
    setActive(id);
    // Let the collapse/expand start before measuring the target position.
    window.setTimeout(() => scrollTo(id), 40);
  };

  const toggle = (id: string) => {
    if (expandAll) return;
    setActive((cur) => (cur === id ? '' : id));
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-start">
      {/* Number rail — side column from 640px, wrap-row on phones. */}
      <nav
        aria-label="Разделы"
        className="sm:sticky sm:top-[118px] sm:w-12 shrink-0 flex flex-row sm:flex-col flex-wrap sm:flex-nowrap justify-center sm:justify-start gap-1.5 p-1.5 rounded-2xl border border-white/10 bg-[#0d0f13]"
      >
        {sections.map((s) => {
          const on = !expandAll && s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              aria-current={on ? 'true' : undefined}
              aria-label={`${s.n}. ${s.title}`}
              title={s.title}
              className={cn(
                'h-10 w-10 sm:w-full rounded-xl font-roobert text-[14px] font-bold tabular-nums transition-colors border',
                on
                  ? activeChip
                  : 'border-transparent text-white/45 hover:text-white hover:bg-white/[0.06]'
              )}
            >
              {s.n}
            </button>
          );
        })}
      </nav>

      {/* Sections */}
      <div className="flex flex-col gap-2.5 min-w-0">
        {sections.map((s) => {
          const open = expandAll || s.id === active;
          return (
            <section
              key={s.id}
              id={`sec-${s.id}`}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              className={cn(
                'rounded-[20px] border overflow-hidden transition-colors',
                open ? 'border-white/15 bg-white/[0.035]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.035]'
              )}
            >
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left"
              >
                <span
                  className={cn(
                    'font-roobert text-[20px] font-black tabular-nums leading-none w-8 shrink-0',
                    open ? accent : 'text-white/30'
                  )}
                >
                  {s.n}
                </span>
                <h3
                  className={cn(
                    'flex-1 font-roobert text-[15px] sm:text-[16px] font-bold tracking-[-0.01em]',
                    open ? 'text-white' : 'text-white/75'
                  )}
                >
                  {s.title}
                </h3>
                {!expandAll && (
                  <span
                    className={cn(
                      'w-6 h-6 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/50 transition-transform duration-300 shrink-0',
                      open && `rotate-180 ${accent}`
                    )}
                  >
                    <ChevronDown size={14} strokeWidth={2.4} />
                  </span>
                )}
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/[0.07]">{s.content}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Legal clause list used inside a section body. */
export function ClauseList({
  clauses,
}: {
  clauses: Array<{ n: string; title?: string; text: string }>;
}) {
  return (
    <div className="flex flex-col gap-4 pt-3">
      {clauses.map((c) => (
        <div key={c.n} className="grid grid-cols-[auto_1fr] gap-x-3">
          <span className="font-roobert text-[12px] font-semibold tabular-nums text-white/35 pt-0.5">{c.n}</span>
          <div>
            {c.title && <h4 className="font-roobert text-[13.5px] font-semibold text-white/90 mb-1">{c.title}</h4>}
            <p className="text-[13.5px] leading-relaxed text-white/65">{c.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
