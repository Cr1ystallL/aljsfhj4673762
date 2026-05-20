'use client';

import { useRouter } from 'next/navigation';
import { Megaphone, ArrowLeft } from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';

/**
 * Partner — placeholder page reachable from the bottom nav.
 *
 * The full referral / affiliate program lives on the roadmap; this
 * page exists so the bottom-nav link routes somewhere meaningful and
 * can announce that the surface is in development without breaking
 * the navigation flow.
 */
export default function PartnerPage() {
  const router = useRouter();
  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/85 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <ArrowLeft size={12} strokeWidth={1.8} />
            <span className="font-roobert text-[12px]">Назад</span>
          </button>
          <BrandLockup size={48} />
          <span className="w-[64px]" aria-hidden />
        </div>

        <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'radial-gradient(120% 110% at 50% 0%, rgba(160, 224, 171, 0.20) 0%, rgba(255, 172, 46, 0.12) 50%, transparent 80%)',
            }}
          />
          <div className="relative px-6 py-12 flex flex-col items-center text-center gap-4">
            <span className="w-16 h-16 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center">
              <Megaphone size={28} strokeWidth={1.5} />
            </span>
            <h1 className="font-roobert text-frost-white text-[28px] font-light leading-tight">
              Партнёрская программа
            </h1>
            <p className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
              Скоро запустим
            </p>
            <p className="font-roobert text-[14px] text-frost-white/75 max-w-[320px] leading-snug">
              Здесь появится реферальная программа: процент от каждого
              друга которого приведёшь, статистика приглашений и быстрые
              выплаты на основной счёт.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
