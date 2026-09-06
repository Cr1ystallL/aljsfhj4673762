'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  FileText,
  HeartHandshake,
  HelpCircle,
  Lock,
  MessageCircle,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/i18n/use-t';
import { cn } from '@/lib/utils';
import { Accordion } from './components/accordion';
import { ClauseList, SectionedDocument, type DocSection } from './components/sectioned-document';
import { WagerTable } from './components/wager-table';
import { FAQ, FAQ_SUPPORT_URL } from './content/faq';
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  PRIVACY,
  RESPONSIBLE,
  TERMS,
  type LegalSection,
} from './content/legal';

type TabId = 'rules' | 'privacy' | 'responsible' | 'faq';

interface TabDef {
  id: TabId;
  label: string;
  Icon: LucideIcon;
  accent: string;
  chip: string;
  glow: string;
  lead: string;
}

export default function InfoPage() {
  const { t } = useT();
  const [tab, setTab] = useState<TabId>('rules');

  const tabs: TabDef[] = useMemo(
    () => [
      {
        id: 'rules',
        label: t('info.rules'),
        Icon: FileText,
        accent: 'text-amber-300',
        chip: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
        glow: 'rgba(255,172,46,0.22)',
        lead: 'Пользовательское соглашение и правила платформы',
      },
      {
        id: 'privacy',
        label: t('info.privacy'),
        Icon: Lock,
        accent: 'text-sky-300',
        chip: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
        glow: 'rgba(56,189,248,0.22)',
        lead: 'Какие данные мы храним, зачем и как долго',
      },
      {
        id: 'responsible',
        label: t('info.responsible'),
        Icon: HeartHandshake,
        accent: 'text-emerald-300',
        chip: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
        glow: 'rgba(0,232,123,0.2)',
        lead: 'Лимиты, тайм-аут, самоисключение и где получить помощь',
      },
      {
        id: 'faq',
        label: t('info.faq'),
        Icon: HelpCircle,
        accent: 'text-violet-300',
        chip: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
        glow: 'rgba(167,139,250,0.22)',
        lead: 'Ответы про аккаунт, деньги, вейджер и правила игр',
      },
    ],
    [t]
  );

  // Deep links (/info#faq, /info#privacy) select a tab. Hash rather than
  // useSearchParams keeps the route statically rendered.
  useEffect(() => {
    const apply = () => {
      const target = window.location.hash.replace('#', '') as TabId;
      if (tabs.some((x) => x.id === target)) setTab(target);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const active = tabs.find((x) => x.id === tab) ?? tabs[0];

  return (
    <main className="min-h-screen w-full bg-black text-frost-white flex flex-col pb-36 font-roobert">
      <GameTopBar title={t('info.title')} Icon={BookOpen} width="wide" />

      <div className={cn('mx-auto w-full px-3.5 pt-4 flex flex-col gap-4', PAGE_WIDTH.wide)}>
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0f13] p-5 sm:p-6">
          <motion.div
            key={active.id}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute -top-28 -right-24 w-80 h-80 rounded-full blur-3xl"
            style={{ background: active.glow }}
          />
          <div className="relative z-10 flex items-start gap-4">
            <div
              className={cn(
                'w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0',
                active.chip
              )}
            >
              <active.Icon size={22} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-roobert text-[20px] sm:text-[22px] font-black text-white tracking-[-0.02em] leading-tight">
                {active.label}
              </h1>
              <p className="mt-1 text-[12.5px] text-white/50 leading-snug">{active.lead}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-white/60 tabular-nums">
                  Редакция {LEGAL_VERSION}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-white/60">
                  Действует с {LEGAL_EFFECTIVE_DATE}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck size={12} strokeWidth={2.4} />
                  18+
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className="sticky top-[52px] z-40 -mx-3.5 px-3.5 py-2 bg-black/85 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl border border-white/10 bg-[#0d0f13]">
            {tabs.map((x) => {
              const isActive = x.id === tab;
              return (
                <Pressable
                  key={x.id}
                  onClick={() => selectTab(x.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1.5 py-2 rounded-xl text-[11px] sm:text-[12.5px] font-semibold transition-colors',
                    isActive ? 'text-white' : 'text-white/45 hover:text-white/75'
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="info-tab-pill"
                      className="absolute inset-0 rounded-xl border border-white/15 bg-white/[0.08]"
                      transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }}
                    />
                  )}
                  <x.Icon size={15} strokeWidth={2.2} className={cn('relative z-10', isActive && x.accent)} />
                  <span className="relative z-10 leading-none truncate max-w-full">{x.label}</span>
                </Pressable>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'rules' && (
              <div className="flex flex-col gap-4">
                <Notice tone="amber">
                  Депозит, ставка или нажатие «Принимаю» при первом запуске означают согласие с этим Соглашением.
                  Если вы не согласны — прекратите использование Платформы.
                </Notice>
                <SectionedDocument
                  sections={legalToDoc(TERMS)}
                  accent="text-amber-300"
                  activeChip="border-amber-400/30 bg-amber-400/15 text-amber-200"
                />
              </div>
            )}

            {tab === 'privacy' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { title: 'Минимум данных', body: 'Telegram-профиль, платежи, технические логи. Карты не храним.' },
                    { title: 'Никаких продаж', body: 'Данные не уходят рекламным сетям. Только платёжные партнёры и закон.' },
                    { title: 'Право на удаление', body: 'Профиль удаляется по запросу; финансовая история — 5 лет по AML.' },
                  ].map((c) => (
                    <div key={c.title} className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.05] p-4">
                      <div className="font-roobert text-[13.5px] font-bold text-sky-200">{c.title}</div>
                      <p className="mt-1 text-[12.5px] text-white/60 leading-snug">{c.body}</p>
                    </div>
                  ))}
                </div>
                <SectionedDocument
                  sections={legalToDoc(PRIVACY)}
                  accent="text-sky-300"
                  activeChip="border-sky-400/30 bg-sky-400/15 text-sky-200"
                />
              </div>
            )}

            {tab === 'responsible' && <ResponsibleTab />}

            {tab === 'faq' && <FaqTab />}
          </motion.div>
        </AnimatePresence>

        {/* Support */}
        <section className="rounded-[20px] border border-white/10 bg-white/[0.025] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center text-white shrink-0">
              <MessageCircle size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="font-roobert text-[14.5px] font-bold text-white">Не нашли ответ?</div>
              <p className="text-[12.5px] text-white/50 leading-snug">
                Поддержка отвечает 24/7. Укажите Telegram ID и время операции.
              </p>
            </div>
          </div>
          <Pressable
            onClick={() => window.open(FAQ_SUPPORT_URL, '_blank')}
            className="px-5 py-3 rounded-xl bg-white text-black font-extrabold text-[13px] hover:bg-white/90 transition-colors"
          >
            Написать в поддержку
          </Pressable>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function legalToDoc(sections: LegalSection[]): DocSection[] {
  return sections.map((s) => ({
    id: s.id,
    n: s.n,
    title: s.title,
    content: <ClauseList clauses={s.clauses} />,
  }));
}

function Notice({ tone, children }: { tone: 'amber' | 'emerald'; children: React.ReactNode }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-400/25 bg-amber-400/[0.08] text-amber-100/90'
      : 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100/90';
  return (
    <div className={cn('rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed', cls)}>{children}</div>
  );
}

function ResponsibleTab() {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="emerald">
        Если игра перестала быть развлечением — остановитесь. Все инструменты ниже бесплатны и включаются
        одним сообщением в поддержку.
      </Notice>
      <SectionedDocument
        accent="text-emerald-300"
        activeChip="border-emerald-400/30 bg-emerald-400/15 text-emerald-200"
        sections={RESPONSIBLE.map((b, i) => ({
          id: b.id,
          n: String(i + 1),
          title: b.title,
          content: (
            <div className="pt-3">
              <p className="text-[13.5px] text-white/65 leading-relaxed">{b.text}</p>
              {b.bullets && (
                <ul className="mt-3 flex flex-col gap-2">
                  {b.bullets.map((line) => (
                    <li key={line} className="flex gap-2.5 text-[13px] text-white/70 leading-snug">
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-emerald-400/80 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        }))}
      />
    </div>
  );
}

function FaqTab() {
  const { t } = useT();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    return FAQ.map((cat) => {
      if (!q) return cat;
      const items = cat.items.filter(
        (it) =>
          it.q.toLowerCase().includes(q) ||
          it.a.toLowerCase().includes(q) ||
          (it.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
      return { ...cat, items };
    }).filter((cat) => cat.items.length > 0);
  }, [q]);

  const total = visible.reduce((n, c) => n + c.items.length, 0);

  const sections: DocSection[] = visible.map((cat, i) => ({
    id: cat.id,
    n: String(i + 1),
    title: `${cat.title} · ${cat.items.length}`,
    content: (
      <div className="flex flex-col gap-2 pt-3">
        {cat.items.map((item) => (
          <Accordion key={item.q} question={item.q} accent="text-violet-300" defaultOpen={!!q}>
            <p>{item.a}</p>
            {item.widget === 'wager-table' && <WagerTable />}
          </Accordion>
        ))}
      </div>
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <label className="relative block">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('info.search')}
          className="w-full h-12 pl-10 pr-10 rounded-2xl border border-white/10 bg-[#0d0f13] text-[14px] text-white placeholder:text-white/35 outline-none focus:border-violet-400/40 focus:ring-2 focus:ring-violet-400/15 transition [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60"
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
      </label>

      {total === 0 ? (
        <div className="rounded-[20px] border border-white/10 bg-white/[0.025] p-8 text-center">
          <div className="font-roobert text-[15px] font-bold text-white">Ничего не найдено</div>
          <p className="mt-1 text-[12.5px] text-white/50">
            Попробуйте другое слово или напишите в поддержку — ответим и добавим вопрос сюда.
          </p>
        </div>
      ) : (
        <SectionedDocument
          sections={sections}
          accent="text-violet-300"
          activeChip="border-violet-400/30 bg-violet-400/15 text-violet-200"
          expandAll={!!q}
        />
      )}
    </div>
  );
}
