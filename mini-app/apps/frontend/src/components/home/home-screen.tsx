'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Send, Sparkles, Wallet } from 'lucide-react';
import { BrandWordmark, BrandLockup } from '@/components/ui/brand-mark';
import { GameIcon, gameLabel, type GameKey } from '@/components/ui/game-icon';
import {
  BasketballIcon,
  BowlingIcon,
  DartsIcon,
  DiceCubeIcon,
  FootballIcon,
  RpsIcon,
  SpiderIcon,
} from '@/components/ui/bot-game-icons';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';

/**
 * Home Screen — Monopo Saigon Style
 *
 * Landing screen of the mini-app. Composition:
 *   1. Top bar — wordmark on the left, balance pill + avatar on the right.
 *   2. Featured hero — MacvJet plate.
 *   3. In-app games grid (4 tiles).
 *   4. Bot games rail — open Telegram with the matching command.
 *   5. Quick actions — balance / bonuses.
 *   6. Footer — brand lockup.
 *
 * No emoji, no rainbow tints. Deep Ocean gradient appears as atmospheric
 * washes only on the hero card, the per-tile accent and the BrandMark.
 */

interface InAppGame {
  id: GameKey;
  name: string;
  href: string;
  /** Optional background image overlay (path under /public). */
  bg?: string;
}

const inAppGames: InAppGame[] = [
  { id: 'crash', name: 'MacvJet', href: '/game/crash', bg: '/MacvJet.png' },
  { id: 'mines', name: 'Mines', href: '/game/mines', bg: '/Mines.png' },
  { id: 'plinko', name: 'Plinko', href: '/game/plinko', bg: '/Plinko.png' },
  { id: 'coinflip', name: 'Coinflip', href: '/game/coinflip', bg: '/Coinflip.png' },
  { id: 'wheel', name: 'Wheel', href: '/game/wheel', bg: '/Wheel.png' },
  { id: 'bridges', name: 'Bridges', href: '/game/bridges', bg: '/Bridges.png' },
];

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, '') || 'macvbet_bot';

const botGames = [
  { id: 'cube', label: 'Кубики', command: 'cube', Icon: DiceCubeIcon, bg: '/%D0%9A%D1%83%D0%B1%D0%B8%D0%BA%D0%B8.png' },
  { id: 'bowl', label: 'Боулинг', command: 'bowl', Icon: BowlingIcon, bg: '/%D0%91%D0%BE%D1%83%D0%BB%D0%B8%D0%BD%D0%B3.png' },
  { id: 'darts', label: 'Дартс', command: 'darts', Icon: DartsIcon, bg: '/%D0%94%D0%B0%D1%80%D1%82%D1%81.png' },
  { id: 'basket', label: 'Баскетбол', command: 'basket', Icon: BasketballIcon, bg: '/%D0%91%D0%B0%D1%81%D0%BA%D0%B5%D1%82%D0%B1%D0%BE%D0%BB.png' },
  { id: 'foot', label: 'Футбол', command: 'foot', Icon: FootballIcon, bg: '/%D0%A4%D1%83%D1%82%D0%B1%D0%BE%D0%BB.png' },
  { id: 'knb', label: 'КНБ', command: 'knb', Icon: RpsIcon, bg: '/%D0%9A%D0%9D%D0%91.png' },
  { id: 'spider', label: 'Паучок', command: 'spider', Icon: SpiderIcon, bg: '/spider_bot.jpg' },
];

