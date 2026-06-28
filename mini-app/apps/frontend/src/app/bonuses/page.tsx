'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Ticket,
  Trophy,
  Users,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * Bonuses Page — Monopo Saigon Style, redesigned.
 *
 * Layout (mobile-first):
 *   1. Top strip with brand + balance pill.
 *   2. Promo code hero — gem icon, gradient backdrop, single input,
 *      pill CTA. Mirrors the reference shot but in our brand palette.
 *   3. Lucky Wheel hero card — half-circle wheel (12 sectors) anchored
 *      at the bottom of the card, pointer is a glowing pill. The wheel
 *      sits inside the card so the surface reads as a single self-
 *      contained surface, not a separate widget. 10 spins/day, 20 min
 *      cooldown, 0.05..1.00 zł payouts. Idle drift while no spin runs.
 *   4. Recent winners ticker.
 *   5. Contests rail.
 *
 * Brand palette — Midnight Canvas, Frost White, Whisper Gray, Deep
 * Ocean gradient (green→amber→red). No external blues.
 */

interface WheelStateResponse {
  ok: true;
  sectors: number[];
  dailyCap: number;
  cooldownMs: number;
  usedToday: number;
  remaining: number;
  cooldownEndsAt: number | null;
  ticker: Array<{
    amount: number;
    at: number;
    name: string;
    photoUrl: string | null;
  }>;
}

interface TournamentRow {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  gameType: string;
  prizePool: number;
  prizeMode: 'percent' | 'fixed';
  winnersCount: number;
  fixedPrize: number | null;
  startBalance: number;
  entryFee: number;
  startsAt: number;
  endsAt: number;
}

/* -------------------------------------------------------------------------- */
/* Tournaments                                                                */
/* -------------------------------------------------------------------------- */

function TournamentsList() {
  const [list, setList] = useState<TournamentRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tournaments', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      setList(json.tournaments as TournamentRow[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tournaments/${id}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportApiError(res, json, 'Не удалось зарегистрироваться');
        return;
      }
      toast.success('Вы зарегистрированы в турнире');
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" id="tournaments">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">Турниры</span>
        <span className="font-roobert text-[11px] text-whisper-gray">{list?.length ?? 0}</span>
      </div>

      {list === null ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-10 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
          Сейчас турниров нет. Загляните позже.
        </div>
      ) : (
        list.map((t) => (
          <TournamentCard key={t.id} tournament={t} onJoin={() => join(t.id)} busy={busyId === t.id} />
        ))
      )}
    </section>
  );
}

