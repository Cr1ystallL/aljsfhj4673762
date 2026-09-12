'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Bomb,
  Box,
  Coins,
  Crown,
  Disc3,
  Flame,
  Gamepad2,
  Gift,
  Headphones,
  Layers,
  Lock,
  ShieldCheck,
  Spade,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BrandLockup, BrandMark } from '@/components/ui/brand-mark';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { useAuthStore } from '@/store/auth-store';
import { useBalance } from '@/hooks/use-balance';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { Pressable } from '@/components/ui/pressable';
import { cn } from '@/lib/utils';
import { MacvJetHero, useCrashLobby } from '@/components/home/macvjet-hero';
import { HomeLuckFeed, type LuckFeedItem } from '@/components/home/home-luck-feed';
import { useSplashStore } from '@/store/splash-store';
import { useT } from '@/i18n/use-t';
import type { TxKey } from '@/i18n/use-t';

/**
 * Home Screen — Luxury Obsidian & Gold Cyber-Casino Lobby (PC & Mobile).
 * Flagship Hero Banner, Responsive 6-col Grid (Row 1: 3, Rows 2-4: 2),
 * Gold hairline borders, Provably Fair badges, and instant balance controls.
 */

type CategoryKey = 'all' | 'crash' | 'cards' | 'wheel_cases' | 'arcades' | 'pvp';

interface GameBadge {
  label: string;
  color: 'gold' | 'red' | 'green' | 'cyan' | 'purple';
  Icon: LucideIcon;
}

interface InAppGame {
  id: GameKey;
  name: string;
  href: string;
  bg?: string;
  wide?: boolean;
  badge?: GameBadge;
  isPopular?: boolean;
  category?: 'fast' | 'table' | 'instant';
}

const GAME_COL_SPAN: Record<string, string> = {
  // Mobile: 3 columns (Row 1: 3 squares, Rows 2-4: 1 wide + 1 square)
  // Desktop: 4 columns balanced Bento grid (Row 1: 2 squares + 1 wide; Row 2: 1 wide + 2 squares; Row 3: 1 wide + 2 squares)
  crash: 'col-span-1 lg:col-span-1 lg:order-1',
  mines: 'col-span-1 lg:col-span-1 lg:order-2',
  blackjack: 'col-span-2 lg:col-span-2 lg:order-3',
  cases: 'col-span-2 lg:col-span-2 lg:order-4',
  wheel: 'col-span-1 lg:col-span-1 lg:order-5',
  coinflip: 'col-span-1 lg:col-span-1 lg:order-6',
  hilo: 'col-span-2 lg:col-span-2 lg:order-7',
  keno: 'col-span-1 lg:col-span-1 lg:order-8',
  macvpot: 'col-span-1 lg:col-span-1 lg:order-9',
};

const IN_APP_GAMES: InAppGame[] = [
  // Row 1
  {
    id: 'crash',
    name: 'MacvJet',
    href: '/game/crash',
    bg: '/macvjet.png?v=3d_3',
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'mines',
    name: 'Mines',
    href: '/game/mines',
    bg: '/mines.png?v=3d_3',
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'wheel',
    name: 'Wheel',
    href: '/game/wheel',
    bg: '/wheel.png?v=3d_3',
    isPopular: true,
    category: 'fast',
  },
  // Row 2
  {
    id: 'blackjack',
    name: 'BlackJack',
    href: '/game/blackjack',
    bg: '/bj.png?v=3d_3',
    isPopular: true,
    category: 'table',
  },
  {
    id: 'coinflip',
    name: 'CoinFlip',
    href: '/game/coinflip',
    bg: '/coinflip.png?v=3d_3',
    category: 'fast',
  },
  // Row 3
  {
    id: 'cases',
    name: 'Case',
    href: '/game/cases',
    bg: '/case.png?v=3d_3',
    category: 'fast',
  },
  {
    id: 'keno',
    name: 'Keno',
    href: '/game/keno',
    bg: '/keno.png?v=3d_3',
    category: 'table',
  },
  // Row 4
  {
    id: 'hilo',
    name: 'Hi-Lo',
    href: '/game/hilo',
    bg: '/hilo.png?v=3d_3',
    category: 'fast',
  },
  {
    id: 'macvpot',
    name: 'MacvPot',
    href: '/game/macvpot',
    bg: '/macvpot.png?v=3d_3',
    isPopular: true,
    category: 'fast',
  },
];

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

