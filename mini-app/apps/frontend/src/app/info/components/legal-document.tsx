'use client';

import { useCallback, useRef } from 'react';
import type { LegalSection } from '../content/legal';

interface LegalDocumentProps {
  sections: LegalSection[];
  /** Tailwind text colour for section numbers. */
  accent: string;
}

/**
 * Numbered legal text with a horizontal table of contents that scrolls
 * to the section. Placeholders in «[...]» are rendered as-is so the
 * operator sees what still has to be filled in.
 */
export function LegalDocument({ sections, accent }: LegalDocumentProps) {
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const jump = useCallback((id: string) => {
    const el = refs.current[id];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 128;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Содержание" className="-mx-3.5 px-3.5 overflow-x-auto no-scrollbar">
        <ol className="flex gap-2 w-max pb-1">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => jump(s.id)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-[12px] text-white/70 hover:text-white transition-colors whitespace-nowrap"
              >
                <span className={`font-roobert font-bold tabular-nums ${accent}`}>{s.n}</span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-4">
        {sections.map((s) => (
          <section
            key={s.id}
            id={`legal-${s.id}`}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            className="rounded-[20px] border border-white/10 bg-white/[0.025] overflow-hidden"
          >
            <header className="flex items-baseline gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.07] bg-white/[0.02]">
              <span className={`font-roobert text-[22px] font-black tabular-nums leading-none ${accent}`}>{s.n}</span>
              <h3 className="font-roobert text-[15px] sm:text-[16px] font-bold text-white tracking-[-0.01em]">{s.title}</h3>
            </header>
            <div className="px-4 sm:px-5 py-4 flex flex-col gap-4">
              {s.clauses.map((c) => (
                <div key={c.n} className="grid grid-cols-[auto_1fr] gap-x-3">
                  <span className="font-roobert text-[12px] font-semibold tabular-nums text-white/35 pt-0.5">{c.n}</span>
                  <div>
                    {c.title && (
                      <h4 className="font-roobert text-[13.5px] font-semibold text-white/90 mb-1">{c.title}</h4>
                    )}
                    <p className="text-[13.5px] leading-relaxed text-white/65">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
