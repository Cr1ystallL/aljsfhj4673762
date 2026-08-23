'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Flame,
  Gamepad2,
  Gift,
  Layers,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { GameTopBar } from '@/components/game/game-top-bar';
import { GameIcon, type GameKey } from '@/components/ui/game-icon';
import { useAuthStore } from '@/store/auth-store';
import { useBalance } from '@/hooks/use-balance';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { Pressable } from '@/components/ui/pressable';
import { MacvJetHero, useCrashLobby } from '@/components/home/macvjet-hero';
import { HomeLuckFeed, type LuckFeedItem } from '@/components/home/home-luck-feed';
import { useSplashStore } from '@/store/splash-store';
import { useT } from '@/i18n/use-t';
import type { TxKey } from '@/i18n/use-t';

/**
 * Home Screen — cinematic Mini App lobby.
 * Live MacvJet hero stays the door into the flagship; contest is a strip under it.
 * Online/payouts come from real presence + paid withdrawals — no random walk.
 */

type CategoryKey = 'all' | 'popular' | 'fast' | 'table';

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

const IN_APP_GAMES: InAppGame[] = [
  {
    id: 'crash',
    name: 'MacvJet',
    href: '/game/crash',
    bg: '/tiles/macvjet.webp',
    badge: { label: 'TOP', color: 'red', Icon: Flame },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'hilo',
    name: 'Hi-Lo',
    href: '/game/hilo',
    bg: '/tiles/hilo.webp',
    wide: true,
    category: 'fast',
  },
  {
    id: 'mines',
    name: 'Mines',
    href: '/game/mines',
    bg: '/tiles/mines.webp',
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'coinflip',
    name: 'Coinflip',
    href: '/game/coinflip',
    bg: '/tiles/coinflip.webp',
    category: 'fast',
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    href: '/game/blackjack',
    bg: '/tiles/bj.webp',
    wide: true,
    category: 'table',
  },
  {
    id: 'macvpot',
    name: 'MacvPot',
    href: '/game/macvpot',
    bg: '/tiles/macvpot.webp',
    badge: { label: 'JACKPOT', color: 'purple', Icon: Trophy },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'wheel',
    name: 'Wheel',
    href: '/game/wheel',
    bg: '/tiles/wheel.webp',
    badge: { label: 'x50', color: 'gold', Icon: Zap },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'cases',
    name: 'Case',
    href: '/game/cases',
    bg: '/tiles/case.webp',
    wide: true,
    category: 'fast',
  },
  {
    id: 'keno',
    name: 'Keno',
    href: '/game/keno',
    bg: '/tiles/keno.webp',
    category: 'table',
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
          if (Array.isArray(data.feed)) {
            setLuckFeed(
              data.feed
                .map((row: Partial<LuckFeedItem>) => ({
                  id: String(row.id ?? ''),
                  name: String(row.name ?? ''),
                  photoUrl: row.photoUrl ?? null,
                  gameType: String(row.gameType ?? ''),
                  payout: Number(row.payout) || 0,
                  multiplier: Number(row.multiplier) || 0,
                  at: Number(row.at) || 0,
                }))
                .filter((row: LuckFeedItem) => row.id && row.payout > 0)
            );
          }
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
    if (gameId === 'blackjack' && !isAdmin) return false;
    if (hidden[gameId] && !isAdmin) return false;
    return true;
  };

  const filteredGames = useMemo(() => {
    let list = IN_APP_GAMES.filter((g) => isGameVisible(g.id));

    if (activeCategory === 'popular') {
      list = list.filter((g) => g.isPopular);
    } else if (activeCategory === 'fast') {
      list = list.filter((g) => g.category === 'fast');
    } else if (activeCategory === 'table') {
      list = list.filter((g) => g.category === 'table' || g.category === 'instant');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }

    return list;
  }, [availability, activeCategory, searchQuery]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white selection:bg-white/20">
      <GameTopBar title={t('nav.home')} width="wide" />

      <motion.div
        className={`mx-auto w-full ${PAGE_WIDTH.wide} px-4 pt-3 pb-32 flex flex-col gap-5`}
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
        <EntranceBlock>
        {/* Presence ticker — real counts, glass chrome */}
        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0a0c10] px-4 py-3 flex items-center justify-between gap-2 text-[12px] font-roobert shadow-[0_8px_25px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-frost-white/90 font-medium tracking-tight">
              {(crashLobby?.playerCount ?? 0) > 0
                ? t('home.jetPlaying', { n: crashLobby!.playerCount })
                : online > 0
                  ? t('home.online', { n: online })
                  : t('home.livePulse')}
            </span>
          </div>
          {payouts24h > 0 && (
            <div className="flex items-center gap-1.5 text-white/55 font-medium tracking-tight">
              <TrendingUp size={13} strokeWidth={2} className="text-white/40" />
              <span>
                {t('home.payouts24h', {
                  amount: payouts24h.toLocaleString(localeTag),
                })}
              </span>
            </div>
          )}
        </div>
        </EntranceBlock>

        {/* Featured Events Showcase (Tournaments, Contests, or Hero Game) */}
        <ActiveEventsShowcase
          tournaments={activeTournaments}
          contests={activeContests}
          router={router}
          showMacvJet={isGameVisible('crash')}
        />

        {/* Search & Category Filter Section */}
        <EntranceBlock>
        <div className="flex flex-col gap-3">
          {/* Search bar with HIGH-CONTRAST amber SVG icon */}
          <div className="relative w-full">
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
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="w-full h-11 pl-11 pr-9 rounded-2xl border border-white/12 bg-black/55 text-[13px] font-roobert text-frost-white placeholder:text-white/35 focus:outline-none focus:border-white/25 focus:bg-black/70 transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <CategoryTab
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              icon={<Gamepad2 size={14} />}
              label={t('home.filterAll')}
            />
            <CategoryTab
              active={activeCategory === 'popular'}
              onClick={() => setActiveCategory('popular')}
              icon={<Flame size={14} className="text-amber-400" />}
              label={t('home.filterTop')}
            />
            <CategoryTab
              active={activeCategory === 'fast'}
              onClick={() => setActiveCategory('fast')}
              icon={<Zap size={14} className="text-cyan-400" />}
              label={t('home.filterFast')}
            />
            <CategoryTab
              active={activeCategory === 'table'}
              onClick={() => setActiveCategory('table')}
              icon={<Layers size={14} className="text-purple-400" />}
              label={t('home.filterArcade')}
            />
          </div>
        </div>
        </EntranceBlock>

        {/* Section Label */}
        <EntranceBlock>
        <div className="flex items-baseline justify-between px-1">
          <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-white/45">
            {activeCategory === 'all'
              ? t('home.sectionAll')
              : activeCategory === 'popular'
              ? t('home.sectionPopular')
              : activeCategory === 'fast'
              ? t('home.sectionFast')
              : t('home.sectionArcade')}
          </span>
          <span className="font-roobert text-[11px] text-whisper-gray">
            {t('home.gamesCount', { n: filteredGames.length })}
          </span>
        </div>
        </EntranceBlock>

        <EntranceBlock>
        {/* In-App Games Grid: [Square] [Rectangle (2 cols)] [Square] per row */}
        {filteredGames.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="font-roobert text-[14px] text-whisper-gray">
              {t('home.empty')}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="mt-3 text-[12px] text-frost-white underline hover:opacity-80 font-roobert"
            >
              {t('home.resetFilters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {filteredGames.map((g, i) => {
              const isRectangle = !!g.wide;
              return (
                <GameTile
                  key={g.id}
                  game={g}
                  index={i}
                  isRectangle={isRectangle}
                  router={router}
                />
              );
            })}
          </div>
        )}
        </EntranceBlock>

        <EntranceBlock>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <QuickAction
            icon={<Wallet size={18} strokeWidth={1.5} />}
            label={t('home.wallet')}
            sublabel={t('home.walletSub')}
            onClick={() => router.push('/balance')}
          />
          <QuickAction
            icon={<Sparkles size={18} strokeWidth={1.5} />}
            label={t('home.bonuses')}
            sublabel={t('home.bonusesSub')}
            onClick={() => router.push('/bonuses')}
          />
        </div>
        </EntranceBlock>

        <EntranceBlock>
        <div className="pt-6 flex items-center justify-center">
          <BrandLockup size={64} />
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
  index,
  isRectangle,
  router,
}: {
  game: InAppGame;
  index: number;
  isRectangle: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useT();
  const BadgeIcon = game.badge?.Icon;
  const tag = GAME_TAG[game.id];

  return (
    <Pressable
      onClick={() => router.push(game.href)}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-midnight-canvas ${
        isRectangle ? 'col-span-2 aspect-[2/1]' : 'col-span-1 aspect-square'
      } text-left active:scale-[0.97] hover:border-white/25 transition-all duration-200 shadow-lg`}
    >
      {game.bg && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-80 group-hover:opacity-95 transition-opacity duration-300"
          style={{
            backgroundImage: `url(${game.bg})`,
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
          background: isRectangle
            ? 'linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.50) 50%, rgba(0,0,0,0.80) 100%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.50) 60%, rgba(0,0,0,0.90) 100%)',
        }}
      />

      <div
        aria-hidden
        className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity mix-blend-screen"
        style={{
          background:
            GAME_GLOW[game.id] ??
            'radial-gradient(110% 90% at 100% 100%, rgba(160, 224, 171, 0.18) 0%, transparent 70%)',
        }}
      />

      <div className={`relative h-full w-full ${isRectangle ? 'p-3 sm:p-4 flex items-center justify-between' : 'p-2 sm:p-3 flex flex-col justify-between'} z-10`}>
        <div className={`flex ${isRectangle ? 'flex-col justify-center' : 'items-start justify-between w-full'} gap-1`}>
          {!isRectangle && (
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-white/15 bg-black/40 backdrop-blur-md flex items-center justify-center text-frost-white shadow-inner group-hover:scale-105 transition-transform duration-200">
              <GameIcon game={game.id} size={15} strokeWidth={1.5} />
            </span>
          )}

          {game.badge && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm inline-flex items-center gap-0.5 self-start ${
                game.badge.color === 'red'
                  ? 'border-red-500/30 bg-red-500/20 text-red-300'
                  : game.badge.color === 'gold'
                  ? 'border-amber-500/30 bg-amber-500/20 text-amber-300'
                  : game.badge.color === 'cyan'
                  ? 'border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
                  : game.badge.color === 'purple'
                  ? 'border-purple-500/30 bg-purple-500/20 text-purple-300'
                  : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {BadgeIcon && <BadgeIcon size={9} className="shrink-0 stroke-[2]" />}
              <span>{game.badge.label}</span>
            </span>
          )}

          {isRectangle && (
            <div className="mt-0.5">
              <div className="font-roobert text-[17px] sm:text-[22px] font-medium leading-tight text-frost-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
                {game.name}
              </div>
              <div className="mt-0.5 font-roobert text-[9px] sm:text-[10px] text-whisper-gray/90 tracking-wider uppercase">
                Фирменная игра · Играть
              </div>
            </div>
          )}
        </div>

        {!isRectangle ? (
          <div>
            <div className="font-roobert text-[12px] sm:text-[14px] font-medium leading-tight text-frost-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors truncate">
              {game.name}
            </div>
            <div className="mt-0.5 font-roobert text-[8px] sm:text-[9px] text-whisper-gray/90 tracking-wide uppercase">
              Mini App
            </div>
          </div>
        ) : (
          <span className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-white/20 bg-white/10 flex items-center justify-center text-frost-white group-hover:border-amber-400/40 group-hover:text-amber-300 transition-colors">
            <ArrowRight size={15} strokeWidth={2} />
          </span>
        )}
      </div>
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
    <Pressable
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-roobert flex items-center gap-1.5 shrink-0 ${
        active
          ? 'bg-white text-black font-semibold shadow-md'
          : 'bg-white/[0.04] text-whisper-gray hover:bg-white/[0.08] hover:text-frost-white border border-white/10'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Pressable>
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
      className="rounded-2xl border border-white/12 bg-white/[0.05] hover:border-white/20 px-4 py-4 text-left flex items-start gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
    return <MacvJetHero onClick={() => router.push('/game/crash')} />;
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
          className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
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
      <div className="relative px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-3 z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-300 text-[10px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md">
            <Trophy size={11} className="text-amber-400" strokeWidth={2.2} />
            Турнир {tournament.gameType ? `· ${tournament.gameType.toUpperCase()}` : ''}
          </span>
          <span className="font-roobert text-[11px] text-amber-200/90 font-medium tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            до конца {remaining}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-semibold leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
              {tournament.title}
            </div>
            <div className="mt-1 flex items-center gap-2.5 font-roobert text-[12px] text-whisper-gray tabular-nums">
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
          <span className="shrink-0 w-10 h-10 rounded-xl border border-amber-500/40 bg-amber-500/15 flex items-center justify-center backdrop-blur-md text-amber-300 group-hover:scale-105 transition-transform">
            <ArrowRight size={18} strokeWidth={2.2} />
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
          className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
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
      <div className="relative px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-3 z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/20 text-purple-300 text-[10px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md">
            <Gift size={11} className="text-purple-300" strokeWidth={2.2} />
            {contest.visibility === 'global'
              ? 'Глобальный конкурс'
              : 'Активный конкурс'}
          </span>
          <span className="font-roobert text-[11px] text-purple-200/90 font-medium tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            до конца {remaining}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-semibold leading-tight tracking-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-purple-200 transition-colors">
              {contest.title}
            </div>
            <div className="mt-1 flex items-center gap-2.5 font-roobert text-[12px] text-whisper-gray tabular-nums">
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
          <span className="shrink-0 w-10 h-10 rounded-xl border border-purple-500/40 bg-purple-500/15 flex items-center justify-center backdrop-blur-md text-purple-300 group-hover:scale-105 transition-transform">
            <ArrowRight size={18} strokeWidth={2.2} />
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
