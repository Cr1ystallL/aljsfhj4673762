'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Crown,
  Flame,
  Gamepad2,
  Gem,
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
import { GameIcon, gameLabel, type GameKey } from '@/components/ui/game-icon';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/i18n/use-t';
import type { TxKey } from '@/i18n/use-t';

/**
 * Home Screen — Apple & Taste-Skill Premium Casino Menu (V3)
 *
 * Improvements in V3:
 *   - Search SVG: High-contrast stroke with amber accent (text-amber-400 stroke-[2.2]).
 *   - Live Dynamic Online: Fluctuates online count live every 3.5s with online multiplier rules.
 *   - Realistic Payouts: Realistic confirmed payouts base (~2,840 zł).
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
    bg: '/MacvJet.png',
    badge: { label: 'TOP', color: 'red', Icon: Flame },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'mines',
    name: 'Mines',
    href: '/game/mines',
    bg: '/Mines.png',
    badge: { label: 'HOT', color: 'gold', Icon: Sparkles },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'hilo',
    name: 'Hi-Lo',
    href: '/game/hilo',
    bg: '/hilo.png',
    wide: true,
    badge: { label: 'FAST', color: 'cyan', Icon: Zap },
    category: 'fast',
  },
  {
    id: 'coinflip',
    name: 'Coinflip',
    href: '/game/coinflip',
    bg: '/Coinflip.png',
    badge: { label: '50/50', color: 'cyan', Icon: Gem },
    category: 'fast',
  },
  {
    id: 'macvpot',
    name: 'MacvPot',
    href: '/game/macvpot',
    bg: '/MacvPot.png',
    badge: { label: 'JACKPOT', color: 'purple', Icon: Trophy },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    href: '/game/blackjack',
    bg: '/bj.png',
    wide: true,
    badge: { label: 'PRO', color: 'gold', Icon: Crown },
    category: 'table',
  },
  {
    id: 'wheel',
    name: 'Wheel',
    href: '/game/wheel',
    bg: '/Wheel.png',
    badge: { label: 'x50', color: 'gold', Icon: Zap },
    isPopular: true,
    category: 'fast',
  },
  {
    id: 'cases',
    name: 'Case',
    href: '/game/cases',
    bg: '/case.png',
    wide: true,
    badge: { label: 'BONUS', color: 'green', Icon: Gift },
    category: 'fast',
  },
  {
    id: 'keno',
    name: 'Keno',
    href: '/game/keno',
    bg: '/keno.png?v=2',
    badge: { label: 'LOTTO', color: 'purple', Icon: Layers },
    category: 'table',
  },
];

function calculateDisplayOnline(actual: number): number {
  if (actual >= 1 && actual <= 5) return actual * 3;
  if (actual >= 6 && actual <= 10) return actual * 2;
  if (actual >= 11 && actual <= 30) return actual * 2;
  return actual;
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

  // Dynamic live online state
  const [rawOnline, setRawOnline] = useState<number>(6);
  const [payouts24h, setPayouts24h] = useState<number>(2840);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchBalance();
  }, [fetchBalance, isAuthenticated]);

  // Initial stats fetch
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/stats', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success) {
          setRawOnline(data.rawOnline ?? 6);
          setPayouts24h(data.payouts24h ?? 2840);
        }
      } catch {
        // fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fluctuate raw online live every 3.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setRawOnline((prev) => {
        const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
        const next = prev + delta;
        return Math.max(3, Math.min(next, 18));
      });
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const displayOnline = useMemo(() => {
    return calculateDisplayOnline(rawOnline);
  }, [rawOnline]);

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

  const isGameVisible = (gameId: string) => {
    const hidden = availability?.hidden ?? {};
    const isAdmin = availability?.isAdmin ?? false;
    if (gameId === 'blackjack' && !isAdmin) {
      return false;
    }
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

      <div className={`mx-auto w-full ${PAGE_WIDTH.wide} px-4 pt-3 pb-32 flex flex-col gap-5`}>
        {/* Live Casino Social Proof Ticker */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-2 text-[12px] font-roobert shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            </span>
            <span className="text-frost-white font-medium tracking-tight transition-all duration-300">
              {t('home.online', { n: displayOnline })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-300 font-semibold tracking-tight">
            <TrendingUp size={14} strokeWidth={2.2} className="text-amber-400" />
            <span>
              {t('home.payouts24h', {
                amount: payouts24h.toLocaleString(localeTag),
              })}
            </span>
          </div>
        </div>

        {/* Hero Section — Contest or MacvJet fallback */}
        {heroContest ? (
          <ContestHero
            contest={heroContest}
            onClick={() => router.push('/bonuses#contests')}
          />
        ) : (
          isGameVisible('crash') && (
            <MacvJetHero onClick={() => router.push('/game/crash')} />
          )
        )}

        {/* Search & Category Filter Section */}
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
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none drop-shadow-sm"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="w-full h-11 pl-11 pr-9 rounded-2xl border border-white/15 bg-black/40 text-[13px] font-roobert text-frost-white placeholder:text-whisper-gray/70 focus:outline-none focus:border-amber-400/50 focus:bg-black/60 transition-all backdrop-blur-xl shadow-inner"
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

        {/* Section Label */}
        <div className="flex items-baseline justify-between px-1">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
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

        {/* In-App Games Grid Only */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredGames.map((g, i) => (
              <GameTile key={g.id} game={g} index={i} router={router} />
            ))}
          </div>
        )}

        {/* Quick Actions */}
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

        {/* Footer brand lockup */}
        <div className="pt-6 flex items-center justify-center">
          <BrandLockup size={64} />
        </div>
      </div>
    </main>
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