function TournamentCard({ tournament, onJoin, busy }: { tournament: TournamentRow; onJoin: () => void; busy: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const isBeforeStart = now < tournament.startsAt;
  const isEnded = now > tournament.endsAt;
  const targetTime = isBeforeStart ? tournament.startsAt : tournament.endsAt;
  const remainingMs = Math.max(0, targetTime - now);
  const remaining = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  // Convert ibb.co page URLs to direct URLs (approximate)
  let bannerUrl = tournament.bannerUrl;
  if (bannerUrl && bannerUrl.startsWith('https://ibb.co/')) {
    const id = bannerUrl.split('https://ibb.co/')[1]?.split('/')[0];
    if (id) {
      // Direct link from ibb.co usually looks like i.ibb.co/xxx/image.png
      // We can't know the exact file name or extension. We will just leave it and warn the admin, 
      // but let's try to handle known direct links just in case.
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => router.push(`/tournaments/${tournament.id}`)}
      className="relative overflow-hidden rounded-card border border-white/10 cursor-pointer"
    >
      {tournament.bannerUrl ? (
        <div
          aria-hidden
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `url(${tournament.bannerUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
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
        className="absolute inset-0 opacity-50 mix-blend-screen pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 90% at 100% 100%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.10) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={12} className="text-[#ffac2e]" strokeWidth={1.7} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
            Турнир · {tournament.gameType ? tournament.gameType.charAt(0).toUpperCase() + tournament.gameType.slice(1) : ''}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[18px] sm:text-[20px] leading-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {tournament.title}
            </div>
            {tournament.description && (
              <div className="mt-1 font-roobert text-[12px] text-whisper-gray line-clamp-2">
                {tournament.description}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-roobert text-frost-white text-[20px] font-light leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {tournament.prizePool.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}{' '}
              <span className="text-[12px] text-whisper-gray">zł</span>
            </div>
            <div className="mt-1 font-roobert text-[10px] text-whisper-gray tabular-nums">
              {tournament.winnersCount} победителей
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] text-whisper-gray tabular-nums">
          <span>Стартовый баланс {tournament.startBalance.toFixed(0)} TM</span>
          <span>Взнос {tournament.entryFee.toFixed(0)} zł</span>
          <span>{isEnded ? 'Завершен' : isBeforeStart ? `До начала ${remaining}` : `До конца ${remaining}`}</span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="font-roobert text-[11px] text-whisper-gray">Игра: {tournament.gameType}</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (tournament.joined || isBeforeStart) {
                router.push(`/tournaments/${tournament.id}`);
              } else {
                onJoin();
              }
            }}
            disabled={busy && !tournament.joined}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[11px] uppercase tracking-[0.2em] active:scale-[0.97] transition-transform disabled:opacity-50"
          >
            {tournament.joined || isBeforeStart ? 'К турниру' : 'Участвовать'}
            <ArrowRight size={11} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </motion.section>
  );
}

interface ContestRow {
  id: string;
  title: string;
  description: string | null;
  visibility: 'public' | 'private' | 'global';
  prizePool: number;
  winnersCount: number;
  prizeShares: unknown;
  rules: unknown;
  startsAt: number;
  endsAt: number;
  state: string;
  joined: boolean;
  participantCount: number;
  bannerUrl?: string | null;
}

export default function BonusesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const balance = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => router.push('/')}
            aria-label="Home"
            className="rounded-card transition-opacity hover:opacity-80"
          >
            <BrandLockup size={48} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-roobert text-frost-white text-[22px] font-normal leading-none truncate">
              Бонусы
            </span>
            <Sparkles size={16} className="text-frost-white/85 shrink-0" strokeWidth={1.6} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04]">
            <span className="font-roobert text-frost-white text-[12px] tabular-nums leading-none">
              {(balance?.amount ?? 0).toLocaleString('ru-RU', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="font-roobert text-whisper-gray text-[10px] leading-none">zł</span>
          </div>
        </div>

        <PromoCodeHero onRedeemed={() => void fetchBalance()} />

        <LuckyWheelHero onWin={() => void fetchBalance()} />

        <TournamentsList />

        <ContestsList currentUserId={user?.id ?? null} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Promo code hero                                                            */
/* -------------------------------------------------------------------------- */

function PromoCodeHero({ onRedeemed }: { onRedeemed: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 2) {
      toast.warn('Введите промокод');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/bonuses/promo/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportApiError(res, json, 'Не удалось активировать промокод');
        return;
      }
      toast.success(
        `+${Number(json.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`,
        { title: 'Промокод применён' }
      );
      setCode('');
      // Update store immediately + double-check via fetch.
      const balance = useBalanceStore.getState().balance;
      if (balance) useBalanceStore.getState().updateBalance(Number(json.balance ?? balance.amount));
      onRedeemed();
    } catch {
      toast.error('Ошибка сети, попробуйте снова');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-card border border-white/10">
      {/* Atmospheric backdrop — Deep Ocean tint, brighter on the right */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(160, 224, 171, 0.10) 0%, rgba(255, 172, 46, 0.18) 55%, rgba(165, 45, 37, 0.22) 100%), #0a0a0a',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-12 -left-10 w-44 h-44 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 220, 150, 0.30) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="relative grid grid-cols-[1fr_auto] gap-3 px-5 py-5 sm:px-6 sm:py-6 items-center">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            <Ticket size={11} strokeWidth={1.7} />
            Промокод
          </span>
          <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-light leading-tight">
            Активируйте код,
            <br />
            получите бонус
          </h2>
        </div>
        <Gem />
      </div>

      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6 flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="ВВЕДИТЕ КОД"
          maxLength={32}
          className="flex-1 min-w-0 h-11 px-4 rounded-pill border border-white/20 bg-black/40 backdrop-blur-md font-roobert text-[14px] tracking-[0.2em] text-frost-white placeholder:text-whisper-gray focus:outline-none focus:border-white/40"
        />
        <button
          onClick={submit}
          disabled={busy}
          className={cn(
            'h-11 px-5 rounded-pill font-roobert font-semibold text-[12px] uppercase tracking-[0.18em] text-midnight-canvas transition-all active:scale-[0.97] inline-flex items-center gap-1.5',
            busy && 'opacity-60 cursor-not-allowed'
          )}
          style={{
            background:
              'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 100%)',
            boxShadow: '0 4px 14px rgba(255, 172, 46, 0.30)',
          }}
        >
          Применить
          <ArrowRight size={12} strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}

function Gem() {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_8px_24px_rgba(255,172,46,0.35)]"
      animate={{ rotate: [-2, 2, -2], y: [-2, 2, -2] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        {/* Modern, vibrant gradients matching the promo banner */}
        <linearGradient id="facetCrownCenter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fff1d6" />
        </linearGradient>
        <linearGradient id="facetCrownLeft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e3fff0" />
          <stop offset="100%" stopColor="#a0e0ab" />
        </linearGradient>
        <linearGradient id="facetCrownRight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe6ba" />
          <stop offset="100%" stopColor="#ffac2e" />
        </linearGradient>
        
        <linearGradient id="facetPavLeft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#75cc84" />
          <stop offset="100%" stopColor="#2c7038" />
        </linearGradient>
        <linearGradient id="facetPavCenter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc46b" />
          <stop offset="100%" stopColor="#c46200" />
        </linearGradient>
        <linearGradient id="facetPavRight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff9a14" />
          <stop offset="100%" stopColor="#8a2f00" />
        </linearGradient>

        <radialGradient id="diaSparkle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* Main Facets */}
      <polygon points="10,28 32,28 40,72" fill="url(#facetPavLeft)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="32,28 48,28 40,72" fill="url(#facetPavCenter)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="48,28 70,28 40,72" fill="url(#facetPavRight)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />

      <polygon points="10,28 32,28 24,14" fill="url(#facetCrownLeft)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="70,28 48,28 56,14" fill="url(#facetCrownRight)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="24,14 56,14 48,28 32,28" fill="url(#facetCrownCenter)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" strokeLinejoin="round" />

      {/* Girdle Line */}
      <line x1="10" y1="28" x2="70" y2="28" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <line x1="24" y1="14" x2="56" y2="14" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" />

      {/* Surface Glint */}
      <motion.polygon
        points="26,15 40,15 36,26 26,26"
        fill="rgba(255,255,255,0.6)"
        style={{ mixBlendMode: 'overlay' }}
        animate={{ opacity: [0.1, 0.7, 0.1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Sparkles */}
      <motion.circle
        cx="26"
        cy="18"
        r="3"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 0.5], rotate: [0, 90, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="58"
        cy="32"
        r="2"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      />
      <motion.circle
        cx="40"
        cy="56"
        r="1.5"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 0.8, 0], scale: [0.3, 1, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </motion.svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Lucky Wheel hero — half-circle, 12 sectors, brand palette                  */
/* -------------------------------------------------------------------------- */

const WHEEL_SECTORS_12 = [
  0.05, 0.1, 0.5, 0.05, 0.25, 0.1,
  1.0, 0.05, 0.5, 0.1, 0.25, 0.05,
];

/**
 * Sector palette — calmer and more brand-aligned than the previous
 * red-leaning gradient. Lower-tier sectors stay desaturated; the
 * 1.00 zł jackpot pops in warm amber so the eye lands on it first.
 */
const SECTOR_TIER_COLOR: Record<number, string> = {
  0.05: '#1f2933',
  0.1: '#2c3a47',
  0.25: '#4a6072',
  0.5: '#6a8a7a',
  0.75: '#d49a4a',
  1.0: '#ffac2e',
};

/** Text colour per sector — light tiers get white, amber gets ink. */
const SECTOR_TEXT_COLOR: Record<number, string> = {
  0.05: '#ffffff',
  0.1: '#ffffff',
  0.25: '#ffffff',
  0.5: '#ffffff',
  0.75: '#0a0a0a',
  1.0: '#0a0a0a',
};

function LuckyWheelHero({ onWin }: { onWin: () => void }) {
  const [state, setState] = useState<WheelStateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  const spinRef = useRef<{
    startedAt: number;
    durationMs: number;
    targetIndex: number;
    initialRotation: number;
  } | null>(null);
  const idleRotationRef = useRef(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/bonuses/wheel/state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json: WheelStateResponse = await res.json();
      setState(json);
    } catch {
      // ignore
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [load, isAuthenticated]);

  const cooldownLeftMs = state?.cooldownEndsAt
    ? Math.max(0, state.cooldownEndsAt - now)
    : 0;
  const onCooldown = cooldownLeftMs > 0;
  const noSpins = (state?.remaining ?? 0) <= 0;
  const canSpin = !!state && !busy && !onCooldown && !noSpins && spinRef.current === null;

  const spin = async () => {
    if (!canSpin) return;
    setBusy(true);
    try {
      const res = await fetch('/api/bonuses/wheel/spin', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportApiError(res, json, 'Could not spin');
        return;
      }
      // Convert backend sector index (0..5 over the 6-tier list) to a
      // half-wheel landing slot — pick the sector whose payout matches.
      const sectorAmount = Number(json.amount);
      const candidates = WHEEL_SECTORS_12
        .map((amt, i) => ({ amt, i }))
        .filter((s) => s.amt === sectorAmount);
      const target = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)].i
        : 0;

      spinRef.current = {
        startedAt: Date.now(),
        durationMs: 6000,
        targetIndex: target,
        initialRotation: idleRotationRef.current,
      };
      forceTick((n) => n + 1);
      setTimeout(() => {
        toast.success(
          `+${sectorAmount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`,
          { title: 'Колесо удачи' }
        );
        spinRef.current = null;
        forceTick((n) => n + 1);
        // Push immediate balance update from the response so the pill
        // refreshes instantly without waiting for /api/balance roundtrip.
        const cur = useBalanceStore.getState().balance;
        if (cur) useBalanceStore.getState().updateBalance(Number(json.balance ?? cur.amount));
        onWin();
        void load();
      }, 6000);
    } catch {
      toast.error('Ошибка сети, попробуйте снова');
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel = onCooldown
    ? `Ждите ${Math.ceil(cooldownLeftMs / 1000)} с`
    : noSpins
      ? 'Возвращайтесь завтра'
      : busy || spinRef.current
        ? 'Крутится…'
        : 'Крутить';

  return (
    <section className="relative overflow-hidden rounded-card border border-white/10">
      {/* Deep, calm backdrop — flat charcoal with a single soft amber halo
          behind the wheel hub. No conic sun-rays, no red wash. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #0e0f13 0%, #0a0b0e 60%, #07080a 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-70 pointer-events-none mobile-no-blur"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 55%, rgba(255, 172, 46, 0.12) 0%, transparent 70%)',
        }}
      />
      {/* Hairline top accent — quiet brand cue without extra surface area */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255, 172, 46, 0.45) 50%, transparent 100%)',
        }}
      />

      {/* Header row — title on the left, jackpot tag on the right */}
      <div className="relative flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            <Sparkles size={11} strokeWidth={1.7} className="text-[#ffac2e]" />
            Колесо удачи
          </span>
          <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-light leading-tight">
            Бесплатное вращение
          </h2>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-[rgba(255,172,46,0.35)] bg-[rgba(255,172,46,0.10)]">
            <Trophy size={11} strokeWidth={1.8} className="text-[#ffac2e]" />
            <span className="font-roobert text-[11px] tabular-nums text-frost-white">
              до 1.00 zł
            </span>
          </span>
          <span className="font-roobert text-[10px] uppercase tracking-[0.22em] text-whisper-gray">
            10 вращений/день
          </span>
        </div>
      </div>

      {/* Wheel canvas */}
      <div className="relative px-3 pb-1 pt-6">
        {/* Glow / Aura effect behind the wheel */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full bg-[rgba(255,172,46,0.15)] blur-[40px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-[rgba(160,224,171,0.1)] blur-[30px] pointer-events-none" />
        
        <div
          className="relative w-full max-w-[340px] mx-auto drop-shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-transform hover:scale-[1.02] duration-500"
          style={{ aspectRatio: '1 / 1' }}
        >
          <FullWheelCanvas
            spinRef={spinRef}
            idleRotationRef={idleRotationRef}
          />
        </div>
      </div>

      {/* Tier legend */}
      <div className="relative px-5 sm:px-6 pb-1 flex items-center justify-center gap-1.5 flex-wrap">
        {[0.05, 0.1, 0.25, 0.5, 1.0].map((tier) => (
          <span
            key={tier}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill border border-white/10 bg-white/[0.03]"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: SECTOR_TIER_COLOR[tier] }}
            />
            <span className="font-roobert text-[10px] tabular-nums text-frost-white/85">
              {tier.toFixed(2)}
            </span>
          </span>
        ))}
      </div>

      {/* Spin CTA + counters */}
      <div className="relative px-5 sm:px-6 pt-3 pb-5 flex flex-col gap-3">
        <button
          onClick={spin}
          disabled={!canSpin}
          className={cn(
            'w-full h-14 px-6 rounded-pill font-roobert font-semibold text-[15px] uppercase tracking-[0.18em] inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
            canSpin
              ? 'text-midnight-canvas'
              : 'bg-white/[0.06] text-frost-white/55 border border-white/15 cursor-not-allowed'
          )}
          style={
            canSpin
              ? {
                  background:
                    'linear-gradient(90deg, #ffac2e 0%, #ffd07a 100%)',
                  boxShadow:
                    '0 8px 24px rgba(255, 172, 46, 0.32), inset 0 1px 0 rgba(255,255,255,0.55)',
                }
              : undefined
          }
        >
          {buttonLabel}
          {canSpin && <ChevronRight size={16} strokeWidth={2.4} />}
        </button>

        <div className="flex items-center justify-between font-roobert text-[11px] text-whisper-gray tabular-nums">
          <span>
            {state ? `${state.remaining} / ${state.dailyCap} вращений осталось` : '—'}
          </span>
          {onCooldown && (
            <span className="text-[#ffac2e]">
              ожидание {Math.ceil(cooldownLeftMs / 1000)} с
            </span>
          )}
        </div>
      </div>

      {state && state.ticker.length > 0 && (
        <div className="relative border-t border-white/10 px-3 py-2 overflow-x-auto scrollbar-hide flex items-center gap-2">
          <span className="shrink-0 font-roobert text-[10px] uppercase tracking-[0.24em] text-whisper-gray pl-2 pr-1">
            Недавно
          </span>
          {state.ticker.slice(0, 12).map((t, i) => (
            <div
              key={i}
              className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-pill border border-white/10 bg-white/[0.04]"
            >
              {t.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.photoUrl}
                  alt=""
                  className="w-5 h-5 rounded-pill object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-5 h-5 rounded-pill bg-white/10 flex items-center justify-center font-roobert text-[9px] text-frost-white/85">
                  {t.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-roobert text-[10px] text-frost-white/85 truncate max-w-[64px]">
                {t.name}
              </span>
              <span className="font-roobert text-[10px] tabular-nums text-[#ffac2e]">
                +{t.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FullWheelCanvas({
  spinRef,
  idleRotationRef,
}: {
  spinRef: React.MutableRefObject<{
    startedAt: number;
    durationMs: number;
    targetIndex: number;
    initialRotation: number;
  } | null>;
  idleRotationRef: React.MutableRefObject<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);

    let size = { w: 0, h: 0 };
    let needsResize = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === size.w && h === size.h) return;
      size = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      needsResize = false;
    };

    const ro = new ResizeObserver(() => {
      needsResize = true;
    });
    ro.observe(canvas);

    const SECTORS = WHEEL_SECTORS_12;
    const N = SECTORS.length;
    /**
     * Full-circle wheel — 12 sectors of 30° each. Sector 0 is centred
     * straight up under the pointer when rotation = 0; subsequent
     * sectors fan clockwise. Computing landing rotation:
     *   sector i centre canvas-angle (no rotation) = -PI/2 + i * arc
     *   we want it under the pointer at angle -PI/2, so rotation =
     *   -i * arc (modulo 2PI).
     */
    const ARC = (2 * Math.PI) / N;

    let lastFrame = performance.now();

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (needsResize) resize();
      const w = size.w;
      const h = size.h;
      if (!w || !h) return;
      const dt = performance.now() - lastFrame;
      lastFrame = performance.now();

      ctx.clearRect(0, 0, w, h);

      let rotation = idleRotationRef.current;
      if (spinRef.current) {
        const lock = spinRef.current;
        const t = Math.min(1, (Date.now() - lock.startedAt) / lock.durationMs);
        // Land the chosen sector under the top pointer:
        const targetAngle = -lock.targetIndex * ARC;
        // Six full revolutions before settling — feels rich at 6s.
        const totalRotation =
          6 * 2 * Math.PI + targetAngle - lock.initialRotation;
        // Three-phase ease: linear cruise → cubic brake → micro-settle.
        let progressed: number;
        if (t < 0.65) progressed = (t / 0.65) * 0.72;
        else if (t < 0.93) {
          const tt = (t - 0.65) / 0.28;
          progressed = 0.72 + (1 - 0.72) * (1 - Math.pow(1 - tt, 3));
        } else {
          // Tiny elastic settle (no overshoot beyond 1 — the lock
          // already bakes the desired final angle exactly).
          progressed = 1;
        }
        rotation = lock.initialRotation + totalRotation * progressed;
      } else {
        idleRotationRef.current += dt * 0.0003;
        rotation = idleRotationRef.current;
      }

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.46;

      // Drop shadow under the wheel
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 0.95, radius * 0.85, radius * 0.12, 0, 0, Math.PI * 2);
      const shadow = ctx.createRadialGradient(
        cx, cy + radius * 0.95, 0,
        cx, cy + radius * 0.95, radius * 0.85
      );
      shadow.addColorStop(0, 'rgba(0,0,0,0.6)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.fill();

      // Outer atmospheric glow ring
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.18);
      glow.addColorStop(0, 'rgba(255, 200, 110, 0)');
      glow.addColorStop(0.5, 'rgba(255, 172, 46, 0.18)');
      glow.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Decorative outer rim — two concentric strokes
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.07, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 172, 46, 0.40)';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      // Pointer is at -PI/2 (top). Sector 0 centred at -PI/2 means we
      // need to rotate the sector strip by `rotation - PI/2 - ARC/2`
      // so that drawing sector i in [-ARC/2 + i*ARC, ARC/2 + i*ARC]
      // works out. Simpler: orient the canvas so 0° = pointer, sector
      // 0 spans [-ARC/2, ARC/2].
      ctx.rotate(rotation - Math.PI / 2);

      // Sector bodies + highlight + dividers + labels.
      for (let i = 0; i < N; i++) {
        const a0 = -ARC / 2 + i * ARC;
        const a1 = ARC / 2 + i * ARC;
        const tier = SECTOR_TIER_COLOR[SECTORS[i]] ?? '#a0e0ab';

        // Wedge body — rich radial gradient: dark hub side, bright rim.
        const inner = radius * 0.28;
        const outer = radius * 0.97;
        const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
        grad.addColorStop(0, shade(tier, -0.18));
        grad.addColorStop(0.55, tier);
        grad.addColorStop(1, shade(tier, -0.08));
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, outer, a0, a1);
        ctx.closePath();
        ctx.fill();

        // Wedge inner glossy highlight on the upper half — gives the
        // tile a slightly waxy/casino-disc look.
        const gloss = ctx.createLinearGradient(0, -outer, 0, 0);
        gloss.addColorStop(0, 'rgba(255,255,255,0.40)');
        gloss.addColorStop(0.5, 'rgba(255,255,255,0.10)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, outer, a0, a1);
        ctx.closePath();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Label — large, white, centred on the wedge midline. Slight
        // drop shadow keeps it readable on lighter sectors.
        const aMid = (a0 + a1) / 2;
        const lr = (inner + outer) * 0.58;
        const lx = Math.cos(aMid) * lr;
        const ly = Math.sin(aMid) * lr;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(aMid + Math.PI / 2);
        ctx.font = '700 13px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textColor = SECTOR_TEXT_COLOR[SECTORS[i]] ?? '#ffffff';
        const isDarkText = textColor === '#0a0a0a';
        ctx.fillStyle = isDarkText
          ? 'rgba(255,255,255,0.35)'
          : 'rgba(0,0,0,0.55)';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 1);
        ctx.fillStyle = textColor;
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 0);
        ctx.restore();
      }

      // Sector dividers — drawn over the bodies for crisp edges.
      for (let i = 0; i < N; i++) {
        const a = -ARC / 2 + i * ARC;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * radius * 0.97, Math.sin(a) * radius * 0.97);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.stroke();
      }

      // Centre hub — brass-like radial dot
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
      const hubGrad = ctx.createRadialGradient(
        -radius * 0.06, -radius * 0.06, 0,
        0, 0, radius * 0.22
      );
      hubGrad.addColorStop(0, 'rgba(255, 230, 170, 1)');
      hubGrad.addColorStop(0.5, 'rgba(220, 170, 80, 1)');
      hubGrad.addColorStop(1, 'rgba(120, 80, 30, 1)');
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.stroke();
      // Inner dark ring
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 172, 46, 0.55)';
      ctx.stroke();

      ctx.restore();

      // Static stud ring on the bezel — single soft tone, no pulsing.
      // Modern wheels read better with a quiet bezel than a flashing one.
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * radius * 1.085;
        const sy = cy + Math.sin(a) * radius * 1.085;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 220, 150, 0.35)';
        ctx.fill();
      }

      // Top pointer — clean amber teardrop with a hairline outline.
      const ptCx = cx;
      const ptCy = cy - radius * 1.04;
      ctx.save();
      ctx.translate(ptCx, ptCy);
      // Soft halo behind the pointer
      const halo = ctx.createRadialGradient(0, 4, 0, 0, 4, 22);
      halo.addColorStop(0, 'rgba(255, 172, 46, 0.55)');
      halo.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.beginPath();
      ctx.arc(0, 4, 22, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
      // Teardrop shape — rounded top, sharp tip pointing down at the rim
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.bezierCurveTo(10, 4, 10, -10, 0, -10);
      ctx.bezierCurveTo(-10, -10, -10, 4, 0, 14);
      ctx.closePath();
      const tGrad = ctx.createLinearGradient(0, -10, 0, 14);
      tGrad.addColorStop(0, '#ffd07a');
      tGrad.addColorStop(1, '#ffac2e');
      ctx.fillStyle = tGrad;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.stroke();
      // Inner highlight dot
      ctx.beginPath();
      ctx.arc(-2, -4, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fill();
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [spinRef, idleRotationRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: 'auto' }}
    />
  );
}

/** Lighten/darken a hex color by a percentage. */
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * percent)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * percent)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * percent)));
  return `rgb(${r},${g},${b})`;
}

/* -------------------------------------------------------------------------- */
/* Contests                                                                   */
/* -------------------------------------------------------------------------- */

function ContestsList({ currentUserId }: { currentUserId: string | null }) {
  const [list, setList] = useState<ContestRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bonuses/contests', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = await res.json();
      setList(json.contests as ContestRow[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/bonuses/contests/${id}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        reportApiError(res, json, 'Не удалось присоединиться');
        return;
      }
      toast.success('Вы присоединились');
      void load();
    } finally {
      setBusyId(null);
    }
  };

  void currentUserId;

  return (
    // id="contests" — якорь, по которому Hero на главной (см.
    // home-screen.tsx) скроллит сюда после клика по «случайному
    // конкурсу». scroll-mt-4 даёт визуальный отступ от верха окна.
    <section id="contests" className="flex flex-col gap-3 scroll-mt-4">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          Конкурсы
        </span>
        <span className="font-roobert text-[11px] text-whisper-gray">
          {list?.length ?? 0}
        </span>
      </div>

      {list === null ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] py-10 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border border-white/20 border-t-frost-white animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-card border border-white/10 bg-white/[0.03] px-5 py-8 text-center font-roobert text-[12px] text-whisper-gray">
          Сейчас конкурсов нет. Загляните позже.
        </div>
      ) : (
        list.map((c) => (
          <ContestCard
            key={c.id}
            contest={c}
            onJoin={() => join(c.id)}
            busy={busyId === c.id}
          />
        ))
      )}
    </section>
  );
}

function ContestCard({
  contest,
  onJoin,
  busy,
}: {
  contest: ContestRow;
  onJoin: () => void;
  busy: boolean;
}) {
  const now = Date.now();
  const remainingMs = Math.max(0, contest.endsAt - now);
  const remaining = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  const router = useRouter();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card border border-white/10 hover:border-white/20 transition-colors group"
    >
      {/* Banner art (admin-uploaded) — falls back to the gradient wash */}
      {contest.bannerUrl ? (
        <img
          src={contest.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-45"
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
        className="absolute inset-0 opacity-50 mix-blend-screen pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 90% at 100% 100%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.10) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={12} className="text-[#ffac2e]" strokeWidth={1.7} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray group-hover:text-frost-white transition-colors">
            {contest.visibility === 'public'
              ? 'Публичный конкурс'
              : contest.visibility === 'private'
                ? 'Приватный конкурс'
                : 'Глобальный конкурс'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[18px] sm:text-[20px] leading-tight truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {contest.title}
            </div>
            {contest.description && (
              <div className="mt-1 font-roobert text-[12px] text-whisper-gray line-clamp-2">
                {contest.description}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-roobert text-frost-white text-[20px] font-light leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {contest.prizePool.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}{' '}
              <span className="text-[12px] text-whisper-gray">zł</span>
            </div>
            <div className="mt-1 font-roobert text-[10px] text-whisper-gray tabular-nums">
              {contest.winnersCount} победителей
            </div>
          </div>
        </div>

        <RulesPreview rules={contest.rules} />

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 font-roobert text-[11px] text-whisper-gray tabular-nums">
              <Users size={10} strokeWidth={1.8} />
              {contest.participantCount}
            </span>
            <span className="font-roobert text-[11px] text-whisper-gray tabular-nums">
              {(contest as any).cycleState === 'ended' ? 'до начала' : 'до конца'} {remaining}
            </span>
          </div>
          {contest.visibility === 'global' ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[11px] uppercase tracking-[0.18em] text-frost-white/85">
              Автоучастие
            </span>
          ) : contest.joined ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill border border-[rgba(160,224,171,0.55)] bg-[rgba(160,224,171,0.10)] font-roobert text-[11px] uppercase tracking-[0.18em] text-frost-white">
              Участвую
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onJoin(); }}
              disabled={busy || contest.joined}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[11px] uppercase tracking-[0.2em] active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              Участвовать
              <ArrowRight size={11} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function RulesPreview({ rules }: { rules: unknown }) {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const formatted = rules.map((r) => describeRule(r)).filter((s): s is string => !!s);
  if (formatted.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {formatted.map((label, i) => (
        <span
          key={i}
          className="inline-flex items-center px-2 py-0.5 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[10px] text-frost-white/85"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function describeRule(r: unknown): string | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  switch (o.type) {
    case 'deposit_window':
      return `Депозиты ≥ ${o.amount} zł за ${o.days} дн.`;
    case 'wagered_window':
      return `Оборот ≥ ${o.amount} zł за ${o.days} дн.`;
    case 'deposit_total':
      return `Депозитов всего ≥ ${o.amount} zł`;
    case 'referrals':
      return `${o.count}+ рефералов`;
    case 'registered_after':
      return `Регистрация после ${typeof o.date === 'string' ? o.date.slice(0, 10) : ''}`;
    default:
      return null;
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'завершено';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} м ${s} с`;
  return `${m} м ${s} с`;
}

void AnimatePresence;
