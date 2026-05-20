'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift,
  Sparkles,
  Ticket,
  Users,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/brand-mark';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * Bonuses Page — Monopo Saigon Style
 *
 * Three sections:
 *   1. Promo code redemption — single input + active indicator.
 *   2. Lucky Wheel — daily free spins, sectors 0.05..1.00 zł, 10/day,
 *      20-min cooldown. The wheel idle-spins gently while waiting,
 *      mirroring the in-game `Wheel` page so the surface stays alive.
 *   3. Contests — list of public + joined-private contests with prize
 *      pool, deadline, eligibility and join CTA.
 *
 * Visual identity stays Midnight Canvas + Deep Ocean gradient + Roobert.
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
  visibility: 'public' | 'private';
  prizePool: number;
  winnersCount: number;
  prizeShares: unknown;
  rules: unknown;
  startsAt: number;
  endsAt: number;
  state: string;
  joined: boolean;
  participantCount: number;
}

export default function BonusesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const balance = useBalanceStore((s) => s.balance);
  const { fetchBalance } = useBalance();

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* Top bar — same identity strip as in-game pages */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-3 min-w-0">
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
          </div>

          <button
            onClick={() => router.push('/balance')}
            aria-label="Wallet"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill border border-white/15 bg-white/[0.04] hover:border-white/25 transition-colors"
          >
            <Gift size={12} className="text-frost-white/70" strokeWidth={1.8} />
            <span className="font-roobert text-frost-white text-[12px] tabular-nums leading-none">
              {(balance?.amount ?? 0).toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="font-roobert text-whisper-gray text-[10px] leading-none">zł</span>
          </button>
        </div>

        <PromoCodeCard onRedeemed={() => void fetchBalance()} />

        <LuckyWheelCard onWin={() => void fetchBalance()} />

        <ContestsList currentUserId={user?.id ?? null} />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Promo code                                                                 */
/* -------------------------------------------------------------------------- */

function PromoCodeCard({ onRedeemed }: { onRedeemed: () => void }) {
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
      onRedeemed();
    } catch {
      toast.error('Network error, try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-55 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 110% at 0% 0%, rgba(160, 224, 171, 0.22) 0%, rgba(255, 172, 46, 0.12) 45%, transparent 75%)',
        }}
      />
      <div className="relative px-5 py-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            Promo code
          </span>
          <Ticket size={12} className="text-frost-white/55" strokeWidth={1.7} />
        </div>
        <div className="font-roobert text-frost-white text-[20px] sm:text-[22px] leading-tight">
          Redeem a code, claim your bonus
        </div>
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="ENTER CODE"
            maxLength={32}
            className="flex-1 min-w-0 h-11 px-4 rounded-pill border border-white/15 bg-white/[0.06] font-roobert text-[14px] tracking-[0.18em] text-frost-white placeholder:text-whisper-gray focus:outline-none focus:border-white/30"
          />
          <button
            onClick={submit}
            disabled={busy}
            className={cn(
              'h-11 px-4 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-all active:scale-[0.97]',
              busy
                ? 'bg-white/[0.06] text-frost-white/60 cursor-not-allowed'
                : 'bg-frost-white text-midnight-canvas hover:bg-frost-white/95'
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Lucky Wheel                                                                */
/* -------------------------------------------------------------------------- */

const SECTOR_COLORS = [
  '#a0e0ab', // 0.05
  '#cfe07f', // 0.10
  '#ffac2e', // 0.25
  '#ff8a3a', // 0.50
  '#e85a3a', // 0.75
  '#a52d25', // 1.00
];

function LuckyWheelCard({ onWin }: { onWin: () => void }) {
  const [state, setState] = useState<WheelStateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Spin lock while the animation runs. */
  const spinRef = useRef<{
    startedAt: number;
    durationMs: number;
    targetIndex: number;
    initialRotation: number;
  } | null>(null);
  const [, forceTick] = useState(0);

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
      // best-effort
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
      // Lock spin and let the animation play out.
      const sectorIndex = Number(json.sectorIndex);
      spinRef.current = {
        startedAt: Date.now(),
        durationMs: 4500,
        targetIndex: sectorIndex,
        initialRotation: idleRotationRef.current,
      };
      forceTick((n) => n + 1);
      setTimeout(() => {
        toast.success(
          `+${Number(json.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} zł`,
          { title: 'Lucky spin' }
        );
        spinRef.current = null;
        forceTick((n) => n + 1);
        onWin();
        void load();
      }, 4500);
    } catch {
      toast.error('Network error, try again');
    } finally {
      setBusy(false);
    }
  };

  // Idle rotation accumulates while the user hasn't spun yet — reads
  // from the canvas tick so it matches the Wheel game's idle drift.
  const idleRotationRef = useRef(0);

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-[#ffac2e]" strokeWidth={1.7} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
            Lucky Wheel
          </span>
        </div>
        <span className="font-roobert text-[11px] text-frost-white/85 tabular-nums">
          {state ? `${state.remaining}/${state.dailyCap}` : '—/—'} spins
        </span>
      </div>

      <div className="relative px-4 pt-4 pb-4">
        <div className="relative aspect-square max-w-[320px] mx-auto">
          <LuckyCanvas spinRef={spinRef} idleRotationRef={idleRotationRef} />
        </div>

        <div className="mt-3 flex items-center justify-center">
          {onCooldown ? (
            <div className="font-roobert text-[12px] text-whisper-gray tabular-nums">
              Next spin in {Math.ceil(cooldownLeftMs / 1000)}s
            </div>
          ) : noSpins ? (
            <div className="font-roobert text-[12px] text-whisper-gray">
              Come back tomorrow for more
            </div>
          ) : (
            <button
              onClick={spin}
              disabled={!canSpin}
              className={cn(
                'h-11 px-6 rounded-pill font-roobert text-[12px] uppercase tracking-[0.22em] transition-all active:scale-[0.99]',
                canSpin
                  ? 'text-midnight-canvas shadow-[0_4px_18px_rgba(255,172,46,0.30)]'
                  : 'bg-white/[0.06] text-frost-white/60 cursor-not-allowed'
              )}
              style={
                canSpin
                  ? {
                      background:
                        'linear-gradient(90deg, rgb(160, 224, 171) 0%, rgb(255, 172, 46) 50%, rgb(165, 45, 37) 100%)',
                    }
                  : undefined
              }
            >
              Spin
            </button>
          )}
        </div>
      </div>

      {state && state.ticker.length > 0 && (
        <div className="border-t border-white/10 px-3 py-2 overflow-x-auto scrollbar-hide flex items-center gap-2">
          {state.ticker.slice(0, 8).map((t, i) => (
            <div
              key={i}
              className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-pill border border-white/10 bg-white/[0.03]"
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
              <span className="font-roobert text-[10px] text-frost-white/85 truncate max-w-[60px]">
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

function LuckyCanvas({
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

    const SECTORS = [0.05, 0.1, 0.25, 0.5, 0.75, 1.0];
    const SEG = (2 * Math.PI) / SECTORS.length;

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

      // Compute current rotation.
      let rotation = idleRotationRef.current;
      if (spinRef.current) {
        const lock = spinRef.current;
        const t = Math.min(1, (Date.now() - lock.startedAt) / lock.durationMs);
        const targetCenter = -lock.targetIndex * SEG - SEG / 2;
        const totalRotation =
          5 * 2 * Math.PI + targetCenter - lock.initialRotation;
        // Three-phase ease: linear cruise → ease-out brake → settle.
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
        // Gentle idle drift while no spin is running.
        idleRotationRef.current += dt * 0.0004;
        rotation = idleRotationRef.current;
      }

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;

      // Drop shadow under wheel
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + radius * 0.95,
        radius * 0.85,
        radius * 0.12,
        0,
        0,
        Math.PI * 2
      );
      const shadow = ctx.createRadialGradient(
        cx,
        cy + radius * 0.95,
        0,
        cx,
        cy + radius * 0.95,
        radius * 0.85
      );
      shadow.addColorStop(0, 'rgba(0,0,0,0.5)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.fill();

      // Outer glow
      const glow = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.9,
        cx,
        cy,
        radius * 1.18
      );
      glow.addColorStop(0, 'rgba(255, 200, 110, 0)');
      glow.addColorStop(0.5, 'rgba(255, 172, 46, 0.10)');
      glow.addColorStop(1, 'rgba(255, 172, 46, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Outer rim
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation - Math.PI / 2);

      // Sector bodies
      for (let i = 0; i < SECTORS.length; i++) {
        const a0 = i * SEG;
        const a1 = (i + 1) * SEG;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a0, a1);
        ctx.closePath();
        ctx.fillStyle = SECTOR_COLORS[i];
        ctx.fill();
      }
      // Sector dividers
      for (let i = 0; i < SECTORS.length; i++) {
        const a = i * SEG;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Labels
      ctx.font = '700 13px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < SECTORS.length; i++) {
        const a0 = i * SEG;
        const a1 = (i + 1) * SEG;
        const aMid = (a0 + a1) / 2;
        const lx = Math.cos(aMid) * radius * 0.7;
        const ly = Math.sin(aMid) * radius * 0.7;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(aMid + Math.PI / 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 1);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillText(`${SECTORS[i].toFixed(2)} zł`, 0, 0);
        ctx.restore();
      }
      // Hub
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
      const hubGrad = ctx.createRadialGradient(
        -radius * 0.06,
        -radius * 0.06,
        0,
        0,
        0,
        radius * 0.18
      );
      hubGrad.addColorStop(0, 'rgba(255, 220, 150, 1)');
      hubGrad.addColorStop(0.5, 'rgba(220, 170, 80, 1)');
      hubGrad.addColorStop(1, 'rgba(120, 80, 30, 1)');
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // Top pointer
      const px = cx;
      const py = cy - radius * 1.04;
      ctx.beginPath();
      ctx.arc(px, py + 6, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(px - 11, py - 8);
      ctx.lineTo(px + 11, py - 8);
      ctx.lineTo(px + 8, py - 1);
      ctx.lineTo(px, py + 16);
      ctx.lineTo(px - 8, py - 1);
      ctx.closePath();
      const pGrad = ctx.createLinearGradient(px, py - 8, px, py + 16);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(1, '#cccccc');
      ctx.fillStyle = pGrad;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.stroke();
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
      className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 90% at 100% 100%, rgba(255, 172, 46, 0.20) 0%, rgba(160, 224, 171, 0.10) 50%, transparent 80%)',
        }}
      />
      <div className="relative px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Trophy size={12} className="text-[#ffac2e]" strokeWidth={1.7} />
          <span className="font-roobert text-[10px] uppercase tracking-[0.28em] text-whisper-gray">
            {contest.visibility === 'public' ? 'Public contest' : 'Private contest'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-roobert text-frost-white text-[18px] sm:text-[20px] leading-tight truncate">
              {contest.title}
            </div>
            {contest.description && (
              <div className="mt-1 font-roobert text-[12px] text-whisper-gray line-clamp-2">
                {contest.description}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-roobert text-frost-white text-[20px] font-light leading-none tabular-nums">
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
          {contest.joined ? (
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

void AnimatePresence; // referenced in case we add modals later
