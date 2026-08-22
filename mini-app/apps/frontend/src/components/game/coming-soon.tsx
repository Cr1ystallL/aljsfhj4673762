'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';

/**
 * Coming Soon — Monopo Saigon Style
 *
 * Placeholder shown for games whose mechanics are temporarily removed
 * (Mines, Coinflip). The visual stays in keeping with the rest of the
 * app — frosted glass over deep ocean atmospherics, no harsh shadows,
 * Roobert typography, pill controls.
 */

interface ComingSoonProps {
  game: GameKey;
  title: string;
  description?: string;
}

export function ComingSoon({ game, title, description }: ComingSoonProps) {
  const router = useRouter();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white relative overflow-hidden">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.32) 0%, rgba(255, 172, 46, 0.16) 35%, rgba(160, 224, 171, 0.10) 65%, transparent 85%)',
        }}
      />
      <div
        aria-hidden
        className="mobile-no-blur pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(160, 224, 171, 0.22) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        aria-hidden
        className="mobile-no-blur pointer-events-none absolute -bottom-24 -right-20 w-80 h-80 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 172, 46, 0.18) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => router.push('/game/crash')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] text-frost-white/80 hover:text-frost-white hover:border-white/25 transition-colors"
          >
            <ArrowLeft size={12} strokeWidth={1.8} />
            <span className="font-roobert text-[12px]">Назад</span>
          </button>

          <span className="font-roobert text-frost-white text-[16px] font-normal leading-none">
            {title}
          </span>

          <span className="w-[64px]" aria-hidden />
        </div>

        {/* Hero card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl"
        >
          <div className="px-6 py-12 flex flex-col items-center text-center">
            {/* Icon halo */}
            <div className="relative mb-5">
              <div
                className="absolute -inset-6 rounded-full opacity-50 blur-2xl"
                style={{
                  background:
                    'radial-gradient(circle, rgba(160, 224, 171, 0.32) 0%, transparent 70%)',
                }}
              />
              <div className="relative w-20 h-20 rounded-pill border border-white/15 bg-white/[0.04] backdrop-blur-md flex items-center justify-center">
                <GameIcon
                  game={game}
                  size={32}
                  strokeWidth={1.5}
                  className="text-frost-white"
                />
              </div>
            </div>

            <h1 className="font-roobert text-frost-white text-[32px] font-light leading-tight">
              {title}
            </h1>

            <p className="mt-3 font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
              Скоро вернёмся
            </p>

            {description && (
              <p className="mt-5 font-roobert text-[14px] text-frost-white/75 max-w-[320px] leading-snug">
                {description}
              </p>
            )}

            <button
              onClick={() => router.push('/game/crash')}
              className="mt-8 inline-flex items-center gap-1.5 px-5 py-2 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] hover:bg-frost-white/90 transition-colors"
            >
              Играть в Crash
            </button>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
