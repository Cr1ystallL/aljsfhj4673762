'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  Flame,
  Gamepad2,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';
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
 * Home Screen — Apple & Taste-Skill Premium Casino Menu
 *
 * Landings screen composition:
 *   1. Top Bar — Brand wordmark, balance & profile avatar.
 *   2. Live Social Proof Strip — Online players & recent total payouts.
 *   3. Featured Contest / MacvJet Hero plate.
 *   4. Category Filters & Search Bar.
 *   5. Unified Games Grid (In-App & Telegram Bot games with badges & glassmorphism).
 *   6. Quick Actions — Balance & Bonuses.
 *   7. Brand Footer.
 */

type CategoryKey = 'all' | 'inapp' | 'bot' | 'popular';

interface GameItem {
  id: string;
  name: string;
  type: 'inapp' | 'bot';
  href?: string;
  command?: string;
  bg?: string;
  wide?: boolean;
  badge?: { label: string; color: 'gold' | 'red' | 'green' | 'cyan' };
  isPopular?: boolean;
  gameKey?: GameKey;
  Icon?: React.ComponentType<{ size?: number; className?: string }>;
}

const IN_APP_GAMES: GameItem[] = [
  {
    id: 'crash',
    gameKey: 'crash',
    name: 'MacvJet',
    type: 'inapp',
    href: '/game/crash',
    bg: '/MacvJet.png',
    badge: { label: '🔥 TOP', color: 'red' },
    isPopular: true,
  },
  {
    id: 'mines',
    gameKey: 'mines',
    name: 'Mines',
    type: 'inapp',
    href: '/game/mines',
    bg: '/Mines.png',
    badge: { label: '⭐ HOT', color: 'gold' },
    isPopular: true,
  },
  {
    id: 'hilo',
    gameKey: 'hilo',
    name: 'Hi-Lo',
    type: 'inapp',
    href: '/game/hilo',
    bg: '/hilo.png',
    wide: true,
    badge: { label: '⚡ FAST', color: 'cyan' },
  },
  {
    id: 'plinko',
    gameKey: 'plinko',
    name: 'Plinko',
    type: 'inapp',
    href: '/game/plinko',
    bg: '/Plinko.png',
    badge: { label: '🔥 TOP', color: 'red' },
    isPopular: true,
  },
  {
    id: 'coinflip',
    gameKey: 'coinflip',
    name: 'Coinflip',
    type: 'inapp',
    href: '/game/coinflip',
    bg: '/Coinflip.png',
    badge: { label: '💎 50/50', color: 'cyan' },
  },
  {
    id: 'blackjack',
    gameKey: 'blackjack',
    name: 'Blackjack',
    type: 'inapp',
    href: '/game/blackjack',
    bg: '/bj.png',
    wide: true,
    badge: { label: '👑 PRO', color: 'gold' },
  },
  {
    id: 'wheel',
    gameKey: 'wheel',
    name: 'Wheel',
    type: 'inapp',
    href: '/game/wheel',
    bg: '/Wheel.png',
    badge: { label: '⚡ x50', color: 'gold' },
    isPopular: true,
  },
  {
    id: 'bridges',
    gameKey: 'bridges',
    name: 'Bridges',
    type: 'inapp',
    href: '/game/bridges',
    bg: '/Bridges.png',
  },
  {
    id: 'cases',
    gameKey: 'cases',
    name: 'Case',
    type: 'inapp',
    href: '/game/cases',
    bg: '/case.png',
    wide: true,
    badge: { label: '🎁 BONUS', color: 'green' },
  },
  {
    id: 'keno',
    gameKey: 'keno',
    name: 'Keno',
    type: 'inapp',
    href: '/game/keno',
    bg: '/keno.png?v=2',
  },
  {
    id: 'chicken-road',
    gameKey: 'chicken-road',
    name: 'MacvRoad',
    type: 'inapp',
    href: '/game/chicken-road',
    bg: '/MacvRoad.png?v=2',
    badge: { label: '🆕 NEW', color: 'green' },
  },
];

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME?.replace(/^@/, '') || 'macvbet_bot';

