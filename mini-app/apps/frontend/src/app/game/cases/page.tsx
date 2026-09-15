'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { GameTopBar } from '@/components/game/game-top-bar';
import { Box, Sparkles, ArrowRight } from 'lucide-react';
import { CasesHistory } from '@/components/game/cases/cases-history';
import { toast } from '@/store/toast-store';
import { useBalance } from '@/hooks/use-balance';
import { useT } from '@/i18n/use-t';

export interface CasePrize {
  id: string;
  amount: number;
  weight: number;
  color: string;
  /** Served by the backend; prizes of a tier always add up to exactly 100. */
  probabilityPercent?: number;
}

export interface CaseTier {
  id: string;
  name: string;
  price: number;
  prizes: CasePrize[];
  totalWeight: number;
}

const CASE_THEMES: Record<string, { color: string; border: string; glow: string; badge: string }> = {
  case_1: { color: '#9e9e9e', border: 'border-zinc-600/40', glow: 'rgba(158,158,158,0.2)', badge: 'БАЗОВЫЙ' },
  case_2: { color: '#4caf50', border: 'border-emerald-500/40', glow: 'rgba(76,175,80,0.25)', badge: 'СТАРТ' },
  case_3: { color: '#2196f3', border: 'border-sky-500/40', glow: 'rgba(33,150,243,0.25)', badge: 'ПОПУЛЯРНЫЙ' },
  case_4: { color: '#9c27b0', border: 'border-purple-500/40', glow: 'rgba(156,39,176,0.25)', badge: 'РЕДКИЙ' },
  case_5: { color: '#e91e63', border: 'border-pink-500/40', glow: 'rgba(233,30,99,0.25)', badge: 'ЭПИК' },
  case_6: { color: '#ffb300', border: 'border-amber-500/50', glow: 'rgba(255,179,0,0.3)', badge: 'ЛЕГЕНДА' },
  case_7: { color: '#f44336', border: 'border-red-500/50', glow: 'rgba(244,67,54,0.35)', badge: 'ДЖЕКПОТ' },
};

export default function CasesPage() {
  const { t, localeTag } = useT();
  const router = useRouter();
  const [cases, setCases] = useState<CaseTier[]>([]);
  const { fetchBalance } = useBalance();

  useEffect(() => {
    void fetchBalance();
    fetch('/api/games/cases/config', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.cases) setCases(data.cases);
      })
      .catch(() => {
        toast.warn('Не удалось загрузить кейсы');
      });
  }, [fetchBalance]);

  return (
    <main className="min-h-screen w-full bg-[#09090b] text-frost-white selection:bg-amber-500/30">
      <GameTopBar
        title={t('cases.title')}
        Icon={Box}
        onHowToPlay={() => router.push('/info#faq')}
      />

      <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-6 pt-3 pb-32 flex flex-col gap-6">

        {/* Hero Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-amber-400" />
            <h1 className="font-brand font-bold text-xl text-white tracking-wide">
              Коллекция кейсов
            </h1>
          </div>
          <span className="text-xs text-zinc-400 font-roobert">
            {cases.length} доступно
          </span>
        </div>

        {/* Cases Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
          {cases.map((c) => {
            const theme = CASE_THEMES[c.id] || {
              color: '#ffffff',
              border: 'border-white/10',
              glow: 'rgba(255,255,255,0.1)',
              badge: 'КЕЙС',
            };

            return (
              <Link
                key={c.id}
                href={`/game/cases/${c.id}`}
                className={`group relative rounded-2xl border ${theme.border} bg-[#121217] p-4 flex flex-col items-center justify-between gap-3 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] hover:shadow-[0_0_30px_rgba(0,0,0,0.6)] overflow-hidden shadow-lg`}
              >
                {/* Ambient glow */}
                <div
                  className="absolute inset-0 opacity-15 group-hover:opacity-30 transition-opacity pointer-events-none blur-[35px]"
                  style={{ background: theme.glow }}
                />

                {/* Badge */}
                <div className="w-full flex items-center justify-between z-10">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-roobert font-extrabold uppercase tracking-wider bg-white/[0.06] border border-white/10 text-white/80">
                    {theme.badge}
                  </span>
                  <span className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                    <ArrowRight size={12} />
                  </span>
                </div>

                {/* Image */}
                <div className="w-28 h-28 sm:w-32 sm:h-32 relative flex-shrink-0 z-10 group-hover:scale-105 transition-transform duration-300">
                  <Image
                    src={`/images/cases/${c.id}.png`}
                    alt={c.name}
                    fill
                    className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)]"
                    unoptimized
                  />
                </div>

                {/* Info & Price */}
                <div className="w-full flex flex-col items-center gap-1.5 z-10">
                  <div className="font-roobert font-bold text-[14px] sm:text-[15px] text-white text-center truncate w-full">
                    {c.name}
                  </div>
                  <div className="font-roobert font-black text-[13px] sm:text-[14px] bg-white/[0.08] group-hover:bg-amber-500/20 group-hover:text-amber-300 group-hover:border-amber-400/40 border border-white/10 px-3.5 py-1 rounded-full tabular-nums transition-colors text-frost-white">
                    {c.price.toLocaleString(localeTag)} zł
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Live History Section */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Sparkles size={14} className="text-amber-400" />
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest font-roobert">
              Live История дропов
            </h2>
          </div>
          <CasesHistory />
        </div>
      </div>
    </main>
  );
}
