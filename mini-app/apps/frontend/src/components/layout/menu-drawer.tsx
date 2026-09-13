'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Gamepad2,
  Gift,
  Headphones,
  Home,
  Percent,
  Sparkles,
  Plus,
  Rocket,
  Bomb,
  Spade,
  Coins,
  Disc3,
  Box,
  Dice5,
  Trophy,
  Dribbble,
  CircleDot,
  Radio,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/ui/brand-mark';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { StreakFlameBadge } from '@/components/ui/streak-flame-badge';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useWinStreak } from '@/hooks/use-win-streak';
import { useVip } from '@/hooks/use-vip';
import { useT } from '@/i18n/use-t';
import { useSupportStore } from '@/store/support-store';

const RANK_IMAGES: Record<string, string> = {
  none: '/Rangs/no_rang.png',
  bronze: '/Rangs/Bronze.png',
  silver: '/Rangs/Silver.png',
  gold: '/Rangs/Gold.png',
  platinum: '/Rangs/Platinum.png',
  diamond: '/Rangs/Diamond.png',
};

const SIDEBAR_GAMES = [
  { id: 'crash', name: 'MacvJet', href: '/game/crash', Icon: Rocket },
  { id: 'mines', name: 'Mines', href: '/game/mines', Icon: Bomb },
  { id: 'blackjack', name: 'Blackjack', href: '/game/blackjack', Icon: Spade },
  { id: 'coinflip', name: 'Coinflip', href: '/game/coinflip', Icon: Coins },
  { id: 'wheel', name: 'Wheel', href: '/game/wheel', Icon: Disc3 },
  { id: 'cases', name: 'Case', href: '/game/cases', Icon: Box },
  { id: 'keno', name: 'Keno', href: '/game/keno', Icon: Dice5 },
  { id: 'macvpot', name: 'MacvPot', href: '/game/macvpot', Icon: Trophy },
  { id: 'hilo', name: 'Hi-Lo', href: '/game/hilo', Icon: ChevronUp },
];

const SIDEBAR_SPORTS = [
  { id: 'all_sports', name: 'Все события / Live', href: '/sport', Icon: Radio },
  { id: 'football', name: 'Футбол', href: '/sport?category=football', Icon: SoccerBallIcon },
  { id: 'basketball', name: 'Баскетбол', href: '/sport?category=basketball', Icon: Dribbble },
  { id: 'tennis', name: 'Теннис', href: '/sport?category=tennis', Icon: CircleDot },
  { id: 'esports', name: 'Киберспорт (CS2, Dota 2)', href: '/sport?category=cybersport', Icon: Gamepad2 },
];

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onGameSelect?: (game: string) => void;
  isAuthenticated?: boolean;
}

