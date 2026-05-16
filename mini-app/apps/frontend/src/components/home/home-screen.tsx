'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Wallet } from 'lucide-react';
import { BrandWordmark, BrandLockup } from '@/components/ui/brand-mark';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';

/**
 * Home Screen — Monopo Saigon Style
 *
 * Landing screen of the mini-app. Composition follows the brand's quiet,
 * editorial rhythm: a hero plate that introduces the brand and the
 * featured game, then a tight grid of in-app games, then a pair of
 * navigation cards (balance / bonuses) that surface the most common
 * non-game intents.
 *
 * No emoji, no rainbow accents. The Deep Ocean gradient appears only as
 * an atmospheric wash on the hero card and as the BrandMark fill.
 */

interface InAppGame {
  id: GameKey;
  /** Display name on the tile. Coinflip stays English-cased on the card. */
  name: string;
  caption: string;
  href: string;
}

const inAppGames: InAppGame[] = [
  { id: 'crash', name: 'MacvJet', caption: 'Полёт до краха', href: '/game/crash' },
  { id: 'mines', name: 'Mines', caption: 'Поле 5×5', href: '/game/mines' },
  { id: 'plinko', name: 'Plinko', caption: 'Шар сквозь штифты', href: '/game/plinko' },
  { id: 'coinflip', name: 'Coinflip', caption: 'Орёл или решка', href: '/game/coinflip' },
];

export function HomeScreen() {
  const router = useRouter();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-5 pb-32 flex flex-col gap-5">
        {/* Brand wordmark */}
        <header className="flex items-center justify-between">
          <BrandWordmark size={48} />
          <button
            onClick={() => router.push('/profile')}
            className="font-roobert text-[12px] uppercase tracking-[0.2em] text-whisper-gray hover:text-frost-white transition-colors"
          >
            Профиль
          </button>
        </header>

        {/* Hero plate — featured game */}
        <motion.button
          onClick={() => router.push('/game/crash')}
          whileTap={{ scale: 0.99 }}
          className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03] text-left"
        >
          {/* Atmospheric Deep Ocean wash */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-70"
            style={{
              background:
                'radial-gradient(120% 110% at 80% 110%, rgba(165, 45, 37, 0.45) 0%, rgba(255, 172, 46, 0.25) 35%, rgba(160, 224, 171, 0.15) 65%, transparent 85%)',
            }}
          />
          <div className="relative px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-5">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Featured · provably fair
            </span>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-roobert text-frost-white text-[40px] sm:text-[48px] font-light leading-none tracking-tight">
                  MacvJet
                </div>
                <div className="mt-2 font-roobert text-[13px] text-whisper-gray">
                  Взлетай и забирай выигрыш до краха
                </div>
              </div>
              <span className="shrink-0 w-11 h-11 rounded-pill border border-white/25 bg-white/[0.06] flex items-center justify-center">
                <ArrowRight size={18} strokeWidth={1.6} />
              </span>
            </div>
          </div>
        </motion.button>

        {/* Section caption */}
        <div className="flex items-baseline justify-between pt-1 px-1">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Игры
          </span>
          <span className="font-roobert text-[11px] text-whisper-gray">
            {inAppGames.length}
          </span>
        </div>

        {/* Games grid */}
        <div className="grid grid-cols-2 gap-3">
          {inAppGames.map((g, i) => (
            <motion.button
              key={g.id}
              onClick={() => router.push(g.href)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.98 }}
              className="group relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03] aspect-[4/5] text-left"
            >
              {/* Per-tile soft wash */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-50 group-hover:opacity-70 transition-opacity"
                style={{
                  background:
                    i % 2 === 0
                      ? 'radial-gradient(110% 90% at 100% 100%, rgba(160, 224, 171, 0.25) 0%, transparent 70%)'
                      : 'radial-gradient(110% 90% at 0% 100%, rgba(255, 172, 46, 0.22) 0%, transparent 70%)',
                }}
              />
              <div className="relative h-full w-full p-4 flex flex-col justify-between">
                <span className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center">
                  <GameIcon game={g.id} size={20} strokeWidth={1.5} />
                </span>
                <div>
                  <div className="font-roobert text-[20px] leading-none text-frost-white">
                    {g.name}
                  </div>
                  <div className="mt-1.5 font-roobert text-[11px] text-whisper-gray">
                    {g.caption}
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Quick actions row */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <QuickAction
            icon={<Wallet size={18} strokeWidth={1.5} />}
            label="Управление балансом"
            sublabel="Пополнение и вывод"
            onClick={() => router.push('/balance')}
          />
          <QuickAction
            icon={<Sparkles size={18} strokeWidth={1.5} />}
            label="Бонусы"
            sublabel="Скоро"
            onClick={() => router.push('/bonuses')}
          />
        </div>

        {/* Footer brand lockup */}
        <div className="pt-6 flex items-center justify-center">
          <BrandLockup size={64} />
        </div>
      </div>
    </main>
  );
}

function QuickAction({
  icon,
  label,
  sublabel,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className="rounded-card border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-4 py-4 text-left flex items-start gap-3"
    >
      <span className="w-9 h-9 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/85 shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-roobert text-[14px] leading-tight text-frost-white">
          {label}
        </div>
        <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
          {sublabel}
        </div>
      </div>
    </motion.button>
  );
}