function openTelegram(url: string) {
  if (typeof window === 'undefined') return;
  const tg = (window as unknown as {
    Telegram?: {
      WebApp?: {
        openTelegramLink?: (u: string) => void;
        openLink?: (u: string) => void;
      };
    };
  }).Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const balance = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const balanceAmount = balance?.amount ?? 0;
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Top bar — wordmark | balance + avatar */}
        <header className="flex items-center justify-between">
          <BrandWordmark size={44} />

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/balance')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
              aria-label="Кошелёк"
            >
              <Wallet
                size={13}
                className="text-frost-white/70"
                strokeWidth={1.8}
              />
              <span className="font-roobert text-frost-white text-[14px] tabular-nums leading-none">
                {balanceAmount.toLocaleString('ru-RU', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="font-roobert text-whisper-gray text-[11px] leading-none">
                zł
              </span>
            </button>

            <button
              onClick={() => router.push('/profile')}
              aria-label="Профиль"
              className="relative w-10 h-10 rounded-pill overflow-hidden border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors flex items-center justify-center"
            >
              {user?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoUrl}
                  alt={user.firstName || 'Профиль'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
              ) : (
                <span className="font-roobert text-[14px] text-frost-white">
                  {initials}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Hero — featured game */}
        <button
          onClick={() => router.push('/game/crash')}
          className="relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas text-left active:scale-[0.99] transition-transform"
        >
          {/* Background art — 16:9 MacvJet лежит во всю ширину hero, */}
          {/* без виньетки держится больше фирменного вида. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: 'url(/MacvJet16-9.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              filter: 'saturate(1.05)',
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-80"
            style={{
              background:
                'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.20) 100%)',
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-65 mix-blend-screen"
            style={{
              background:
                'radial-gradient(120% 110% at 80% 110%, rgba(165, 45, 37, 0.40) 0%, rgba(255, 172, 46, 0.22) 35%, rgba(160, 224, 171, 0.12) 65%, transparent 85%)',
            }}
          />
          <div className="relative px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-5">
            <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
              Рекомендуем · Фирменная игра
            </span>
            <div className="flex items-end justify-between gap-4">
              <div className="font-roobert text-frost-white text-[40px] sm:text-[48px] font-light leading-none tracking-tight">
                MacvJet
              </div>
              <span className="shrink-0 w-11 h-11 rounded-pill border border-white/25 bg-white/[0.06] flex items-center justify-center backdrop-blur-md">
                <ArrowRight size={18} strokeWidth={1.6} />
              </span>
            </div>
          </div>
        </button>

        {/* Section caption — Игры */}
        <SectionLabel right={`${inAppGames.length}`}>Игры</SectionLabel>

        <div className="grid grid-cols-2 gap-3">
          {inAppGames.map((g, i) => (
            <button
              key={g.id}
              onClick={() => router.push(g.href)}
              className="group relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas aspect-[5/6] text-left active:scale-[0.98] transition-transform"
            >
              {/* Background art — only when an asset is available. */}
              {g.bg && (
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-55 group-hover:opacity-70 transition-opacity"
                  style={{
                    backgroundImage: `url(${g.bg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              )}
              {/* Vignette so the title stays readable against the art. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 75%, rgba(0,0,0,0.70) 100%)',
                }}
              />
              <div
                aria-hidden
                className="absolute inset-0 opacity-50 group-hover:opacity-65 transition-opacity mix-blend-screen"
                style={{
                  background:
                    i % 2 === 0
                      ? 'radial-gradient(110% 90% at 100% 100%, rgba(160, 224, 171, 0.22) 0%, transparent 70%)'
                      : 'radial-gradient(110% 90% at 0% 100%, rgba(255, 172, 46, 0.20) 0%, transparent 70%)',
                }}
              />
              <div className="relative h-full w-full p-4 flex flex-col justify-between">
                <span className="w-10 h-10 rounded-pill border border-white/15 bg-white/[0.10] backdrop-blur-md flex items-center justify-center">
                  <GameIcon game={g.id} size={20} strokeWidth={1.5} />
                </span>
                <div className="font-roobert text-[20px] leading-none text-frost-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                  {g.name}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Section caption — Bot games */}
        <SectionLabel right={`${botGames.length}`}>Игры в боте</SectionLabel>

        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {botGames.map((g) => (
            <button
              key={g.id}
              onClick={() =>
                openTelegram(`https://t.me/${BOT_USERNAME}?start=${g.command}`)
              }
              className="group relative aspect-square overflow-hidden rounded-card border border-white/10 bg-midnight-canvas active:scale-[0.97] transition-all"
            >
              {/* Background art per game (Cyrillic filenames URL-encoded). */}
              {g.bg && (
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-60 group-active:opacity-75 transition-opacity"
                  style={{
                    backgroundImage: `url(${g.bg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              )}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%)',
                }}
              />
              <div className="relative h-full w-full flex flex-col items-center justify-center gap-1.5">
                <g.Icon
                  size={22}
                  strokeWidth={1.5}
                  className="text-frost-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                />
                <span className="font-roobert text-[11px] text-frost-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {g.label}
                </span>
                <span className="absolute top-1.5 right-1.5 text-frost-white/55">
                  <Send size={9} strokeWidth={1.8} />
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Quick actions */}
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
            sublabel="Промокоды и колесо удачи"
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

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: string;
}) {
  return (
    <div className="flex items-baseline justify-between pt-1 px-1">
      <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
        {children}
      </span>
      {right && (
        <span className="font-roobert text-[11px] text-whisper-gray">{right}</span>
      )}
    </div>
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
    <button
      onClick={onClick}
      className="rounded-card border border-white/10 bg-white/[0.03] active:bg-white/[0.06] active:scale-[0.98] transition-all px-4 py-4 text-left flex items-start gap-3"
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
    </button>
  );
}

// Use gameLabel to satisfy the import (kept here for future expansion of
// game tiles that need the resolved display name programmatically).
void gameLabel;
