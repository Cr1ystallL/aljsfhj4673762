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
    <svg
      viewBox="0 0 80 80"
      className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_4px_20px_rgba(255,172,46,0.35)]"
    >
      <defs>
        <linearGradient id="gemFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(255, 220, 150)" />
          <stop offset="55%" stopColor="rgb(255, 172, 46)" />
          <stop offset="100%" stopColor="rgb(165, 45, 37)" />
        </linearGradient>
        <linearGradient id="gemTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,210,140,0.4)" />
        </linearGradient>
      </defs>
      <polygon
        points="40,8 64,28 56,68 24,68 16,28"
        fill="url(#gemFace)"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="1.2"
      />
      <polygon
        points="40,8 64,28 16,28"
        fill="url(#gemTop)"
        opacity="0.85"
      />
      <line x1="40" y1="8" x2="40" y2="68" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <line x1="16" y1="28" x2="40" y2="68" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <line x1="64" y1="28" x2="40" y2="68" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <polygon
        points="36,12 30,26 38,16"
        fill="rgba(255,255,255,0.5)"
      />
    </svg>
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
        durationMs: 4500,
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
      }, 4500);
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
          className="relative w-full"
          style={{ aspectRatio: '2 / 1.15' }}
        >
          <HalfWheelCanvas
            spinRef={spinRef}
            idleRotationRef={idleRotationRef}
          />
          {/* Spin button anchored where the hub would be, just below
              center of the half-circle. */}
          <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
            <button
              onClick={spin}
              disabled={!canSpin}
              className={cn(
                'pointer-events-auto h-11 px-7 rounded-pill font-roobert font-semibold text-[13px] uppercase tracking-[0.22em] inline-flex items-center gap-1.5 transition-all active:scale-[0.98]',
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
                        '0 6px 18px rgba(160, 224, 171, 0.40), inset 0 1px 0 rgba(255,255,255,0.40)',
                    }
                  : undefined
              }
            >
              {onCooldown
                ? `Wait ${Math.ceil(cooldownLeftMs / 1000)}s`
                : noSpins
                  ? 'Come back tomorrow'
                  : 'Spin'}
              {canSpin && <ChevronRight size={13} strokeWidth={2.2} />}
            </button>
          </div>
        </div>

        <div className="mt-1 text-center font-roobert text-[11px] text-whisper-gray tabular-nums">
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