interface HeroTournament {
  id: string;
  title: string;
  description?: string;
  gameType: string;
  prizePool: number;
  winnersCount: number;
  entryFee: number;
  startsAt: number;
  endsAt: number;
  joined?: boolean;
  live?: boolean;
  bannerUrl?: string | null;
}

export function HomeScreen() {
  const { t, localeTag } = useT();
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
  const [tournaments, setTournaments] = useState<HeroTournament[] | null>(null);
  const [eventTab, setEventTab] = useState<'all' | 'tournaments' | 'contests'>('all');

  const reduceMotion = useReducedMotion();
  const splashVisible = useSplashStore((s) => s.visible);
  const [lobbyReady, setLobbyReady] = useState(false);
  const [skipEntrance, setSkipEntrance] = useState(false);
  const [online, setOnline] = useState(0);
  const crashLobby = useCrashLobby();

  // Dynamic live online state
  const [rawOnline, setRawOnline] = useState<number>(6);
  const [payouts24h, setPayouts24h] = useState<number>(2840);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchBalance();
  }, [fetchBalance, isAuthenticated]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('macv.home.entered') === '1') {
        setSkipEntrance(true);
        setLobbyReady(true);
        return;
      }
    } catch {
      /* private mode */
    }
    if (!splashVisible) {
      setLobbyReady(true);
      try {
        sessionStorage.setItem('macv.home.entered', '1');
      } catch {
        /* ignore */
      }
    }
  }, [splashVisible]);

  useEffect(() => {
    const id = window.setTimeout(() => setLobbyReady(true), 8000);
    return () => window.clearTimeout(id);
  }, []);

  // Real lobby stats (presence + paid withdrawals) — refresh quietly
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch('/api/stats', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.success || data.ok)) {
          const n = Number(data.online ?? data.onlinePlayers ?? 0);
          setOnline(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
          const paid = Number(data.payouts24h ?? 0);
          setPayouts24h(Number.isFinite(paid) && paid > 0 ? paid : 0);
        }
      } catch {
        // keep last known — do not invent a lobby
      }
    };
    void pull();
    const timer = window.setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Fetch availability
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

  // Fetch active contests
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

  // Fetch active tournaments
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/tournaments', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setTournaments([]);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setTournaments(Array.isArray(json.tournaments) ? json.tournaments : []);
      } catch {
        if (!cancelled) setTournaments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const activeTournaments = useMemo(() => {
    if (!tournaments) return [];
    return tournaments.filter((t) => t.live || t.endsAt > Date.now());
  }, [tournaments]);

  const activeContests = useMemo(() => {
    if (!contests) return [];
    return contests.filter(
      (c) =>
        (c.visibility === 'public' || c.visibility === 'global') &&
        (c.state === 'live' || c.state === 'scheduled') &&
        c.endsAt > Date.now()
    );
  }, [contests]);

  const isGameVisible = (gameId: string) => {
    const hidden = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;
    if (hidden[gameId] && !isAdmin) return false;
    return true;
  };

  const filteredGames = useMemo(() => {
    let list = IN_APP_GAMES.filter((g) => isGameVisible(g.id));

    if (activeCategory === 'crash') {
      list = list.filter((g) => g.id === 'crash');
    } else if (activeCategory === 'cards') {
      list = list.filter((g) => g.id === 'blackjack' || g.id === 'hilo');
    } else if (activeCategory === 'wheel_cases') {
      list = list.filter((g) => g.id === 'wheel' || g.id === 'cases');
    } else if (activeCategory === 'arcades') {
      list = list.filter((g) => g.id === 'mines' || g.id === 'keno');
    } else if (activeCategory === 'pvp') {
      list = list.filter((g) => g.id === 'coinflip' || g.id === 'macvpot');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }

    return list;
  }, [availability, activeCategory, searchQuery]);

  return (
    <main className="min-h-screen w-full bg-[#09090b] text-frost-white selection:bg-amber-500/30 selection:text-amber-200">
      <GameTopBar
        title={t('nav.home')}
        width="wide"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <motion.div
        className="mx-auto w-full max-w-[480px] sm:max-w-[640px] md:max-w-[960px] lg:max-w-[1200px] xl:max-w-[1360px] px-3.5 sm:px-6 lg:px-8 pt-3 pb-28 flex flex-col gap-5 sm:gap-6"
        initial={skipEntrance ? false : 'hidden'}
        animate={lobbyReady ? 'show' : 'hidden'}
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: reduceMotion || skipEntrance ? 0 : 0.07,
              delayChildren: reduceMotion || skipEntrance ? 0 : 0.05,
            },
          },
        }}
      >
        {/* Featured Events Showcase (Tournaments, Contests, or Hero Game - previous mechanics restored) */}
        <ActiveEventsShowcase
          tournaments={activeTournaments}
          contests={activeContests}
          router={router}
          showMacvJet={isGameVisible('crash')}
        />

        {/* Search (Mobile Only) & Category Navigation Pills */}
        <EntranceBlock>
          <div className="flex flex-col gap-3">
            {/* Mobile Search Input */}
            <div className="relative w-full lg:hidden">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400/60 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск игр, провайдеров..."
                className="w-full h-11 pl-11 pr-9 rounded-2xl border border-amber-500/20 bg-black/60 text-[13px] font-roobert text-frost-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-400/60 focus:bg-black/80 transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-whisper-gray transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category Navigation Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <CategoryTab
                active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                icon={<Sparkles size={14} className={activeCategory === 'all' ? 'text-black' : 'text-amber-400'} />}
                label="Все игры"
              />
              <CategoryTab
                active={activeCategory === 'crash'}
                onClick={() => setActiveCategory('crash')}
                icon={<Flame size={14} className={activeCategory === 'crash' ? 'text-black' : 'text-red-400'} />}
                label="Краш"
              />
              <CategoryTab
                active={activeCategory === 'cards'}
                onClick={() => setActiveCategory('cards')}
                icon={<Spade size={14} className={activeCategory === 'cards' ? 'text-black' : 'text-amber-400'} />}
                label="Карточные"
              />
              <CategoryTab
                active={activeCategory === 'wheel_cases'}
                onClick={() => setActiveCategory('wheel_cases')}
                icon={<Disc3 size={14} className={activeCategory === 'wheel_cases' ? 'text-black' : 'text-amber-400'} />}
                label="Рулетка & Кейсы"
              />
              <CategoryTab
                active={activeCategory === 'arcades'}
                onClick={() => setActiveCategory('arcades')}
                icon={<Bomb size={14} className={activeCategory === 'arcades' ? 'text-black' : 'text-cyan-400'} />}
                label="Аркады"
              />
              <CategoryTab
                active={activeCategory === 'pvp'}
                onClick={() => setActiveCategory('pvp')}
                icon={<Trophy size={14} className={activeCategory === 'pvp' ? 'text-black' : 'text-purple-400'} />}
                label="PvP & Джекпот"
              />
            </div>
          </div>
        </EntranceBlock>

        {/* Section Header: Crown + "Все доступные игры" */}
        <EntranceBlock>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <h2 className="font-brand font-bold text-lg sm:text-xl text-white tracking-wide">
                Все доступные игры
              </h2>
            </div>
            {activeCategory !== 'all' && (
              <button
                onClick={() => setActiveCategory('all')}
                className="font-roobert text-[12px] text-amber-400/90 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Показать все</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </EntranceBlock>

        {/* Exact Layout Grid: Row 1 (3 items), Rows 2-4 (2 items each) */}
        <EntranceBlock>
          {filteredGames.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-amber-500/20 bg-[#121217]">
              <p className="font-roobert text-[14px] text-zinc-400">
                Игры не найдены
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="mt-3 text-[12px] text-amber-300 underline hover:opacity-80 font-roobert"
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 lg:gap-4">
              {filteredGames.map((g) => {
                const isAllDefault = activeCategory === 'all' && !searchQuery.trim();
                const colSpan = isAllDefault
                  ? (GAME_COL_SPAN[g.id] ?? 'col-span-1')
                  : 'col-span-3 sm:col-span-1 lg:col-span-1';

                return (
                  <div key={g.id} className={colSpan}>
                    <GameTile
                      game={g}
                      router={router}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </EntranceBlock>

        {/* Quick Action Utility Cards (Balance & Bonuses) */}
        <EntranceBlock>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <QuickAction
              icon={<Wallet size={20} strokeWidth={1.8} />}
              label="Управление балансом"
              sublabel="Пополнение счета и быстрый вывод средств"
              onClick={() => router.push('/balance')}
            />
            <QuickAction
              icon={<Gift size={20} strokeWidth={1.8} />}
              label="Бонусы и акции"
              sublabel="Активируйте промокоды, кэшбэк и призы"
              onClick={() => router.push('/bonuses')}
            />
          </div>
        </EntranceBlock>

        {/* Clean Brand Footer styled like DesktopSidebar */}
        <EntranceBlock>
          <div className="pt-6 pb-4 border-t border-white/10 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2.5">
              <BrandMark variant="gradient" size={28} />
              <div className="font-brand font-black text-xl sm:text-2xl tracking-wider flex items-center leading-none">
                <span className="text-white">Macv</span>
                <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  Bet
                </span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 font-roobert">
              Играйте ответственно • 18+
            </p>
          </div>
        </EntranceBlock>
      </motion.div>
    </main>
  );
}

function EntranceBlock({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { duration: reduceMotion ? 0.15 : 0.32, ease: [0.22, 1, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

const GAME_TAG: Record<string, TxKey> = {
  crash: 'home.tag.crash',
  mines: 'home.tag.mines',
  hilo: 'home.tag.hilo',
  coinflip: 'home.tag.coinflip',
  macvpot: 'home.tag.macvpot',
  blackjack: 'home.tag.blackjack',
  wheel: 'home.tag.wheel',
  cases: 'home.tag.cases',
  keno: 'home.tag.keno',
};

const GAME_GLOW: Record<string, string> = {
  crash:
    'radial-gradient(120% 90% at 100% 100%, rgba(165, 45, 37, 0.40) 0%, transparent 70%)',
  mines:
    'radial-gradient(110% 90% at 0% 100%, rgba(148, 163, 184, 0.24) 0%, transparent 70%)',
  hilo:
    'radial-gradient(110% 90% at 100% 100%, rgba(56, 189, 248, 0.24) 0%, transparent 70%)',
  coinflip:
    'radial-gradient(110% 90% at 50% 100%, rgba(251, 191, 36, 0.24) 0%, transparent 70%)',
  macvpot:
    'radial-gradient(110% 90% at 100% 100%, rgba(168, 85, 247, 0.30) 0%, transparent 70%)',
  blackjack:
    'radial-gradient(110% 90% at 0% 100%, rgba(160, 224, 171, 0.20) 0%, transparent 70%)',
  wheel:
    'radial-gradient(110% 90% at 100% 100%, rgba(255, 172, 46, 0.34) 0%, transparent 70%)',
  cases:
    'radial-gradient(110% 90% at 100% 100%, rgba(52, 211, 153, 0.30) 0%, transparent 70%)',
  keno:
    'radial-gradient(110% 90% at 0% 100%, rgba(139, 92, 246, 0.26) 0%, transparent 70%)',
};

function GameTile({
  game,
  router,
}: {
  game: InAppGame;
  router: ReturnType<typeof useRouter>;
}) {
  const isCrash = game.id === 'crash';

  return (
    <Pressable
      onClick={() => router.push(game.href)}
      className={cn(
        "w-full h-[130px] sm:h-[155px] md:h-[180px] lg:h-[200px] xl:h-[215px] flex items-center justify-center group relative text-left active:scale-[0.97] transition-all duration-300 cursor-pointer"
      )}
    >
      {/* Floor Spotlight glow (pure ambient light under the 3D model) */}
      <div
        aria-hidden
        className="absolute bottom-0 inset-x-6 h-10 rounded-full blur-xl opacity-25 group-hover:opacity-60 transition-opacity pointer-events-none"
        style={{
          background:
            GAME_GLOW[game.id] ??
            'radial-gradient(110% 90% at 50% 100%, rgba(212, 175, 55, 0.25) 0%, transparent 70%)',
        }}
      />

      {/* MacvJet animated downward smoke effect */}
      {isCrash && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible z-0">
          <div className="relative w-full h-full max-w-[240px] max-h-[190px] flex items-center justify-center">
            {/* Thruster core hot glow */}
            <div className="absolute top-[52%] inset-x-10 h-8 bg-amber-500/20 blur-xl rounded-full group-hover:bg-amber-500/35 transition-colors" />

            {/* Thruster nozzle flames pulsing right under nozzles */}
            <div className="macvjet-flame-left absolute top-[52%] left-[29%] w-3.5 h-7 bg-gradient-to-b from-cyan-400 via-emerald-400/80 to-transparent rounded-full blur-[2px] origin-top" />
            <div className="macvjet-flame-center absolute top-[54%] left-[47%] w-4 h-9 bg-gradient-to-b from-yellow-300 via-amber-400/90 to-transparent rounded-full blur-[2px] origin-top" />
            <div className="macvjet-flame-right absolute top-[52%] right-[29%] w-3.5 h-7 bg-gradient-to-b from-orange-400 via-red-500/80 to-transparent rounded-full blur-[2px] origin-top" />

            {/* Downward flowing smoke plumes */}
            <div className="macvjet-smoke-1 absolute top-[56%] left-[45%] w-8 h-8 rounded-full bg-gradient-to-b from-amber-200/40 via-white/20 to-transparent blur-[6px]" />
            <div className="macvjet-smoke-2 absolute top-[54%] left-[30%] w-7 h-7 rounded-full bg-gradient-to-b from-cyan-200/30 via-slate-400/20 to-transparent blur-[6px]" />
            <div className="macvjet-smoke-3 absolute top-[54%] right-[30%] w-7 h-7 rounded-full bg-gradient-to-b from-orange-200/30 via-slate-400/20 to-transparent blur-[6px]" />
            <div className="macvjet-smoke-4 absolute top-[58%] left-[38%] w-10 h-10 rounded-full bg-gradient-to-b from-white/25 via-zinc-400/15 to-transparent blur-[8px]" />
            <div className="macvjet-smoke-5 absolute top-[58%] left-[48%] w-9 h-9 rounded-full bg-gradient-to-b from-amber-100/25 via-zinc-400/15 to-transparent blur-[7px]" />
          </div>
        </div>
      )}

      {/* 3D Game Object (transparent floating with drop shadow and hover lift) */}
      {game.bg && (
        <img
          src={game.bg}
          alt={game.name}
          className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.85)] group-hover:scale-105 group-hover:-translate-y-1 group-hover:drop-shadow-[0_20px_35px_rgba(255,172,46,0.35)] transition-all duration-300 pointer-events-none select-none"
        />
      )}
    </Pressable>
  );
}

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
      className={`px-3.5 sm:px-4 py-2 rounded-xl text-[12px] sm:text-[13px] font-roobert flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
        active
          ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-black font-bold shadow-md shadow-amber-500/20 scale-[1.02]'
          : 'bg-[#121217] text-zinc-300 hover:bg-[#181820] hover:text-white border border-amber-500/15'
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
    <Pressable
      onClick={onClick}
      className="group rounded-2xl border border-amber-500/20 bg-[#121217] hover:border-amber-400/50 hover:bg-[#16161d] px-4 py-4 sm:px-5 sm:py-5 text-left flex items-center justify-between gap-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-roobert text-[14px] sm:text-[15px] leading-tight text-frost-white font-bold group-hover:text-amber-300 transition-colors">
            {label}
          </div>
          <div className="mt-1 font-roobert text-[11px] text-zinc-400 truncate">
            {sublabel}
          </div>
        </div>
      </div>
      <div className="w-8 h-8 rounded-full border border-amber-500/30 bg-white/[0.04] flex items-center justify-center text-amber-300 group-hover:border-amber-400 group-hover:scale-105 transition-all shrink-0">
        <ArrowRight size={14} strokeWidth={2.2} />
      </div>
    </Pressable>
  );
}

function ActiveEventsShowcase({
  tournaments,
  contests,
  router,
  showMacvJet,
}: {
  tournaments: HeroTournament[];
  contests: HeroContest[];
  router: ReturnType<typeof useRouter>;
  showMacvJet: boolean;
}) {
  const hasTournaments = tournaments.length > 0;
  const hasContests = contests.length > 0;

  if (!hasTournaments && !hasContests) {
    if (!showMacvJet) return null;
    return <MacvJetHero onOpen={() => router.push('/game/crash')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Event Header Strip */}
      <div className="flex items-center justify-between px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-amber-300/90 flex items-center gap-1.5">
          <Trophy size={13} className="text-[#ffac2e]" strokeWidth={2.2} />
          Активные события
        </span>
        <button
          onClick={() => router.push('/bonuses')}
          className="font-roobert text-[11px] text-whisper-gray hover:text-frost-white flex items-center gap-1 transition-colors"
        >
          <span>Все события</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {/* Events Carousel / Grid */}
      <div className="flex flex-col gap-3">
        {tournaments.slice(0, 2).map((t) => (
          <TournamentHeroCard
            key={t.id}
            tournament={t}
            onClick={() => router.push(`/tournaments/${t.id}`)}
          />
        ))}

        {contests.slice(0, 2).map((c) => (
          <ContestHero
            key={c.id}
            contest={c}
            onClick={() => router.push('/bonuses#contests')}
          />
        ))}
      </div>
    </div>
  );
}

function TournamentHeroCard({
  tournament,
  onClick,
}: {
  tournament: HeroTournament;
  onClick: () => void;
}) {
  const remainingMs = Math.max(0, tournament.endsAt - Date.now());
  const remaining = formatRemainingShort(remainingMs);

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-amber-500/30 bg-midnight-canvas text-left active:scale-[0.98] hover:border-amber-500/50 transition-all shadow-xl"
    >
      {tournament.bannerUrl && (
        <img
          src={tournament.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none group-hover:scale-105 transition-transform duration-500"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 mix-blend-screen pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 100% at 100% 100%, rgba(255, 172, 46, 0.32) 0%, rgba(160, 224, 171, 0.14) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col gap-2.5 z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-300 text-[9px] sm:text-[10px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md">
            <Trophy size={10} className="text-amber-400" strokeWidth={2.2} />
            Турнир {tournament.gameType ? `· ${tournament.gameType.toUpperCase()}` : ''}
          </span>
          <span className="font-roobert text-[10px] sm:text-[11px] text-amber-200/90 font-medium tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            до конца {remaining}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[17px] sm:text-[20px] font-semibold leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
              {tournament.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-roobert text-[11px] text-whisper-gray tabular-nums">
              <span>
                Призовой фонд:{' '}
                <span className="text-amber-300 font-bold">
                  {tournament.prizePool.toLocaleString('ru-RU', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  zł
                </span>
              </span>
              <span>·</span>
              <span>
                Взнос: {tournament.entryFee > 0 ? `${tournament.entryFee} zł` : 'Бесплатно'}
              </span>
            </div>
          </div>
          <span className="shrink-0 w-8 h-8 rounded-lg border border-amber-500/40 bg-amber-500/15 flex items-center justify-center backdrop-blur-md text-amber-300 group-hover:scale-105 transition-transform">
            <ArrowRight size={15} strokeWidth={2.2} />
          </span>
        </div>
      </div>
    </button>
  );
}

function ContestHero({
  contest,
  onClick,
}: {
  contest: HeroContest;
  onClick: () => void;
}) {
  const { t } = useT();
  const remainingMs = Math.max(0, contest.endsAt - Date.now());
  const remaining = formatRemainingShort(remainingMs);
  return (
    <Pressable
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-purple-500/30 bg-midnight-canvas text-left active:scale-[0.98] hover:border-purple-500/50 transition-all shadow-xl"
    >
      {contest.bannerUrl ? (
        <img
          src={contest.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none group-hover:scale-105 transition-transform duration-500"
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-55 mix-blend-screen pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 100% at 100% 100%, rgba(168, 85, 247, 0.30) 0%, rgba(255, 172, 46, 0.16) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col gap-2.5 z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/20 text-purple-300 text-[9px] sm:text-[10px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md">
            <Gift size={10} className="text-purple-300" strokeWidth={2.2} />
            {contest.visibility === 'global'
              ? 'Глобальный конкурс'
              : 'Активный конкурс'}
          </span>
          <span className="font-roobert text-[10px] sm:text-[11px] text-purple-200/90 font-medium tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            до конца {remaining}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[17px] sm:text-[20px] font-semibold leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-purple-200 transition-colors">
              {contest.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-roobert text-[11px] text-purple-200/80 tabular-nums">
              <span>
                Призовой фонд:{' '}
                <span className="text-purple-300 font-bold">
                  {contest.prizePool.toLocaleString('ru-RU', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  zł
                </span>
              </span>
              <span>·</span>
              <span>Победителей: {contest.winnersCount}</span>
            </div>
          </div>
          <span className="shrink-0 w-8 h-8 rounded-lg border border-purple-500/40 bg-purple-500/15 flex items-center justify-center backdrop-blur-md text-purple-300 group-hover:scale-105 transition-transform">
            <ArrowRight size={15} strokeWidth={2.2} />
          </span>
        </div>
      </div>
    </Pressable>
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
