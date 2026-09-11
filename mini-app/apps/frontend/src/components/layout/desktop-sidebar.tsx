'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Crown,
  Gamepad2,
  Gift,
  Headphones,
  Home,
  Percent,
  Sparkles,
  Trophy,
  User,
  Wallet,
  Plus,
} from 'lucide-react';
import { BrandMark } from '@/components/ui/brand-mark';
import { StreakFlameBadge } from '@/components/ui/streak-flame-badge';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useWinStreak } from '@/hooks/use-win-streak';
import { useT } from '@/i18n/use-t';

const SIDEBAR_GAMES: Array<{
  id: GameKey;
  name: string;
  href: string;
  badge?: string;
  badgeColor?: string;
}> = [
  { id: 'crash', name: 'MacvJet', href: '/game/crash', badge: 'TOP', badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { id: 'mines', name: 'Mines', href: '/game/mines', badge: 'MINES', badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { id: 'blackjack', name: 'Blackjack', href: '/game/blackjack', badge: 'HOT', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'coinflip', name: 'Coinflip', href: '/game/coinflip', badge: 'PVP', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'wheel', name: 'Wheel', href: '/game/wheel', badge: 'x50', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'cases', name: 'Case', href: '/game/cases', badge: 'CASES', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'keno', name: 'Keno', href: '/game/keno', badge: 'KENO', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'macvpot', name: 'MacvPot', href: '/game/macvpot', badge: 'JACKPOT', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'hilo', name: 'Hi-Lo', href: '/game/hilo', badge: 'HI-LO', badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
];

const SIDEBAR_SPORTS = [
  { id: 'all_sports', name: 'Все события / Live', href: '/sport' },
  { id: 'football', name: 'Футбол', href: '/sport?sport=football' },
  { id: 'basketball', name: 'Баскетбол', href: '/sport?sport=basketball' },
  { id: 'tennis', name: 'Теннис', href: '/sport?sport=tennis' },
  { id: 'esports', name: 'Киберспорт (CS2, Dota 2)', href: '/sport?tab=esports' },
];

export function DesktopSidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { t, localeTag } = useT();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);
  const { streak } = useWinStreak();

  // Accordion open/close states
  const [gamesOpen, setGamesOpen] = useState(true);
  const [sportsOpen, setSportsOpen] = useState(false);

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();
  const balanceAmount = balanceStore?.amount ?? 0;

  return (
    <aside className="hidden lg:flex w-72 bg-[#0a0a0e] border-r border-amber-500/15 flex-col justify-between p-4 flex-shrink-0 sticky top-0 h-screen z-40 overflow-y-auto no-scrollbar selection:bg-amber-500/30">
      <div className="space-y-4">
        {/* Brand Logo & Title */}
        <div
          onClick={() => router.push('/')}
          className="flex items-center gap-3 px-2 py-2 cursor-pointer group"
        >
          <BrandMark variant="gradient" size={36} />
          <div>
            <div className="font-brand font-black text-xl tracking-widest gold-text-gradient">
              MACVJET
            </div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-amber-200/40">
              Официальный клуб
            </div>
          </div>
        </div>

        {/* User Profile Header Card */}
        <div className="p-3.5 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-[#16151c] to-[#0f0e13] shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-10 h-10 rounded-full border border-amber-400/40 bg-amber-500/10 flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-amber-400/20">
                {user?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoUrl}
                    alt={user.firstName || 'User'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="font-roobert font-bold text-sm text-amber-200">
                    {initials}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-roobert font-bold text-[14px] text-frost-white truncate">
                    {user?.firstName || 'Игрок'}
                  </span>
                  {streak >= 2 && <StreakFlameBadge streak={streak} size="sm" />}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-300/90 font-medium">
                  <Crown size={11} className="text-amber-400" />
                  <span>VIP Игрок</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push('/profile')}
              title="Профиль"
              className="p-1.5 rounded-xl border border-amber-500/20 bg-white/[0.04] text-zinc-400 hover:text-white hover:border-amber-400/50 transition-all cursor-pointer shrink-0"
            >
              <User size={15} />
            </button>
          </div>

          {/* Balance & Deposit Button */}
          <div className="pt-2 border-t border-amber-500/15 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                Баланс
              </div>
              <div className="font-roobert font-extrabold text-[15px] text-frost-white tabular-nums tracking-tight gold-text-gradient truncate">
                {balanceAmount.toLocaleString(localeTag, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                ₽
              </div>
            </div>

            <button
              onClick={() => router.push('/balance')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <Plus size={13} strokeWidth={3} />
              <span>Пополнить</span>
            </button>
          </div>
        </div>

        {/* Navigation Rail with Categories & Accordions */}
        <nav className="space-y-1 text-sm font-medium">
          {/* Главная */}
          <button
            onClick={() => router.push('/')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
              pathname === '/'
                ? 'gold-card-active text-amber-300 font-semibold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Home className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[13px]">Главная</span>
          </button>

          {/* Категория: Игры (Dropdown / Accordion) */}
          <div className="pt-1">
            <button
              onClick={() => setGamesOpen(!gamesOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.03] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[13px] font-bold">Игры ({SIDEBAR_GAMES.length})</span>
              </div>
              {gamesOpen ? (
                <ChevronUp size={15} className="text-zinc-500" />
              ) : (
                <ChevronDown size={15} className="text-zinc-500" />
              )}
            </button>

            {gamesOpen && (
              <div className="pl-3 pr-1 pt-1 space-y-0.5 border-l border-amber-500/15 ml-4 my-1">
                {SIDEBAR_GAMES.map((g) => {
                  const isActive = pathname.startsWith(g.href);
                  return (
                    <button
                      key={g.id}
                      onClick={() => router.push(g.href)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-300 font-semibold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <GameIcon game={g.id} size={14} className="text-amber-400/80 shrink-0" />
                        <span className="text-[12px] truncate">{g.name}</span>
                      </div>
                      {g.badge && (
                        <span
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border tracking-wider ${g.badgeColor}`}
                        >
                          {g.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Категория: Ставки (Dropdown / Accordion) */}
          <div className="pt-1">
            <button
              onClick={() => setSportsOpen(!sportsOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.03] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <SoccerBallIcon size={16} className="text-amber-400 shrink-0" />
                <span className="text-[13px] font-bold">Ставки на спорт</span>
              </div>
              {sportsOpen ? (
                <ChevronUp size={15} className="text-zinc-500" />
              ) : (
                <ChevronDown size={15} className="text-zinc-500" />
              )}
            </button>

            {sportsOpen && (
              <div className="pl-3 pr-1 pt-1 space-y-0.5 border-l border-amber-500/15 ml-4 my-1">
                {SIDEBAR_SPORTS.map((s) => {
                  const isActive = pathname === s.href;
                  return (
                    <button
                      key={s.id}
                      onClick={() => router.push(s.href)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-300 font-semibold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-[12px]">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Оставшиеся разделы */}
          <div className="pt-2 space-y-1 border-t border-amber-500/10">
            {/* Бонусы */}
            <button
              onClick={() => router.push('/bonuses')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                pathname.startsWith('/bonuses')
                  ? 'gold-card-active text-amber-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Gift className="w-4 h-4 text-pink-400 shrink-0" />
                <span className="text-[13px]">Бонусы и акции</span>
              </div>
              <Sparkles size={13} className="text-amber-400" />
            </button>

            {/* Кэшбэк */}
            <button
              onClick={() => router.push('/cashback')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                pathname.startsWith('/cashback')
                  ? 'gold-card-active text-amber-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Percent className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[13px]">Кэшбэк</span>
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                до 10%
              </span>
            </button>

            {/* Турниры и конкурсы */}
            <button
              onClick={() => router.push('/bonuses#contests')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                pathname.includes('contests') || pathname.includes('tournaments')
                  ? 'gold-card-active text-amber-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[13px]">Турниры</span>
            </button>

            {/* FAQ и Правила */}
            <button
              onClick={() => router.push('/info')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                pathname.startsWith('/info')
                  ? 'gold-card-active text-amber-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-[13px]">FAQ & Правила</span>
            </button>

            {/* Техподдержка 24/7 */}
            <button
              onClick={() => window.open('https://t.me/MacvBetSupport', '_blank')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all text-left cursor-pointer"
            >
              <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[13px]">Поддержка (ТП)</span>
            </button>

            {/* Профиль */}
            <button
              onClick={() => router.push('/profile')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                pathname.startsWith('/profile')
                  ? 'gold-card-active text-amber-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <User className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[13px]">Профиль</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Clean Brand Footer (VIP widget removed as requested) */}
      <div className="pt-4 border-t border-amber-500/10 flex items-center justify-center gap-2.5">
        <BrandMark variant="gradient" size={24} />
        <div>
          <div className="font-brand font-bold text-xs tracking-widest gold-text-gradient">
            MACVJET
          </div>
          <div className="text-[8px] tracking-[0.2em] text-zinc-500 uppercase">
            Лицензионный клуб • 2026
          </div>
        </div>
      </div>
    </aside>
  );
}