function HalfWheelCanvas({
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
     * The half-wheel covers the lower 180° of a circle, but each
     * "sector" only occupies a 30° wedge (180/12). The center of the
     * wheel sits at the bottom of the canvas; the rim touches the top.
     * Sector 0 occupies the leftmost wedge and goes clockwise.
     */
    const ARC_PER_SECTOR = Math.PI / N;

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

      // Compute current rotation. For half-wheels, "rotation" rotates
      // the sector strip relative to the pointer at the top.
      let rotation = idleRotationRef.current;
      if (spinRef.current) {
        const lock = spinRef.current;
        const t = Math.min(1, (Date.now() - lock.startedAt) / lock.durationMs);
        // Pointer sits at the top of the half-wheel (angle = -PI/2 in
        // canvas coordinates). To land sector `targetIndex` under it,
        // we want sector center at angle -PI/2.
        // Sector i center sits at angle (i + 0.5) * ARC_PER_SECTOR
        // from the leftmost rim — i.e. +PI + (i+0.5)*ARC_PER_SECTOR
        // measured clockwise from canvas 0°. We want to rotate so that
        // becomes -PI/2 ≡ 3PI/2.
        const targetAngle =
          -Math.PI / 2 - ((lock.targetIndex + 0.5) * ARC_PER_SECTOR + Math.PI);
        // Add 4 full rotations so the user sees movement.
        const totalRotation =
          4 * 2 * Math.PI + targetAngle - lock.initialRotation;
        let progressed: number;
        if (t < 0.7) progressed = (t / 0.7) * 0.78;
        else if (t < 0.92) {
          const tt = (t - 0.7) / 0.22;
          progressed = 0.78 + (1 - 0.78) * (1 - Math.pow(1 - tt, 3));
        } else {
          progressed = 1;
        }
        rotation = lock.initialRotation + totalRotation * progressed;
      } else {
        idleRotationRef.current += dt * 0.0003;
        rotation = idleRotationRef.current;
      }

      // Wheel center anchored at the bottom of the canvas, slightly
      // below the visible area so only the upper half-circle shows.
      const cx = w / 2;
      const cy = h * 0.95;
      const radius = Math.min(w * 0.46, h * 0.92);

      // Outer glow ring beneath the wheel
      const glow = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.7,
        cx,
        cy,
        radius * 1.18
      );
      glow.addColorStop(0, 'rgba(160, 224, 171, 0)');
      glow.addColorStop(0.55, 'rgba(255, 172, 46, 0.22)');
      glow.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.2, Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      // Sectors fill — only render the visible upper half (angles
      // from PI to 2*PI = -PI..0). Without rotation, sector i covers
      // [PI + i*arc, PI + (i+1)*arc] in canvas coords.
      for (let i = 0; i < N; i++) {
        const a0 = Math.PI + i * ARC_PER_SECTOR;
        const a1 = Math.PI + (i + 1) * ARC_PER_SECTOR;
        const inner = radius * 0.46;
        const outer = radius * 0.95;

        // Soft 3D gradient — bright lime/orange tier color with
        // shading toward the inner edge.
        const tier = SECTOR_TIER_COLOR[SECTORS[i]] ?? '#a0e0ab';
        const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.05, tier);
        grad.addColorStop(0.95, tier);
        grad.addColorStop(1, shade(tier, -0.15));
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.arc(0, 0, outer, a0 + 0.018, a1 - 0.018); // small gap = pill look
        ctx.arc(0, 0, inner, a1 - 0.018, a0 + 0.018, true);
        ctx.closePath();
        ctx.fill();

        // Outer rim highlight
        ctx.beginPath();
        ctx.arc(0, 0, outer + 0.5, a0 + 0.018, a1 - 0.018);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.stroke();

        // Label — payout amount, arranged along the wedge midline
        const aMid = (a0 + a1) / 2;
        const lr = (inner + outer) / 2;
        const lx = Math.cos(aMid) * lr;
        const ly = Math.sin(aMid) * lr;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(aMid + Math.PI / 2);
        ctx.font = '700 11px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 1);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 0);
        ctx.restore();
      }

      ctx.restore();

      // Pointer at the top — short pill with a notch. We render it in
      // unrotated coords so it stays put while the wheel spins under
      // it. The pointer points toward the wheel center (downward).
      const ptCx = cx;
      const ptCy = cy - radius * 0.99;
      ctx.save();
      ctx.translate(ptCx, ptCy);
      // Soft halo
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fill();
      // Pill
      const pillW = 36;
      const pillH = 12;
      ctx.beginPath();
      ctx.moveTo(-pillW / 2, -pillH / 2);
      ctx.arcTo(-pillW / 2 - 3, -pillH / 2, -pillW / 2 - 3, pillH / 2, pillH / 2);
      ctx.arcTo(-pillW / 2 - 3, pillH / 2, -pillW / 2, pillH / 2, pillH / 2);
      ctx.lineTo(pillW / 2, pillH / 2);
      ctx.arcTo(pillW / 2 + 3, pillH / 2, pillW / 2 + 3, -pillH / 2, pillH / 2);
      ctx.arcTo(pillW / 2 + 3, -pillH / 2, pillW / 2, -pillH / 2, pillH / 2);
      ctx.closePath();
      const pGrad = ctx.createLinearGradient(0, -pillH / 2, 0, pillH / 2);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(1, '#d0d0d0');
      ctx.fillStyle = pGrad;
      ctx.fill();
      // Notch (small triangle pointing down at the wheel)
      ctx.beginPath();
      ctx.moveTo(-5, pillH / 2);
      ctx.lineTo(0, pillH / 2 + 7);
      ctx.lineTo(5, pillH / 2);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
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
      return `Deposit ≥ ${o.amount} zł in last ${o.days}d`;
    case 'wagered_window':
      return `Wager ≥ ${o.amount} zł in last ${o.days}d`;
    case 'deposit_total':
      return `Lifetime deposit ≥ ${o.amount} zł`;
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
