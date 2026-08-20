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
  Gift,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { GameTopBar } from '@/components/game/game-top-bar';
import { PAGE_WIDTH } from '@/components/layout/page-width';
import { useT } from '@/i18n/use-t';

/**
 * Bonuses Page — Premium Redesign.
 *
 * Features:
 *   1. Top Navigation Bar (GameTopBar with Sparkles icon).
 *   2. Promo Code Hero — Glassmorphic card, floating animated gem, upper-case input & gradient CTA.
 *   3. Lucky Wheel Hero — Canvas wheel, status tags, smooth spinning, live winners ticker.
 *   4. Active Tournaments — Hidden completely if count is 0.
 *   5. Active Contests — Hidden completely if count is 0.
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
  joined?: boolean;
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
  const { t } = useT();
  const { user } = useAuthStore();
  const { fetchBalance } = useBalance();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white flex flex-col selection:bg-amber-500/30">
      <GameTopBar title={t('bonuses.title')} Icon={Sparkles} width="wide" />
      
      <div className={`mx-auto w-full ${PAGE_WIDTH.wide} px-4 pt-4 pb-32 flex flex-col gap-6`}>
        {/* Promo Code Hero */}
        <PromoCodeHero onRedeemed={() => void fetchBalance()} />

        {/* Lucky Wheel Hero */}
        <LuckyWheelHero onWin={() => void fetchBalance()} />

        {/* Deposit Bonuses Section (One-time deposit bonuses) */}
        <DepositBonusesSection />

        {/* Tournaments List (Only rendered if active tournaments > 0) */}
        <TournamentsList />

        {/* Contests List (Only rendered if active contests > 0) */}
        <ContestsList currentUserId={user?.id ?? null} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Deposit Bonuses Section                                                   */
/* -------------------------------------------------------------------------- */

interface DepositOffer {
  id: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  type: 'percent' | 'fixed';
  bonusValue: number;
  minDeposit: number;
  wagerMultiplier: number;
  userStatus: 'active' | 'used' | 'none';
}

function getCardStyleTheme(title: string, index: number) {
  const t = (title || '').toLowerCase();
  if (t.includes('100%') || t.includes('100')) {
    return {
      gradientBg: 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/35 via-amber-950/60 to-black',
      glowShadow: 'shadow-[0_0_25px_rgba(245,158,11,0.25)] hover:shadow-[0_0_35px_rgba(245,158,11,0.4)]',
      badgeBg: 'bg-gradient-to-r from-amber-400 to-amber-500 text-black border-amber-300',
      titleGrad: 'bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 bg-clip-text text-transparent',
      accentIcon: '🔥',
    };
  }
  if (t.includes('50 zł') || t.includes('50zl') || t.includes('подарок')) {
    return {
      gradientBg: 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/30 via-blue-950/60 to-black',
      glowShadow: 'shadow-[0_0_25px_rgba(6,182,212,0.25)] hover:shadow-[0_0_35px_rgba(6,182,212,0.4)]',
      badgeBg: 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black border-cyan-300',
      titleGrad: 'bg-gradient-to-r from-cyan-100 via-sky-300 to-amber-300 bg-clip-text text-transparent',
      accentIcon: '⚡',
    };
  }
  if (t.includes('vip') || t.includes('booster') || t.includes('150%')) {
    return {
      gradientBg: 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/35 via-purple-950/60 to-black',
      glowShadow: 'shadow-[0_0_25px_rgba(168,85,247,0.3)] hover:shadow-[0_0_35px_rgba(168,85,247,0.45)]',
      badgeBg: 'bg-gradient-to-r from-purple-400 via-amber-300 to-amber-400 text-black border-amber-300',
      titleGrad: 'bg-gradient-to-r from-purple-200 via-amber-200 to-amber-400 bg-clip-text text-transparent',
      accentIcon: '👑',
    };
  }
  return {
    gradientBg: 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/30 via-emerald-950/60 to-black',
    glowShadow: 'shadow-[0_0_25px_rgba(16,185,129,0.25)] hover:shadow-[0_0_35px_rgba(16,185,129,0.4)]',
    badgeBg: 'bg-gradient-to-r from-emerald-400 to-teal-400 text-black border-emerald-300',
    titleGrad: 'bg-gradient-to-r from-emerald-100 via-teal-200 to-amber-300 bg-clip-text text-transparent',
    accentIcon: '🚀',
  };
}

