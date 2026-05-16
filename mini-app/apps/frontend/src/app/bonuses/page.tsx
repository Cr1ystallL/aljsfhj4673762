'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';

/**
 * Bonuses — placeholder.
 *
 * The bonus system is on the roadmap; this page exists so the menu link
 * routes somewhere meaningful. Once promo codes / loyalty / referrals
 * land, this becomes their entry point.
 */
export default function BonusesPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label="Назад"
            className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span className="font-roobert text-[14px] uppercase tracking-[0.28em] text-whisper-gray">
            Бонусы
          </span>
          <span className="w-10 h-10" />
        </header>

        <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(120% 110% at 50% 110%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.12) 45%, transparent 80%)',
            }}
          />
          <div className="relative px-6 py-10 flex flex-col items-center text-center gap-3">
            <span className="w-12 h-12 rounded-pill border border-white/20 bg-white/[0.04] flex items-center justify-center text-frost-white">
              <Sparkles size={20} strokeWidth={1.6} />
            </span>
            <span className="font-roobert text-[24px] leading-none">Скоро</span>
            <p className="font-roobert text-[12px] text-whisper-gray max-w-[320px]">
              Промокоды, ежедневные бонусы и реферальная программа
              появятся здесь в ближайшее время.
            </p>
          </div>
        </section>

        <div className="pt-4 flex items-center justify-center">
          <BrandLockup size={64} />
        </div>
      </div>
    </main>
  );
}