function GameTile({
  game,
  index,
  router,
}: {
  game: InAppGame;
  index: number;
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useT();
  const BadgeIcon = game.badge?.Icon;
  const tag = GAME_TAG[game.id];

  return (
    <Pressable
      onClick={() => router.push(game.href)}
      className={`group relative overflow-hidden rounded-[20px] border border-white/10 bg-midnight-canvas ${
        game.wide ? 'col-span-2 aspect-[16/9]' : 'aspect-[5/6]'
      } text-left hover:border-white/25 shadow-lg`}
    >
      {game.bg && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-70 group-hover:opacity-90 transition-opacity duration-300"
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
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.85) 100%)',
        }}
      />

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

      <div className="relative h-full w-full p-4 flex flex-col justify-between z-10">
        <div className="flex items-start justify-between gap-2">
          <span className="w-10 h-10 rounded-xl border border-white/15 bg-black/40 backdrop-blur-md flex items-center justify-center text-frost-white shadow-inner group-hover:scale-105 transition-transform duration-200">
            <GameIcon game={game.id} size={20} strokeWidth={1.5} />
          </span>

          {game.badge && (
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-roobert font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm flex items-center gap-1 ${
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
              {BadgeIcon && <BadgeIcon size={10} className="shrink-0 stroke-[2]" />}
              <span>{game.badge.label}</span>
            </span>
          )}
        </div>

        <div>
          <div className="font-roobert text-[19px] sm:text-[20px] font-medium leading-tight text-frost-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:text-amber-200 transition-colors">
            {game.name}
          </div>
          <div className="mt-0.5 font-roobert text-[10px] text-frost-white/55 tracking-[0.08em] uppercase">
            {tag ? t(tag) : game.name}
          </div>
        </div>
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
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-roobert flex items-center gap-1.5 shrink-0 transition-all active:scale-[0.96] ${
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
            ? t('home.globalTournament')
            : t('home.contest')}
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
  const { t } = useT();
  return (
    <Pressable
      onClick={onClick}
      className="relative overflow-hidden rounded-[20px] border border-white/15 bg-midnight-canvas text-left hover:border-white/30 shadow-xl w-full"
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
          {t('home.heroKicker')}
        </span>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-roobert text-frost-white text-[36px] sm:text-[44px] font-normal leading-none tracking-[-0.03em]">
              MacvJet
            </div>
            <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
              {t('home.heroCrashSub')}
            </div>
          </div>
          <span className="shrink-0 w-11 h-11 rounded-xl border border-white/25 bg-white/[0.08] flex items-center justify-center backdrop-blur-md text-frost-white">
            <ArrowRight size={18} strokeWidth={1.8} />
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

function getGamesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'игр';
  if (mod10 === 1) return 'игра';
  if (mod10 >= 2 && mod10 <= 4) return 'игры';
  return 'игр';
}
