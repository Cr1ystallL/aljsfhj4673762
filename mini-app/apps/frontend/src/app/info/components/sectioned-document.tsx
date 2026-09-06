'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export interface DocSection {
  id: string;
  n: string;
  title: string;
  content: ReactNode;
}

interface SectionedDocumentProps {
  sections: DocSection[];
  accent: string;
  activeChip: string;
  glow?: string;
}

const SCROLL_LOCK_MS = 900;
const OFFSET_MOBILE = 176;
const OFFSET_DESKTOP = 128;

/**
 * Always-open document + table of contents.
 * Chapters stay readable (no collapse). The rail scrolls to the chapter
 * heading — never to the last clause of a tall section.
 */
export function SectionedDocument({
  sections,
  accent,
  activeChip,
  glow = 'rgba(255,255,255,0.28)',
}: SectionedDocumentProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const headingRefs = useRef<Record<string, HTMLElement | null>>({});
  const railBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const clickLock = useRef(false);
  const sectionKey = sections.map((s) => s.id).join('|');

  useEffect(() => {
    setActive(sections[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === active)
  );
  const progress = sections.length > 1 ? activeIndex / (sections.length - 1) : 0;

  const scrollToHeading = useCallback((id: string) => {
    const heading = headingRefs.current[id] ?? refs.current[id];
    if (!heading) return;
    const offset = window.matchMedia('(min-width: 640px)').matches ? OFFSET_DESKTOP : OFFSET_MOBILE;
    const top = heading.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    railBtnRefs.current[id]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, []);

  const select = (id: string) => {
    haptics.selection();
    setActive(id);
    clickLock.current = true;
    // Measure after paint so sticky offsets are correct.
    requestAnimationFrame(() => scrollToHeading(id));
    window.setTimeout(() => {
      clickLock.current = false;
    }, SCROLL_LOCK_MS);
  };

  useEffect(() => {
    const nodes = sectionKey
      .split('|')
      .map((id) => refs.current[id])
      .filter((n): n is HTMLElement => Boolean(n));
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (clickLock.current) return;
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = hit?.target.getAttribute('data-sec');
        if (id) setActive(id);
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0.01 }
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [sectionKey]);

  return (
    <div
      data-info-doc="rail-v2"
      className="flex flex-col sm:flex-row gap-3 sm:gap-5 items-stretch sm:items-start"
    >
      <nav
        aria-label="Оглавление"
        className={cn(
          'sticky z-30 shrink-0',
          'top-[108px] sm:top-[118px]',
          'rounded-2xl border border-white/10 bg-[#0d0f13]/92 backdrop-blur-xl',
          'px-2 py-2 sm:px-1.5 sm:py-3',
          'overflow-x-auto sm:overflow-visible no-scrollbar',
          'w-full sm:w-[56px]'
        )}
      >
        <div className="relative">
          <div
            aria-hidden
            className="absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-white/[0.08] hidden sm:block"
          />
          <motion.div
            aria-hidden
            className="absolute left-1/2 top-3 w-px -translate-x-1/2 origin-top rounded-full hidden sm:block"
            style={{
              background: `linear-gradient(180deg, ${glow}, transparent)`,
              boxShadow: `0 0 10px ${glow}`,
            }}
            animate={{ height: `calc((100% - 24px) * ${progress})` }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          />
          <div className="relative flex flex-row sm:flex-col items-center gap-1.5">
            {sections.map((s, i) => {
              const on = s.id === active;
              return (
                <div key={s.id} className="relative group/rail shrink-0">
                  <motion.button
                    ref={(el) => {
                      railBtnRefs.current[s.id] = el;
                    }}
                    type="button"
                    onClick={() => select(s.id)}
                    aria-current={on ? 'true' : undefined}
                    aria-label={`${s.n}. ${s.title}`}
                    title={s.title}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: on ? 1.04 : 1 }}
                    transition={{
                      opacity: { delay: i * 0.02, duration: 0.2 },
                      scale: { type: 'spring', stiffness: 380, damping: 22 },
                    }}
                    className={cn(
                      'relative flex items-center gap-2 font-roobert font-bold tabular-nums border',
                      'transition-colors duration-200',
                      'h-10 px-3 rounded-full sm:px-0 sm:w-10 sm:justify-center',
                      on
                        ? activeChip
                        : 'border-white/[0.08] bg-[#101218] text-white/45 hover:text-white hover:border-white/20'
                    )}
                  >
                    {on && (
                      <span
                        aria-hidden
                        className="absolute -inset-1 rounded-full -z-10 animate-pulse"
                        style={{ boxShadow: `0 0 18px 2px ${glow}` }}
                      />
                    )}
                    <span className="relative z-10 text-[13.5px]">{s.n}</span>
                    <span className="relative z-10 sm:hidden text-[12px] font-semibold max-w-[8.5rem] truncate">
                      {s.title}
                    </span>
                  </motion.button>
                  <span
                    className={cn(
                      'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3',
                      'hidden sm:block whitespace-nowrap',
                      'rounded-lg border border-white/10 bg-[#12151c] px-2.5 py-1',
                      'text-[11.5px] font-medium text-white/80 shadow-lg',
                      'opacity-0 translate-x-1 group-hover/rail:opacity-100 group-hover/rail:translate-x-0',
                      'transition-all duration-200 z-50'
                    )}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      <article className="min-w-0 flex-1 min-h-[60vh] rounded-[24px] border border-white/10 bg-[#0d0f13] divide-y divide-white/[0.06]">
        {sections.map((s, i) => (
          <motion.section
            key={s.id}
            id={`sec-${s.id}`}
            data-sec={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03 }}
            className="scroll-mt-[176px] sm:scroll-mt-[128px] px-4 sm:px-6 py-5 sm:py-6"
          >
            <header
              ref={(el) => {
                headingRefs.current[s.id] = el;
              }}
              data-sec-heading={s.id}
              className="flex items-start gap-3 mb-4"
            >
              <span
                className={cn(
                  'font-roobert text-[22px] sm:text-[26px] font-black tabular-nums leading-none pt-0.5',
                  accent
                )}
              >
                {s.n}
              </span>
              <h3 className="font-roobert text-[16px] sm:text-[18px] font-bold text-white tracking-[-0.02em] leading-tight pt-1">
                {s.title}
              </h3>
            </header>
            {s.content}
          </motion.section>
        ))}
      </article>
    </div>
  );
}

export function ClauseList({
  clauses,
}: {
  clauses: Array<{ n: string; title?: string; text: string }>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {clauses.map((c) => (
        <div key={c.n} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <span className="font-roobert text-[12px] font-semibold tabular-nums text-white/35 pt-0.5">
            {c.n}
          </span>
          <div>
            {c.title && (
              <h4 className="font-roobert text-[13.5px] font-semibold text-white/90 mb-1.5">
                {c.title}
              </h4>
            )}
            <p className="text-[13.5px] leading-[1.65] text-white/68">{c.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