function DepositBonusesSection() {
  const router = useRouter();
  const [offers, setOffers] = useState<DepositOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch('/api/bonuses/deposit-offers', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setOffers(j.offers ?? []);
      }
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  const toggleBonus = async (offer: DepositOffer) => {
    if (offer.userStatus === 'used') return;
    setBusyId(offer.id);
    const action = offer.userStatus === 'active' ? 'deactivate' : 'activate';

    try {
      const res = await fetch(`/api/bonuses/deposit-offers/${offer.id}/toggle`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const j = await res.json();
        toast.error(j.error || 'Не удалось обновить статус бонуса');
      } else {
        if (action === 'activate') {
          toast.success(`Бонус «${offer.title}» активирован для следующего депозита!`);
        } else {
          toast.info('Бонус деактивирован');
        }
        await loadOffers();
      }
    } catch {
      toast.error('Ошибка при обновлении бонуса');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 rounded-card border border-white/10 bg-white/[0.03] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-xs text-whisper-gray font-roobert">Загрузка депозитных бонусов...</span>
      </div>
    );
  }

  if (offers.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
            <Zap size={14} />
          </div>
          <span className="font-roobert text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-bold">
            Разовые Депозитные Бонусы
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {offers.map((offer) => {
          const isActive = offer.userStatus === 'active';
          const isUsed = offer.userStatus === 'used';

          return (
            <div
              key={offer.id}
              className={`relative aspect-square overflow-hidden rounded-2xl transition-all duration-300 p-2.5 flex flex-col justify-between group ${
                isActive
                  ? 'bg-emerald-950/30 ring-1 ring-emerald-400/40 shadow-[0_0_22px_rgba(16,185,129,0.25)]'
                  : isUsed
                  ? 'bg-white/[0.01] opacity-40'
                  : 'bg-black/80 shadow-[0_0_18px_rgba(251,191,36,0.14)] hover:shadow-[0_0_26px_rgba(251,191,36,0.26)]'
              }`}
            >
              {/* Optional Banner Image Background or Clean Dark Fallback */}
              {offer.bannerUrl ? (
                <>
                  <img
                    src={offer.bannerUrl}
                    alt={offer.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                </>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black" />
              )}

              {/* Top Badges */}
              <div className="relative z-10 flex items-center justify-between gap-1">
                <span className="px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/20 text-amber-300 text-[10px] font-extrabold font-roobert backdrop-blur-md">
                  {offer.type === 'percent' ? `+${offer.bonusValue}%` : `+${offer.bonusValue} zł`}
                </span>

                {isActive ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 text-[9px] font-mono font-bold uppercase backdrop-blur-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Активен</span>
                  </span>
                ) : isUsed ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-whisper-gray text-[9px] font-mono uppercase backdrop-blur-md">
                    Использован
                  </span>
                ) : null}
              </div>

              {/* Bottom Info & Action (Title placed right above the button, NOT in center) */}
              <div className="relative z-10 mt-auto flex flex-col gap-1 pt-1">
                <div className="flex flex-col gap-0.5">
                  <h3 className="font-roobert text-[11.5px] sm:text-[12.5px] font-extrabold text-white leading-snug line-clamp-2 drop-shadow-md">
                    {offer.title}
                  </h3>
                  <div className="text-[9.5px] font-roobert text-whisper-gray flex items-center gap-1">
                    <span>Депозит от:</span>
                    <b className="text-amber-300 font-bold">{offer.minDeposit} zł</b>
                  </div>
                </div>

                {/* Bottom Action Button */}
                <div className="pt-0.5">
                  {isActive ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => router.push('/balance')}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[10.5px] transition-all text-center truncate active:scale-95"
                      >
                        Депозит 🚀
                      </button>
                      <button
                        onClick={() => toggleBonus(offer)}
                        disabled={busyId === offer.id}
                        className="px-2 py-1.5 rounded-xl border border-white/20 bg-black/80 text-rose-300 text-[10px] hover:bg-rose-500/30 transition-all font-roobert active:scale-95"
                      >
                        ✕
                      </button>
                    </div>
                  ) : isUsed ? (
                    <button
                      disabled
                      className="w-full py-1.5 rounded-xl bg-white/10 text-whisper-gray font-medium text-[10px] cursor-not-allowed text-center"
                    >
                      Использован
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleBonus(offer)}
                      disabled={busyId === offer.id}
                      className="w-full py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-black font-extrabold text-[11px] active:scale-95 transition-all flex items-center justify-center gap-1"
                    >
                      {busyId === offer.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Zap size={12} fill="currentColor" />
                      )}
                      <span>Активировать</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Promo Code Hero                                                            */
/* -------------------------------------------------------------------------- */

function formatCooldownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec <= 0) return '0 с';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) {
    return s > 0 ? `${m} м ${s} с` : `${m} м`;
  }
  return `${s} с`;
}

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
      if (json.isAffiliate) {
        toast.success(
          'Вы успешно привязаны к партнеру!',
          { title: 'Промокод применён' }
        );
        setCode('');
        return;
      }
      
      toast.success(
        `+${Number(json.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`,
        { title: 'Промокод применён' }
      );
      setCode('');
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
    <motion.section 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl shadow-2xl"
    >
      {/* Background ambient radial lighting */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(80% 60% at 90% 10%, rgba(255, 172, 46, 0.18) 0%, rgba(160, 224, 171, 0.08) 50%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-16 -left-16 w-48 h-48 rounded-full pointer-events-none blur-[50px]"
        style={{
          background: 'radial-gradient(circle, rgba(255, 200, 100, 0.25) 0%, transparent 70%)',
        }}
      />

      <div className="relative grid grid-cols-[1fr_auto] gap-3 px-6 pt-6 pb-4 items-center">
        <div className="flex flex-col gap-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 w-fit">
            <Ticket size={12} className="text-amber-400" strokeWidth={2} />
            <span className="font-roobert text-[10px] uppercase tracking-[0.25em] text-amber-300 font-semibold">
              Промокод
            </span>
          </div>
          <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-medium leading-tight">
            Активируйте код,
            <br />
            <span className="text-amber-300">получите бонус</span>
          </h2>
        </div>
        <Gem />
      </div>

      <div className="relative px-5 sm:px-6 pb-6 pt-2">
        <div className="relative flex items-center w-full min-h-[52px] h-[52px] p-1.5 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/30 transition-all">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="ВВЕДИТЕ КОД"
            maxLength={32}
            className="flex-1 min-w-0 h-full px-4 bg-transparent font-roobert text-[14px] sm:text-[15px] font-bold tracking-[0.18em] text-frost-white placeholder:text-white/35 focus:outline-none"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={submit}
            disabled={busy}
            className={cn(
              'h-full px-5 rounded-xl font-roobert font-bold text-[12px] sm:text-[13px] uppercase tracking-[0.12em] text-midnight-canvas transition-all inline-flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-amber-500/20',
              busy && 'opacity-60 cursor-not-allowed'
            )}
            style={{
              background: 'linear-gradient(90deg, #ffac2e 0%, #ffd07a 100%)',
            }}
          >
            Применить
            <ArrowRight size={14} strokeWidth={2.4} />
          </motion.button>
        </div>
      </div>
    </motion.section>
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

      <polygon points="10,28 32,28 40,72" fill="url(#facetPavLeft)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="32,28 48,28 40,72" fill="url(#facetPavCenter)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="48,28 70,28 40,72" fill="url(#facetPavRight)" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" strokeLinejoin="round" />

      <polygon points="10,28 32,28 24,14" fill="url(#facetCrownLeft)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="70,28 48,28 56,14" fill="url(#facetCrownRight)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeLinejoin="round" />
      <polygon points="24,14 56,14 48,28 32,28" fill="url(#facetCrownCenter)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" strokeLinejoin="round" />

      <line x1="10" y1="28" x2="70" y2="28" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <line x1="24" y1="14" x2="56" y2="14" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" />

      <motion.polygon
        points="26,15 40,15 36,26 26,26"
        fill="rgba(255,255,255,0.6)"
        style={{ mixBlendMode: 'overlay' }}
        animate={{ opacity: [0.1, 0.7, 0.1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.circle
        cx="26"
        cy="18"
        r="3"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 0.5] }}
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
    </motion.svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Lucky Wheel Hero                                                           */
/* -------------------------------------------------------------------------- */

const WHEEL_SECTORS_12 = [
  0.05, 0.1, 0.5, 0.05, 0.25, 0.1,
  10.0, 0.05, 0.5, 0.1, 0.25, 0.05,
];

const SECTOR_TIER_COLOR: Record<number, string> = {
  0.05: '#1f2933',
  0.1: '#2c3a47',
  0.25: '#4a6072',
  0.5: '#6a8a7a',
  0.75: '#d49a4a',
  10.0: '#ffac2e',
};

const SECTOR_TEXT_COLOR: Record<number, string> = {
  0.05: '#ffffff',
  0.1: '#ffffff',
  0.25: '#ffffff',
  0.5: '#ffffff',
  0.75: '#0a0a0a',
  10.0: '#0a0a0a',
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
        if (sectorAmount === 10.0) {
          toast.success('Вы выиграли вращение в Обычном кейсе!', { title: 'Колесо удачи' });
        } else {
          toast.success(
            `+${sectorAmount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`,
            { title: 'Колесо удачи' }
          );
        }
        spinRef.current = null;
        forceTick((n) => n + 1);
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
    ? `Ждите ${formatCooldownMs(cooldownLeftMs)}`
    : noSpins
      ? 'Возвращайтесь завтра'
      : busy || spinRef.current
        ? 'Крутится…'
        : 'Крутить';

  return (
    <motion.section 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e1017] to-[#07080b] shadow-2xl"
    >
      {/* Accent Hairline */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 50%, rgba(255, 172, 46, 0.12) 0%, transparent 80%)',
        }}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 px-6 pt-6">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 font-roobert text-[10px] uppercase tracking-[0.25em] text-whisper-gray">
            <Sparkles size={12} className="text-amber-400" />
            <span>Колесо удачи</span>
          </div>
          <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-medium leading-tight">
            Бесплатный спин
          </h2>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10">
            <Trophy size={11} className="text-amber-400" />
            <span className="font-roobert text-[11px] font-semibold text-frost-white">
              КЕЙС / 1.00 zł
            </span>
          </span>
          <span className="font-roobert text-[10px] uppercase tracking-[0.18em] text-whisper-gray">
            10 вращений/день
          </span>
        </div>
      </div>

      {/* Wheel Canvas */}
      <div className="relative px-4 pt-6 pb-2">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] rounded-full bg-amber-500/15 blur-[45px] pointer-events-none" />
        
        <div
          className="relative w-full max-w-[320px] mx-auto transition-transform hover:scale-[1.01] duration-500"
          style={{ aspectRatio: '1 / 1' }}
        >
          <FullWheelCanvas
            spinRef={spinRef}
            idleRotationRef={idleRotationRef}
          />
        </div>
      </div>

      {/* Tier Legend */}
      <div className="relative px-6 pb-2 flex items-center justify-center gap-2 flex-wrap">
        {[0.05, 0.1, 0.25, 0.5, 10.0].map((tier) => (
          <span
            key={tier}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: SECTOR_TIER_COLOR[tier] }}
            />
            <span className="font-roobert text-[10px] font-semibold text-frost-white/90">
              {tier === 10.0 ? 'КЕЙС' : `${tier.toFixed(2)} zł`}
            </span>
          </span>
        ))}
      </div>

      {/* Spin CTA */}
      <div className="relative px-6 pt-3 pb-6 flex flex-col gap-3">
        <motion.button
          whileHover={canSpin ? { scale: 1.01 } : undefined}
          whileTap={canSpin ? { scale: 0.98 } : undefined}
          onClick={spin}
          disabled={!canSpin}
          className={cn(
            'w-full h-14 px-6 rounded-2xl font-roobert font-bold text-[15px] uppercase tracking-[0.18em] inline-flex items-center justify-center gap-2 transition-all shadow-xl',
            canSpin
              ? 'text-midnight-canvas shadow-amber-500/25'
              : 'bg-white/[0.05] text-white/40 border border-white/10 cursor-not-allowed'
          )}
          style={
            canSpin
              ? {
                  background:
                    'linear-gradient(90deg, #ffac2e 0%, #ffd07a 100%)',
                }
              : undefined
          }
        >
          {buttonLabel}
          {canSpin && <ChevronRight size={18} strokeWidth={2.5} />}
        </motion.button>

        <div className="flex items-center justify-between font-roobert text-[11px] text-whisper-gray">
          <span>
            {state ? `${state.remaining} / ${state.dailyCap} осталось на сегодня` : '—'}
          </span>
          {onCooldown && (
            <span className="text-amber-400 font-medium">
              пауза {formatCooldownMs(cooldownLeftMs)}
            </span>
          )}
        </div>
      </div>

      {/* Winners Ticker */}
      {state && state.ticker.length > 0 && (
        <div className="relative border-t border-white/10 px-4 py-2.5 bg-black/40 overflow-x-auto scrollbar-hide flex items-center gap-2.5">
          <span className="shrink-0 font-roobert text-[10px] uppercase tracking-[0.22em] text-amber-400/80 font-bold pl-2 pr-1 flex items-center gap-1">
            <Zap size={10} />
            Победители
          </span>
          {state.ticker.slice(0, 12).map((t, i) => (
            <div
              key={i}
              className="shrink-0 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.05] backdrop-blur-md"
            >
              {t.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.photoUrl}
                  alt=""
                  className="w-4 h-4 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center font-roobert text-[8px] text-frost-white/90 font-bold">
                  {t.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-roobert text-[10px] text-frost-white/90 font-medium truncate max-w-[70px]">
                {t.name}
              </span>
              <span className="font-roobert text-[10px] font-bold text-amber-400">
                {t.amount === 10.0 ? 'КЕЙС' : `+${t.amount.toFixed(2)} zł`}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.section>
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
        const targetAngle = -lock.targetIndex * ARC;
        const totalRotation =
          6 * 2 * Math.PI + targetAngle - lock.initialRotation;
        let progressed: number;
        if (t < 0.65) progressed = (t / 0.65) * 0.72;
        else if (t < 0.93) {
          const tt = (t - 0.65) / 0.28;
          progressed = 0.72 + (1 - 0.72) * (1 - Math.pow(1 - tt, 3));
        } else {
          progressed = 1;
        }
        rotation = lock.initialRotation + totalRotation * progressed;
      } else {
        idleRotationRef.current += dt * 0.0003;
        rotation = idleRotationRef.current;
      }

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.40;

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

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.18);
      glow.addColorStop(0, 'rgba(255, 200, 110, 0)');
      glow.addColorStop(0.5, 'rgba(255, 172, 46, 0.18)');
      glow.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

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
      ctx.rotate(rotation - Math.PI / 2);

      for (let i = 0; i < N; i++) {
        const a0 = -ARC / 2 + i * ARC;
        const a1 = ARC / 2 + i * ARC;
        const tier = SECTOR_TIER_COLOR[SECTORS[i]] ?? '#a0e0ab';

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
        const txt = SECTORS[i] === 10.0 ? 'КЕЙС' : `${SECTORS[i].toFixed(2)} zł`;
        ctx.fillText(txt, 0, 1);
        ctx.fillStyle = textColor;
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      }

      for (let i = 0; i < N; i++) {
        const a = -ARC / 2 + i * ARC;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * radius * 0.97, Math.sin(a) * radius * 0.97);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.stroke();
      }

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
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 172, 46, 0.55)';
      ctx.stroke();

      ctx.restore();

      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * radius * 1.085;
        const sy = cy + Math.sin(a) * radius * 1.085;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 220, 150, 0.35)';
        ctx.fill();
      }

      const ptCx = cx;
      const ptCy = cy - radius * 1.04;
      ctx.save();
      ctx.translate(ptCx, ptCy);
      const halo = ctx.createRadialGradient(0, 4, 0, 0, 4, 22);
      halo.addColorStop(0, 'rgba(255, 172, 46, 0.55)');
      halo.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.beginPath();
      ctx.arc(0, 4, 22, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
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
/* Tournaments (Hidden if count == 0)                                         */
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
      if (!res.ok) {
        setList([]);
        return;
      }
      const json = await res.json();
      setList((json.tournaments as TournamentRow[]) || []);
    } catch {
      setList([]);
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

  // If loading or empty, return null (do not display empty message block)
  if (!list || list.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4" id="tournaments">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-roobert text-[11px] uppercase tracking-[0.28em] text-whisper-gray font-bold">
          Турниры ({list.length})
        </span>
      </div>

      {list.map((t) => (
        <TournamentCard key={t.id} tournament={t} onJoin={() => join(t.id)} busy={busyId === t.id} />
      ))}
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => router.push(`/tournaments/${tournament.id}`)}
      className="relative overflow-hidden rounded-3xl border border-white/10 hover:border-white/20 transition-all cursor-pointer bg-gradient-to-b from-white/[0.04] to-black/60 backdrop-blur-md"
    >
      {tournament.bannerUrl ? (
        <img
          src={tournament.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
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
      <div className="relative px-6 py-5 flex flex-col gap-3.5">
        <div className="flex items-center gap-2">
          <Trophy size={13} className="text-amber-400" strokeWidth={2} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.25em] text-amber-300/90 font-semibold">
            Турнир · {tournament.gameType ? tournament.gameType.toUpperCase() : ''}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[18px] sm:text-[20px] font-semibold leading-tight truncate">
              {tournament.title}
            </div>
            {tournament.description && (
              <div className="mt-1 font-roobert text-[12px] text-whisper-gray line-clamp-2">
                {tournament.description}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-roobert text-amber-400 text-[20px] font-bold leading-none tabular-nums">
              {tournament.prizePool.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}{' '}
              <span className="text-[12px] text-whisper-gray font-normal">zł</span>
            </div>
            <div className="mt-1 font-roobert text-[10px] text-whisper-gray tabular-nums font-medium">
              {tournament.winnersCount} призовых мест
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] text-whisper-gray tabular-nums bg-white/[0.04] p-2.5 rounded-2xl border border-white/5">
          <span>Старт {tournament.startBalance.toFixed(0)} TM</span>
          <span>Взнос {tournament.entryFee.toFixed(0)} zł</span>
          <span className="text-amber-300/90">{isEnded ? 'Завершено' : isBeforeStart ? `Старт: ${remaining}` : `Конец: ${remaining}`}</span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="font-roobert text-[11px] text-whisper-gray font-medium">Игра: {tournament.gameType}</div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={(e) => {
              e.stopPropagation();
              if (tournament.joined || isBeforeStart) {
                router.push(`/tournaments/${tournament.id}`);
              } else {
                onJoin();
              }
            }}
            disabled={busy && !tournament.joined}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-frost-white text-midnight-canvas font-roobert text-[11px] font-bold uppercase tracking-[0.18em] shadow-md transition-transform disabled:opacity-50"
          >
            {tournament.joined || isBeforeStart ? 'К турниру' : 'Участвовать'}
            <ArrowRight size={12} strokeWidth={2.2} />
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
}

/* -------------------------------------------------------------------------- */
/* Contests (Hidden if count == 0)                                            */
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
      if (!res.ok) {
        setList([]);
        return;
      }
      const json = await res.json();
      setList((json.contests as ContestRow[]) || []);
    } catch {
      setList([]);
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

  // If loading or empty, return null (do not display empty message block)
  if (!list || list.length === 0) {
    return null;
  }

  return (
    <section id="contests" className="flex flex-col gap-4 scroll-mt-4">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-roobert text-[11px] uppercase tracking-[0.28em] text-whisper-gray font-bold">
          Конкурсы ({list.length})
        </span>
      </div>

      {list.map((c) => (
        <ContestCard
          key={c.id}
          contest={c}
          onJoin={() => join(c.id)}
          busy={busyId === c.id}
        />
      ))}
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 hover:border-white/20 transition-all bg-gradient-to-b from-white/[0.04] to-black/60 backdrop-blur-md group"
    >
      {contest.bannerUrl ? (
        <img
          src={contest.bannerUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
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
      <div className="relative px-6 py-5 flex flex-col gap-3.5">
        <div className="flex items-center gap-2">
          <Trophy size={13} className="text-amber-400" strokeWidth={2} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.25em] text-whisper-gray group-hover:text-frost-white transition-colors font-semibold">
            {contest.visibility === 'public'
              ? 'Публичный конкурс'
              : contest.visibility === 'private'
                ? 'Приватный конкурс'
                : 'Глобальный конкурс'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[18px] sm:text-[20px] font-semibold leading-tight truncate">
              {contest.title}
            </div>
            {contest.description && (
              <div className="mt-1 font-roobert text-[12px] text-whisper-gray line-clamp-2">
                {contest.description}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-roobert text-amber-400 text-[20px] font-bold leading-none tabular-nums">
              {contest.prizePool.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}{' '}
              <span className="text-[12px] text-whisper-gray font-normal">zł</span>
            </div>
            <div className="mt-1 font-roobert text-[10px] text-whisper-gray tabular-nums font-medium">
              {contest.winnersCount} призовых мест
            </div>
          </div>
        </div>

        <RulesPreview rules={contest.rules} />

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 font-roobert text-[11px] text-whisper-gray tabular-nums font-medium">
              <Users size={12} strokeWidth={2} />
              {contest.participantCount} участников
            </span>
            <span className="font-roobert text-[11px] text-amber-300/90 tabular-nums font-medium">
              {(contest as any).cycleState === 'ended' ? 'до начала' : 'до конца'} {remaining}
            </span>
          </div>
          {contest.visibility === 'global' ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-white/15 bg-white/[0.05] font-roobert text-[11px] font-bold uppercase tracking-[0.15em] text-frost-white/90">
              Автоучастие
            </span>
          ) : contest.joined ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-emerald-500/40 bg-emerald-500/10 font-roobert text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300">
              Участвую
            </span>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); onJoin(); }}
              disabled={busy || contest.joined}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-frost-white text-midnight-canvas font-roobert text-[11px] font-bold uppercase tracking-[0.18em] shadow-md transition-transform disabled:opacity-50"
            >
              Участвовать
              <ArrowRight size={12} strokeWidth={2.2} />
            </motion.button>
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
          className="inline-flex items-center px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.05] font-roobert text-[10px] text-frost-white/90 font-medium"
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
