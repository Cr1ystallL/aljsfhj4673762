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
              Bonuses
            </span>
            <Sparkles size={16} className="text-frost-white/85 shrink-0" strokeWidth={1.6} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04]">
            <span className="font-roobert text-frost-white text-[12px] tabular-nums leading-none">
              {(balance?.amount ?? 0).toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="font-roobert text-whisper-gray text-[10px] leading-none">zł</span>
          </div>
        </div>

        <PromoCodeHero onRedeemed={() => void fetchBalance()} />

        <LuckyWheelHero onWin={() => void fetchBalance()} />

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
      toast.warn('Enter a promo code');
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
        reportApiError(res, json, 'Could not redeem promo code');
        return;
      }
      toast.success(
        `+${Number(json.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} zł`,
        { title: 'Promo applied' }
      );
      setCode('');
      // Update store immediately + double-check via fetch.
      const balance = useBalanceStore.getState().balance;
      if (balance) useBalanceStore.getState().updateBalance(Number(json.balance ?? balance.amount));
      onRedeemed();
    } catch {
      toast.error('Network error, try again');
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
            Promo
          </span>
          <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-light leading-tight">
            Activate code,
            <br />
            claim a bonus
          </h2>
        </div>
        <Gem />
      </div>

      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6 flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="ENTER CODE"
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
          Apply
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
      className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_4px_22px_rgba(160,224,171,0.45)]"
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        {/* Brilliant-cut diamond gradient: white-to-icy-blue with
            a green-tinted bottom that hints at our brand palette. */}
        <linearGradient id="diaCrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#dff7ff" />
          <stop offset="100%" stopColor="#9ec7d6" />
        </linearGradient>
        <linearGradient id="diaPavilion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ec7d6" />
          <stop offset="55%" stopColor="#7da7c0" />
          <stop offset="100%" stopColor="#3b6478" />
        </linearGradient>
        <linearGradient id="diaTable" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cdeaf6" />
        </linearGradient>
        <radialGradient id="diaSparkle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.4)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* Pavilion (lower V) */}
      <polygon
        points="14,28 66,28 40,72"
        fill="url(#diaPavilion)"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="1"
      />
      {/* Crown (upper trapezoid) */}
      <polygon
        points="14,28 66,28 56,12 24,12"
        fill="url(#diaCrown)"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="1"
      />
      {/* Table (centre flat) */}
      <polygon
        points="24,12 56,12 50,20 30,20"
        fill="url(#diaTable)"
        stroke="rgba(0,0,0,0.30)"
        strokeWidth="0.8"
      />

      {/* Facet seams */}
      <line x1="14" y1="28" x2="40" y2="72" stroke="rgba(0,0,0,0.30)" strokeWidth="0.7" />
      <line x1="66" y1="28" x2="40" y2="72" stroke="rgba(0,0,0,0.30)" strokeWidth="0.7" />
      <line x1="24" y1="12" x2="14" y2="28" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="56" y1="12" x2="66" y2="28" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="30" y1="20" x2="14" y2="28" stroke="rgba(0,0,0,0.20)" strokeWidth="0.5" />
      <line x1="50" y1="20" x2="66" y2="28" stroke="rgba(0,0,0,0.20)" strokeWidth="0.5" />
      <line x1="40" y1="20" x2="40" y2="72" stroke="rgba(0,0,0,0.20)" strokeWidth="0.5" />
      <line x1="14" y1="28" x2="66" y2="28" stroke="rgba(0,0,0,0.30)" strokeWidth="0.6" />

      {/* Animated sparkles — three white-to-transparent dots that
          fade in and out at staggered intervals so the diamond reads
          as actually catching light. */}
      <motion.circle
        cx="32"
        cy="16"
        r="2.5"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="48"
        cy="32"
        r="1.8"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 1, 0], scale: [0.4, 1.1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
      />
      <motion.circle
        cx="40"
        cy="50"
        r="1.4"
        fill="url(#diaSparkle)"
        animate={{ opacity: [0, 0.9, 0], scale: [0.3, 1, 0.3] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
      />

      {/* Table-top hot highlight — a small swooshing glint along the
          flat top of the diamond. */}
      <motion.polygon
        points="32,14 38,13 36,18 30,18"
        fill="rgba(255,255,255,0.85)"
        animate={{ opacity: [0.2, 0.95, 0.2] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
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

const SECTOR_TIER_COLOR: Record<number, string> = {
  0.05: '#a0e0ab',
  0.1: '#a0e0ab',
  0.25: '#cfe07f',
  0.5: '#ffac2e',
  0.75: '#ff8a3a',
  1.0: '#ff5a3a',
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

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [load]);

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
          `+${sectorAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} zł`,
          { title: 'Lucky spin' }
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
      toast.error('Network error, try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-card border border-white/10">
      {/* Deep Ocean radial — replaces the reference's purple */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(20, 20, 26, 1) 0%, rgba(10, 12, 16, 1) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 110%, rgba(255, 172, 46, 0.30) 0%, rgba(165, 45, 37, 0.18) 35%, transparent 75%)',
        }}
      />
      {/* Sun-rays pattern */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          background: `repeating-conic-gradient(from 220deg at 50% 110%, rgba(255,172,46,0.35) 0deg, rgba(255,172,46,0.35) 8deg, transparent 8deg, transparent 18deg)`,
          maskImage: 'radial-gradient(120% 90% at 50% 110%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 90% at 50% 110%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative px-5 pt-5 sm:px-6 sm:pt-6 flex flex-col gap-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          Lucky Wheel
        </span>
        <h2 className="font-roobert text-frost-white text-[22px] sm:text-[26px] font-light leading-tight">
          Spin up to{' '}
          <span className="text-[#a0e0ab] underline underline-offset-4 decoration-[#a0e0ab]/60">
            10
          </span>{' '}
          times a day, win up to{' '}
          <span className="text-[#ffac2e] underline underline-offset-4 decoration-[#ffac2e]/60">
            1.00 zł
          </span>{' '}
          on your balance
        </h2>
      </div>

      <div className="relative px-3 pb-3 pt-3">
        <div
          className="relative w-full max-w-[360px] mx-auto"
          style={{ aspectRatio: '1 / 1' }}
        >
          <FullWheelCanvas
            spinRef={spinRef}
            idleRotationRef={idleRotationRef}
          />
        </div>

        <div className="mt-3 flex justify-center">
          <button
            onClick={spin}
            disabled={!canSpin}
            className={cn(
              'h-12 px-9 rounded-pill font-roobert font-semibold text-[14px] uppercase tracking-[0.22em] inline-flex items-center gap-1.5 transition-all active:scale-[0.98]',
              canSpin
                ? 'text-midnight-canvas'
                : 'bg-white/[0.08] text-frost-white/55 border border-white/15 cursor-not-allowed'
            )}
            style={
              canSpin
                ? {
                    background:
                      'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(207, 224, 127) 100%)',
                    boxShadow:
                      '0 6px 22px rgba(160, 224, 171, 0.42), inset 0 1px 0 rgba(255,255,255,0.45)',
                  }
                : undefined
            }
          >
            {onCooldown
              ? `Wait ${Math.ceil(cooldownLeftMs / 1000)}s`
              : noSpins
                ? 'Come back tomorrow'
                : 'Spin'}
            {canSpin && <ChevronRight size={14} strokeWidth={2.2} />}
          </button>
        </div>

        <div className="mt-2 text-center font-roobert text-[11px] text-whisper-gray tabular-nums">
          {state ? `${state.remaining} of ${state.dailyCap} spins left` : '—'}
        </div>
      </div>

      {state && state.ticker.length > 0 && (
        <div className="relative border-t border-white/10 px-3 py-2 overflow-x-auto scrollbar-hide flex items-center gap-2">
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
              <span className="font-roobert text-[10px] tabular-nums text-[#a0e0ab]">
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
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 1);
        ctx.fillStyle = '#0a0a0a';
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

      // Tick studs on the bezel (24 pulsing dots) — they don't rotate.
      const time = performance.now() / 1000;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * radius * 1.085;
        const sy = cy + Math.sin(a) * radius * 1.085;
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.5 + i * 0.5);
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${0.3 + pulse * 0.5})`;
        ctx.fill();
      }

      // Top pointer — pill with downward notch
      const ptCx = cx;
      const ptCy = cy - radius * 1.05;
      ctx.save();
      ctx.translate(ptCx, ptCy);
      // Halo
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fill();
      // Pill
      const pillW = 38;
      const pillH = 14;
      ctx.beginPath();
      ctx.moveTo(-pillW / 2, -pillH / 2);
      ctx.arcTo(-pillW / 2 - 4, -pillH / 2, -pillW / 2 - 4, pillH / 2, pillH / 2);
      ctx.arcTo(-pillW / 2 - 4, pillH / 2, -pillW / 2, pillH / 2, pillH / 2);
      ctx.lineTo(pillW / 2, pillH / 2);
      ctx.arcTo(pillW / 2 + 4, pillH / 2, pillW / 2 + 4, -pillH / 2, pillH / 2);
      ctx.arcTo(pillW / 2 + 4, -pillH / 2, pillW / 2, -pillH / 2, pillH / 2);
      ctx.closePath();
      const pGrad = ctx.createLinearGradient(0, -pillH / 2, 0, pillH / 2);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(1, '#cccccc');
      ctx.fillStyle = pGrad;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();
      // Notch (triangle pointing down at the wheel rim)
      ctx.beginPath();
      ctx.moveTo(-6, pillH / 2);
      ctx.lineTo(0, pillH / 2 + 9);
      ctx.lineTo(6, pillH / 2);
      ctx.closePath();
      const nGrad = ctx.createLinearGradient(0, pillH / 2, 0, pillH / 2 + 9);
      nGrad.addColorStop(0, '#ffffff');
      nGrad.addColorStop(1, '#bbbbbb');
      ctx.fillStyle = nGrad;
      ctx.fill();
      ctx.stroke();
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
        reportApiError(res, json, 'Could not join');
        return;
      }
      toast.success('Joined');
      void load();
    } finally {
      setBusyId(null);
    }
  };

  void currentUserId;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
          Contests
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
          No contests right now. Check back soon.
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card border border-white/10"
    >
      {/* Banner art (admin-uploaded) — falls back to the gradient wash */}
      {contest.bannerUrl ? (
        <div
          aria-hidden
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `url(${contest.bannerUrl})`,
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
            {contest.visibility === 'public'
              ? 'Public contest'
              : contest.visibility === 'private'
                ? 'Private contest'
                : 'Global contest'}
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
              {contest.prizePool.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
              <span className="text-[12px] text-whisper-gray">zł</span>
            </div>
            <div className="mt-1 font-roobert text-[10px] text-whisper-gray tabular-nums">
              {contest.winnersCount} winners
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
              ends in {remaining}
            </span>
          </div>
          {contest.visibility === 'global' ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[11px] uppercase tracking-[0.18em] text-frost-white/85">
              Auto-entry
            </span>
          ) : contest.joined ? (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill border border-[rgba(160,224,171,0.55)] bg-[rgba(160,224,171,0.10)] font-roobert text-[11px] uppercase tracking-[0.18em] text-frost-white">
              Joined
            </span>
          ) : (
            <button
              onClick={onJoin}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[11px] uppercase tracking-[0.2em] active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              Join
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
      return `Deposits ≥ ${o.amount} zł in last ${o.days}d`;
    case 'wagered_window':
      return `Wagered ≥ ${o.amount} zł in last ${o.days}d`;
    case 'deposit_total':
      return `Lifetime deposits ≥ ${o.amount} zł`;
    case 'referrals':
      return `${o.count}+ referrals`;
    case 'registered_after':
      return `Registered after ${typeof o.date === 'string' ? o.date.slice(0, 10) : ''}`;
    default:
      return null;
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'closed';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

void AnimatePresence;