const BOT_GAMES: GameItem[] = [
  {
    id: 'bot_cube',
    name: 'Кубики',
    type: 'bot',
    command: 'cube',
    Icon: DiceCubeIcon,
    bg: '/%D0%9A%D1%83%D0%B1%D0%B8%D0%BA%D0%B8.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_bowl',
    name: 'Боулинг',
    type: 'bot',
    command: 'bowl',
    Icon: BowlingIcon,
    bg: '/%D0%91%D0%BE%D1%83%D0%BB%D0%B8%D0%BD%D0%B3.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_darts',
    name: 'Дартс',
    type: 'bot',
    command: 'darts',
    Icon: DartsIcon,
    bg: '/%D0%94%D0%B0%D1%80%D1%82%D1%81.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_basket',
    name: 'Баскетбол',
    type: 'bot',
    command: 'basket',
    Icon: BasketballIcon,
    bg: '/%D0%91%D0%B0%D1%81%D0%BA%D0%B5%D1%82%D0%B1%D0%BE%D0%BB.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_foot',
    name: 'Футбол',
    type: 'bot',
    command: 'foot',
    Icon: FootballIcon,
    bg: '/%D0%A4%D1%83%D1%82%D0%B1%D0%BE%D0%BB.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_knb',
    name: 'КНБ',
    type: 'bot',
    command: 'knb',
    Icon: RpsIcon,
    bg: '/%D0%9A%D0%9D%D0%91.png',
    badge: { label: '🎲 BOT', color: 'cyan' },
  },
  {
    id: 'bot_spider',
    name: 'Паучок',
    type: 'bot',
    command: 'spider',
    Icon: SpiderIcon,
    bg: '/spider_bot.jpg',
    badge: { label: '🔥 BOT TOP', color: 'red' },
    isPopular: true,
  },
];

function openTelegram(url: string) {
  if (typeof window === 'undefined') return;
  const tg = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          openTelegramLink?: (u: string) => void;
          openLink?: (u: string) => void;
        };
      };
    }
  ).Telegram?.WebApp;
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { fetchBalance } = useBalance();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [availability, setAvailability] = useState<{
    isAdmin: boolean;
    hidden: Record<string, boolean>;
  } | null>(null);
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

  const filteredGames = useMemo(() => {
    const hidden = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;

    // Filter in-app games
    const validInApp = IN_APP_GAMES.filter((g) => {
      if ((g.id === 'blackjack' || g.id === 'chicken-road') && !isAdmin) {
        return false;
      }
      if (hidden[g.id] && !isAdmin) return false;
      return true;
    });

    let all = [...validInApp, ...BOT_GAMES];

    // Filter by category
    if (activeCategory === 'inapp') {
      all = all.filter((g) => g.type === 'inapp');
    } else if (activeCategory === 'bot') {
      all = all.filter((g) => g.type === 'bot');
    } else if (activeCategory === 'popular') {
      all = all.filter((g) => g.isPopular);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      all = all.filter((g) => g.name.toLowerCase().includes(q));
    }

    return all;
  }, [availability, activeCategory, searchQuery]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white selection:bg-white/20">
      <GameTopBar title="Главная" />

      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-3 pb-32 flex flex-col gap-5">
        {/* Live Casino Social Proof Ticker */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px] font-roobert text-whisper-gray">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-frost-white font-medium">1,420 онлайн</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400 font-medium">
            <TrendingUp size={13} strokeWidth={2} />
            <span>Выплаты 24ч: 184.2K zł</span>
          </div>
        </div>

        {/* Hero Section — Contest or MacvJet fallback */}
        {heroContest ? (
          <ContestHero
            contest={heroContest}
            onClick={() => router.push('/bonuses#contests')}
          />
        ) : (
          <MacvJetHero onClick={() => router.push('/game/crash')} />
        )}

        {/* Search & Category Filter Section */}
        <div className="flex flex-col gap-3">
          {/* Search bar */}
          <div className="relative w-full">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-whisper-gray/70"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по играм..."
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-roobert text-frost-white placeholder:text-whisper-gray/60 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all backdrop-blur-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10 text-whisper-gray"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <CategoryTab
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              icon={<Gamepad2 size={13} />}
              label="Все"
            />
            <CategoryTab
              active={activeCategory === 'popular'}
              onClick={() => setActiveCategory('popular')}
              icon={<Flame size={13} className="text-amber-400" />}
              label="TOP Игры"
            />
            <CategoryTab
              active={activeCategory === 'inapp'}
              onClick={() => setActiveCategory('inapp')}
              icon={<Zap size={13} className="text-cyan-400" />}
              label="In-App"
            />
            <CategoryTab
              active={activeCategory === 'bot'}
              onClick={() => setActiveCategory('bot')}
              icon={<Bot size={13} className="text-purple-400" />}
              label="В боте"
            />
          </div>
        </div>

        {/* Section Label */}
        <div className="flex items-baseline justify-between px-1">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            {activeCategory === 'all'
              ? 'Все доступные игры'
              : activeCategory === 'inapp'
              ? 'Игры в интерфейсе'
              : activeCategory === 'bot'
              ? 'Игры в диалоге бота'
              : 'Популярные игры'}
          </span>
          <span className="font-roobert text-[11px] text-whisper-gray">
            {filteredGames.length} {getGamesWord(filteredGames.length)}
          </span>
        </div>

        {/* Unified Games Grid */}
        {filteredGames.length === 0 ? (
          <div className="py-12 text-center rounded-card border border-white/5 bg-white/[0.02]">
            <p className="font-roobert text-[14px] text-whisper-gray">
              Игры не найдены
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="mt-3 text-[12px] text-frost-white underline hover:opacity-80 font-roobert"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredGames.map((g, i) => (
              <GameTile key={g.id} game={g} index={i} router={router} />
            ))}
          </div>
        )}

        {/* Quick Actions */}
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
            sublabel="Промокоды и колесо"
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