export function MenuDrawer({
  isOpen,
  onClose,
  onGameSelect,
  isAuthenticated = false,
}: MenuDrawerProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { t, localeTag } = useT();
  const { user } = useAuthStore();
  const balanceStore = useBalanceStore((s) => s.balance);
  const { streak } = useWinStreak();
  const { status: vipStatus } = useVip();

  const [gamesOpen, setGamesOpen] = useState(true);
  const [sportsOpen, setSportsOpen] = useState(false);

  const initials = (user?.firstName?.charAt(0) ?? 'U').toUpperCase();
  const balanceAmount = balanceStore?.amount ?? 0;

  const currentRankId = vipStatus?.currentTier?.id ?? 'bronze';
  const currentRankName = vipStatus?.currentTier?.nameRu ?? 'Бронза';
  const rankImage = RANK_IMAGES[currentRankId] ?? '/Rangs/Bronze.png';

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleNav = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop overlay (dimmed blurred area on the right, tapping closes drawer) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-pointer"
          />

          {/* Drawer panel: opens partially (w-[78%] sm:w-[320px] max-w-[320px]) so background stays visible */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="relative z-10 w-[78%] sm:w-[320px] max-w-[320px] h-full bg-black border-r border-white/10 flex flex-col justify-between p-4 overflow-y-auto shadow-2xl no-scrollbar selection:bg-amber-500/30"
          >
            <div className="space-y-4">
              {/* Brand Logo & Close Button */}
              <div className="flex items-center justify-between px-1 py-1">
                <div
                  onClick={() => handleNav('/')}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <BrandMark variant="gradient" size={38} />
                  <div className="font-brand font-black text-2xl tracking-wider flex items-center leading-none">
                    <span className="text-white">Macv</span>
                    <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                      Bet
                    </span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Закрыть меню"
                  className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white active:scale-95 transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* User Profile Header Card (identical to PC sidebar) */}
              <div className="p-3.5 rounded-2xl border border-white/10 bg-[#121217] shadow-[0_8px_20px_rgba(0,0,0,0.5)] flex flex-col gap-3">
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
                        <span className="font-roobert font-bold text-[14px] text-white truncate">
                          {user?.firstName || 'Игрок'}
                        </span>
                        {streak >= 2 && <StreakFlameBadge streak={streak} size="sm" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold mt-0.5">
                        <img
                          src={rankImage}
                          alt={currentRankName}
                          className="w-4 h-4 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                        />
                        <span>{currentRankName}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleNav('/profile')}
                    title="Профиль"
                    className="p-2 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:border-white/20 transition-all cursor-pointer shrink-0"
                  >
                    <ChevronRight size={16} className="text-white/80" />
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
                      zł
                    </div>
                  </div>

                  <button
                    onClick={() => handleNav('/balance')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    <Plus size={13} strokeWidth={3} />
                    <span>Пополнить</span>
                  </button>
                </div>
              </div>

              {/* Navigation Rail with Categories & Accordions (identical to PC sidebar) */}
              <nav className="space-y-1 text-sm font-medium">
                {/* Главная */}
                <button
                  onClick={() => handleNav('/')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                    pathname === '/'
                      ? 'bg-white/10 text-white font-semibold shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Home className="w-4 h-4 text-white shrink-0" />
                  <span className="text-[13px]">Главная</span>
                </button>

                {/* Категория: Игры (Dropdown / Accordion) */}
                <div className="pt-1">
                  <button
                    onClick={() => setGamesOpen(!gamesOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.03] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Gamepad2 className="w-4 h-4 text-white shrink-0" />
                      <span className="text-[13px] font-bold">Игры</span>
                    </div>
                    {gamesOpen ? (
                      <ChevronUp size={15} className="text-zinc-400" />
                    ) : (
                      <ChevronDown size={15} className="text-zinc-400" />
                    )}
                  </button>

                  {gamesOpen && (
                    <div className="pl-3 pr-1 pt-1 space-y-0.5 border-l border-white/10 ml-4 my-1">
                      {SIDEBAR_GAMES.map((g) => {
                        const isActive = pathname.startsWith(g.href);
                        const IconComp = g.Icon;
                        return (
                          <button
                            key={g.id}
                            onClick={() => handleNav(g.href)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                              isActive
                                ? 'bg-white/15 text-white font-semibold'
                                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                          >
                            <IconComp size={15} className="text-white shrink-0" />
                            <span className="text-[12px] truncate">{g.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Категория: Ставки на спорт (Dropdown / Accordion) */}
                <div className="pt-1">
                  <button
                    onClick={() => setSportsOpen(!sportsOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.03] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <SoccerBallIcon size={16} className="text-white shrink-0" />
                      <span className="text-[13px] font-bold">Ставки на спорт</span>
                    </div>
                    {sportsOpen ? (
                      <ChevronUp size={15} className="text-zinc-400" />
                    ) : (
                      <ChevronDown size={15} className="text-zinc-400" />
                    )}
                  </button>

                  {sportsOpen && (
                    <div className="pl-3 pr-1 pt-1 space-y-0.5 border-l border-white/10 ml-4 my-1">
                      {SIDEBAR_SPORTS.map((s) => {
                        const isActive = pathname === s.href;
                        const SportIcon = s.Icon;
                        return (
                          <button
                            key={s.id}
                            onClick={() => handleNav(s.href)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer ${
                              isActive
                                ? 'bg-white/15 text-white font-semibold'
                                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                          >
                            <SportIcon size={14} className="text-white/80 shrink-0" />
                            <span className="text-[12px] truncate">{s.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Дополнительные разделы */}
                <div className="pt-2 space-y-1 border-t border-white/10">
                  {/* Бонусы */}
                  <button
                    onClick={() => handleNav('/bonuses')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                      pathname.startsWith('/bonuses')
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Gift className="w-4 h-4 text-white shrink-0" />
                      <span className="text-[13px]">Бонусы и акции</span>
                    </div>
                    <Sparkles size={13} className="text-amber-400" />
                  </button>

                  {/* Кэшбэк */}
                  <button
                    onClick={() => handleNav('/cashback')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                      pathname.startsWith('/cashback')
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Percent className="w-4 h-4 text-white shrink-0" />
                      <span className="text-[13px]">Кэшбэк</span>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      до 10%
                    </span>
                  </button>

                  {/* FAQ и Правила */}
                  <button
                    onClick={() => handleNav('/info')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left cursor-pointer ${
                      pathname.startsWith('/info')
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-white shrink-0" />
                    <span className="text-[13px]">FAQ & Правила</span>
                  </button>

                  {/* Техподдержка 24/7 */}
                  <button
                    onClick={() => {
                      onClose();
                      useSupportStore.getState().open();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Headphones className="w-4 h-4 text-white shrink-0" />
                      <span className="text-[13px]">Поддержка (ТП)</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      LIVE
                    </span>
                  </button>
                </div>
              </nav>
            </div>

            {/* Clean Brand Footer (identical to PC sidebar) */}
            <div className="pt-4 pb-1 border-t border-white/10 flex items-center justify-center gap-2.5">
              <BrandMark variant="gradient" size={34} />
              <div className="font-brand font-black text-xl tracking-wider flex items-center leading-none">
                <span className="text-white">Macv</span>
                <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  Bet
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
