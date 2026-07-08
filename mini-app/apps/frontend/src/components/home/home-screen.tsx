'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Send, Sparkles, Trophy, Wallet } from 'lucide-react';
import { BrandWordmark, BrandLockup } from '@/components/ui/brand-mark';
import { GameTopBar } from '@/components/game/game-top-bar';
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
  wide?: boolean;
}

const inAppGames: InAppGame[] = [
  { id: 'crash', name: 'MacvJet', href: '/game/crash', bg: '/MacvJet.png' },
  { id: 'mines', name: 'Mines', href: '/game/mines', bg: '/Mines.png' },
  { id: 'hilo', name: 'Hi-Lo', href: '/game/hilo', bg: '/hilo.png', wide: true },
  { id: 'plinko', name: 'Plinko', href: '/game/plinko', bg: '/Plinko.png' },
  { id: 'coinflip', name: 'Coinflip', href: '/game/coinflip', bg: '/Coinflip.png' },
  { id: 'blackjack', name: 'Blackjack', href: '/game/blackjack', bg: '/bj.png', wide: true },
  { id: 'wheel', name: 'Wheel', href: '/game/wheel', bg: '/Wheel.png' },
  { id: 'bridges', name: 'Bridges', href: '/game/bridges', bg: '/Bridges.png' },
  { id: 'keno', name: 'Keno', href: '/game/keno', bg: '/keno.png', wide: true },
  { id: 'baccarat', name: 'Baccarat', href: '/game/baccarat', bg: '/baccarat.png', wide: true },
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

/**
 * Минимальная форма строки конкурса с `/api/bonuses/contests`. Берём
 * только то, что нужно Hero — название, призовой фонд, баннер. Эта
 * страница не делает join, просто скроллит к разделу турниров.
 */
interface HeroContest {
  id: string;
  title: string;
  visibility: 'public' | 'private' | 'global' | string;
  state: string;
  prizePool: number;
  winnersCount: number;
  endsAt: number;
  bannerUrl: string | null;
}

export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const balance = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();
  const [availability, setAvailability] = useState<{
    isAdmin: boolean;
    hidden: Record<string, boolean>;
  } | null>(null);
  // Список открытых конкурсов — Hero крутит из них рандомный публичный
  // (или глобальный) при каждом монтировании главной. Если конкурсов
  // нет вообще — фолбэк на старую карточку MacvJet, чтобы не было
  // пустого места. null = ещё не загрузили, [] = загружено и пусто.
  const [contests, setContests] = useState<HeroContest[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchBalance();
  }, [fetchBalance, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/games/availability', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const hidden: Record<string, boolean> = {};
        if (Array.isArray(json.games)) {
          for (const g of json.games) {
            if (g?.gameType) hidden[g.gameType] = !!g.hidden;
          }
        }
        setAvailability({ isAdmin: !!json.isAdmin, hidden });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/bonuses/contests', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setContests([]);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setContests(Array.isArray(json.contests) ? json.contests : []);
      } catch {
        if (!cancelled) setContests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Выбираем рандомный публичный или глобальный live/scheduled конкурс.
  // useMemo гарантирует, что внутри одной сессии Hero не «прыгает» при
  // каждом ре-рендере — пользователь стабильно видит один турнир.
  const heroContest = useMemo<HeroContest | null>(() => {
    if (!contests || contests.length === 0) return null;
    const eligible = contests.filter(
      (c) =>
        (c.visibility === 'public' || c.visibility === 'global') &&
        (c.state === 'live' || c.state === 'scheduled')
    );
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
  }, [contests]);

  const balanceAmount = balance?.amount ?? 0;
  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();

  const visibleGames = useMemo(() => {
    // Если не смогли загрузить доступность, по умолчанию скрываем недоделанные игры
    const hidden = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;
    return inAppGames.filter((g) => {
      // Жестко скрываем эти игры от обычных игроков
      if ((g.id === 'blackjack' || g.id === 'baccarat') && !isAdmin) {
        return false;
      }
      if (hidden[g.id] && !isAdmin) return false;
      return true;
    });
  }, [availability]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <GameTopBar title="Главная" />
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">

        {/* Hero — рандомный конкурс из публичных/глобальных, либо
            фолбэк на фирменную игру MacvJet. */}
        {heroContest ? (
          <ContestHero
            contest={heroContest}
            onClick={() => router.push('/bonuses#contests')}
          />
        ) : (
          <MacvJetHero onClick={() => router.push('/game/crash')} />
        )}

        {/* Section caption — Игры */}
        <SectionLabel right={`${visibleGames.length}`}>Игры</SectionLabel>

        <div className="grid grid-cols-2 gap-3">
          {visibleGames.map((g, i) => (
            <button
              key={g.id}
              onClick={() => router.push(g.href)}
              className={`group relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas ${
                g.wide ? 'col-span-2 aspect-[16/9]' : 'aspect-[5/6]'
              } text-left active:scale-[0.98] transition-transform`}
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

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {botGames.map((g) => (
            <button
              key={g.id}
              onClick={() =>
                openTelegram(`https://t.me/${BOT_USERNAME}?start=${g.command}`)
              }
              className="group relative aspect-square overflow-hidden rounded-card border border-white/5 bg-white/[0.02] shadow-[0_4px_20px_rgba(0,0,0,0.15)] active:scale-[0.96] transition-all hover:border-white/15"
            >
              {/* Background art per game (Cyrillic filenames URL-encoded). */}
              {g.bg && (
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(${g.bg})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    filter: 'saturate(1.2)',
                  }}
                />
              )}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.7) 100%)',
                }}
              />
              <div className="relative h-full w-full flex flex-col items-center justify-center gap-2 pt-1">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white/5 blur-xl rounded-full group-hover:bg-white/10 transition-colors" />
                <g.Icon
                  size={24}
                  strokeWidth={1.5}
                  className="text-frost-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] group-hover:-translate-y-0.5 group-hover:scale-105 transition-transform duration-300"
                />
                <span className="font-roobert text-[11px] font-medium tracking-wide text-frost-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {g.label}
                </span>
                <span className="absolute top-2 right-2 text-white/30 group-hover:text-white/60 transition-colors">
                  <Send size={10} strokeWidth={2} />
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

/* -------------------------------------------------------------------------- */
/* Hero variants                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Карточка-герой для конкурса. Использует баннер из админки, если он
 * загружен, либо фирменный градиент Deep Ocean. Призовой фонд и время
 * до конца конкурса показываются как «приманка», чтобы пользователь
 * захотел тапнуть и перейти в раздел турниров.
 */
function ContestHero({
  contest,
  onClick,
}: {
  contest: HeroContest;
  onClick: () => void;
}) {
  const remainingMs = Math.max(0, contest.endsAt - Date.now());
  const remaining = formatRemainingShort(remainingMs);
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas text-left active:scale-[0.99] transition-transform"
    >
      {/* Banner-art из админки, если есть. На обычные конкурсы кладут */}
      {/* фотофон, и Hero будет смотреться кинематографично. */}
      {contest.bannerUrl ? (
        <img
          src={contest.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-55 mix-blend-screen pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 100% at 100% 100%, rgba(255, 172, 46, 0.22) 0%, rgba(160, 224, 171, 0.12) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-4">
        <span className="inline-flex items-center gap-2 font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          <Trophy size={11} className="text-[#ffac2e]" strokeWidth={1.7} />
          {contest.visibility === 'global'
            ? 'Глобальный турнир'
            : 'Случайный турнир'}
        </span>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[28px] sm:text-[32px] font-light leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {contest.title}
            </div>
            <div className="mt-2 flex items-center gap-3 font-roobert text-[11px] text-whisper-gray tabular-nums">
              <span>
                <span className="text-frost-white">
                  {contest.prizePool.toLocaleString('ru-RU', {
                    maximumFractionDigits: 0,
                  })}
                </span>{' '}
                zł призовой фонд
              </span>
              <span>·</span>
              <span>до конца {remaining}</span>
            </div>
          </div>
          <span className="shrink-0 w-11 h-11 rounded-pill border border-white/25 bg-white/[0.06] flex items-center justify-center backdrop-blur-md">
            <ArrowRight size={18} strokeWidth={1.6} />
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Старый Hero — фолбэк, когда конкурсов нет. Совершенно идентичен тому,
 * что был раньше: тёмный фон с MacvJet, gradient-намёк, стрелка
 * перехода в /game/crash.
 */
function MacvJetHero({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-card border border-white/10 bg-midnight-canvas text-left active:scale-[0.99] transition-transform"
    >
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
  );
}

/**
 * Короткий формат "до конца X" для Hero. Полная версия живёт в
 * @/lib/format/relative-time, но Hero нужны только дни и часы — этого
 * хватает, чтобы передать срочность без перегрузки текстом.
 */
function formatRemainingShort(ms: number): string {
  if (ms <= 0) return '0м';
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}