/* -------------------------------------------------------------------------- */
/* Game Tile Component                                                         */
/* -------------------------------------------------------------------------- */

function GameTile({
  game,
  index,
  router,
}: {
  game: GameItem;
  index: number;
  router: ReturnType<typeof useRouter>;
}) {
  const handleClick = () => {
    if (game.type === 'inapp' && game.href) {
      router.push(game.href);
    } else if (game.type === 'bot' && game.command) {
      openTelegram(`https://t.me/${BOT_USERNAME}?start=${game.command}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-midnight-canvas ${
        game.wide ? 'col-span-2 aspect-[16/9]' : 'aspect-[5/6]'
      } text-left active:scale-[0.97] hover:border-white/25 transition-all duration-200 shadow-lg`}
    >
      {/* Background artwork */}
      {game.bg && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-55 group-hover:opacity-75 transition-opacity duration-300"
          style={{
            backgroundImage: `url(${game.bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* Gradient vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Subtle atmospheric glow */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity mix-blend-screen"
        style={{
          background:
            index % 2 === 0
              ? 'radial-gradient(110% 90% at 100% 100%, rgba(160, 224, 171, 0.22) 0%, transparent 70%)'
              : 'radial-gradient(110% 90% at 0% 100%, rgba(255, 172, 46, 0.20) 0%, transparent 70%)',
        }}
      />

      {/* Tile Content */}
      <div className="relative h-full w-full p-4 flex flex-col justify-between z-10">
        <div className="flex items-start justify-between gap-2">
          {/* Game icon */}
          <span className="w-10 h-10 rounded-xl border border-white/15 bg-black/40 backdrop-blur-md flex items-center justify-center text-frost-white shadow-inner group-hover:scale-105 transition-transform duration-200">
            {game.type === 'inapp' && game.gameKey ? (
              <GameIcon game={game.gameKey} size={20} strokeWidth={1.5} />
            ) : game.Icon ? (
              <game.Icon size={20} className="stroke-[1.5]" />
            ) : (
              <Gamepad2 size={20} strokeWidth={1.5} />
            )}
          </span>

          {/* Badge */}
          {game.badge && (
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm ${
                game.badge.color === 'red'
                  ? 'border-red-500/30 bg-red-500/20 text-red-300'
                  : game.badge.color === 'gold'
                  ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                  : game.badge.color === 'cyan'
                  ? 'border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
                  : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {game.badge.label}
            </span>
          )}
        </div>

        {/* Game Title & Subtitle */}
        <div>
          <div className="font-roobert text-[19px] sm:text-[20px] font-medium leading-tight text-frost-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
            {game.name}
          </div>
          <div className="mt-0.5 font-roobert text-[10px] text-whisper-gray/90 tracking-wide uppercase">
            {game.type === 'inapp' ? 'Mini App Game' : 'Telegram Game'}
          </div>
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Category Tab Button                                                         */
/* -------------------------------------------------------------------------- */

function CategoryTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[12px] font-roobert flex items-center gap-1.5 shrink-0 transition-all active:scale-[0.96] ${
        active
          ? 'bg-white text-black font-semibold shadow-md'
          : 'bg-white/[0.04] text-whisper-gray hover:bg-white/[0.08] hover:text-frost-white border border-white/10'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
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
      className="rounded-2xl border border-white/10 bg-white/[0.03] hover:border-white/20 active:bg-white/[0.06] active:scale-[0.97] transition-all px-4 py-4 text-left flex items-start gap-3"
    >
      <span className="w-9 h-9 rounded-xl border border-white/15 bg-white/[0.05] flex items-center justify-center text-frost-white/90 shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-roobert text-[14px] leading-tight text-frost-white font-medium">
          {label}
        </div>
        <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
          {sublabel}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero Cards                                                                 */
/* -------------------------------------------------------------------------- */

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
      className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-midnight-canvas text-left active:scale-[0.98] hover:border-amber-500/40 transition-all shadow-xl"
    >
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
            'radial-gradient(120% 100% at 100% 100%, rgba(255, 172, 46, 0.28) 0%, rgba(160, 224, 171, 0.12) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-5 py-5 sm:px-6 sm:py-6 flex flex-col gap-4">
        <span className="inline-flex items-center gap-2 font-roobert text-[10px] uppercase tracking-[0.32em] text-amber-300/90">
          <Trophy size={11} className="text-[#ffac2e]" strokeWidth={2} />
          {contest.visibility === 'global'
            ? 'Глобальный турнир'
            : 'Активный конкурс'}
        </span>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[26px] sm:text-[30px] font-normal leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {contest.title}
            </div>
            <div className="mt-2 flex items-center gap-3 font-roobert text-[11px] text-whisper-gray tabular-nums">
              <span>
                <span className="text-amber-300 font-semibold">
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
          <span className="shrink-0 w-11 h-11 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center backdrop-blur-md text-amber-300">
            <ArrowRight size={18} strokeWidth={2} />
          </span>
        </div>
      </div>
    </button>
  );
}

function MacvJetHero({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl border border-white/15 bg-midnight-canvas text-left active:scale-[0.98] hover:border-white/30 transition-all shadow-xl"
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
      <div className="relative px-5 py-5 sm:px-6 sm:py-6 flex flex-col gap-4">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray flex items-center gap-1.5">
          <Flame size={12} className="text-red-400" />
          Рекомендуем · Фирменная игра
        </span>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-roobert text-frost-white text-[36px] sm:text-[44px] font-normal leading-none tracking-tight">
              MacvJet
            </div>
            <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
              Взлетай и забирай умножение до x10,000
            </div>
          </div>
          <span className="shrink-0 w-11 h-11 rounded-xl border border-white/25 bg-white/[0.08] flex items-center justify-center backdrop-blur-md text-frost-white">
            <ArrowRight size={18} strokeWidth={1.8} />
          </span>
        </div>
      </div>
    </button>
  );
}

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

function getGamesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'игр';
  if (mod10 === 1) return 'игра';
  if (mod10 >= 2 && mod10 <= 4) return 'игры';
  return 'игр';
}
