'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { Disc3, Coins, Users, Shield, Wifi, ChevronDown } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * Wheel of Fortune — premium redesign.
 *
 * Visual stack (drawn into canvas, single-pass per frame):
 *
 *   1. Atmospheric background — radial wash, brand-tinted.
 *   2. Outer rim (decorative ring) with subtle glow.
 *   3. Tick studs — small bright dots evenly spaced around the rim,
 *      so the wheel reads as a real fortune wheel.
 *   4. Sector body — flat tier colour, no gradient (cleaner read at
 *      small sizes). Soft inner shadow on the back-to-front edge for
 *      depth.
 *   5. Sector divider strokes — thin black/dark, gives crisp segment
 *      boundaries.
 *   6. Sector labels — bold, tabular, large.
 *   7. Central hub — concentric rings (outer ring + inner darker ring
 *      + brass dot in the middle).
 *   8. Top pointer — premium downward triangle with a tiny "anvil"
 *      base, white body, dark border, soft shadow.
 *
 * Animation:
 *   - Idle drift in waiting phase.
 *   - Cubic-out spin tied to the server's spin window (5s).
 *   - On completed phase the wheel parks on the resolved segment.
 *
 * UI text in English throughout.
 */

type Phase = 'waiting' | 'spinning' | 'completed';

interface Snapshot {
  phase: Phase;
  segmentIndex: number | null;
  multiplier: number | null;
  bets: Array<{
    userId: string;
    name: string;
    photoUrl: string | null;
    amount: number;
    pick: number;
    won?: boolean;
    payout?: number;
  }>;
  history: Array<{
    roundId: string;
    segmentIndex: number;
    multiplier: number;
    timestamp: number;
  }>;
  waitingEndsAt: number | null;
  serverSeedHash: string;
  spinStartedAt: number | null;
  spinDurationMs: number;
  stats: { playerCount: number; totalWagered: number };
}

/**
 * Single solid colour per multiplier — the rim ring + label + history
 * chip all share these.
 */
const SEG_COLOR: Record<
  number,
  { base: string; rim: string; light: string; deep: string }
> = {
  2: {
    base: '#4a8b62',
    rim: 'rgba(160, 224, 171, 0.85)',
    light: '#5fb37d',
    deep: '#2f5a3f',
  },
  3: {
    base: '#bb8a44',
    rim: 'rgba(255, 200, 110, 0.85)',
    light: '#dca654',
    deep: '#7a5a2a',
  },
  5: {
    base: '#c46a3a',
    rim: 'rgba(255, 150, 80, 0.9)',
    light: '#e88550',
    deep: '#7a4020',
  },
  30: {
    base: '#b03a30',
    rim: 'rgba(255, 100, 90, 0.95)',
    light: '#d65043',
    deep: '#6e2018',
  },
};

const PICKS: number[] = [2, 3, 5, 30];

export default function WheelPage() {
  const { balance, fetchBalance } = useBalance();
  const [layout, setLayout] = useState<number[] | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pick, setPick] = useState<number>(2);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);

  const lastPhaseRef = useRef<Phase | null>(null);
  const lastUiPhaseRef = useRef<Phase | null>(null);
  const spinRuntimeRef = useRef<{
    startedAt: number;
    durationMs: number;
    seg: number | null;
  } | null>(null);
  const [phaseTick, setPhaseTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/games/wheel/state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      setSnap(j.state as Snapshot);
      setLayout(j.layout as number[]);
    } catch {
      // best-effort
    }
  }, []);

  const pollMs = useMemo(() => {
    if (snap?.phase === 'spinning') return 250;
    if (snap?.phase === 'waiting' && snap.waitingEndsAt) {
      const remainingMs = snap.waitingEndsAt - Date.now();
      if (remainingMs < 3200) return 200;
    }
    return 1200;
  }, [snap]);

  useEffect(() => {
    void load();
    void fetchBalance();
    soundManager.initialize();
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, fetchBalance, pollMs]);

  // Kick an extra fetch right as the countdown ends to remove the
  // post-timer pause before spinning.
  useEffect(() => {
    if (!snap || snap.phase !== 'waiting' || !snap.waitingEndsAt) return;
    const ms = snap.waitingEndsAt - Date.now();
    const id = setTimeout(() => {
      void load();
    }, Math.max(0, ms - 80));
    return () => clearTimeout(id);
  }, [snap, load]);

  // Track client-side spin window so UI stays in "spinning" until the
  // wheel fully settles, even if the server flips to completed a bit
  // earlier.
  useEffect(() => {
    if (!snap) return;
    if (snap.phase === 'waiting') {
      spinRuntimeRef.current = null;
      return;
    }
    if ((snap.phase === 'spinning' || snap.phase === 'completed') && snap.segmentIndex != null) {
      const startedAt = Math.min(snap.spinStartedAt ?? Date.now(), Date.now());
      const durationMs = snap.spinDurationMs || 12000;
      const current = spinRuntimeRef.current;
      if (!current || current.seg !== snap.segmentIndex || current.durationMs !== durationMs || current.startedAt !== startedAt) {
        spinRuntimeRef.current = {
          startedAt,
          durationMs,
          seg: snap.segmentIndex,
        };
      }
    }
  }, [snap]);

  // Heartbeat to recompute UI phase gating.
  useEffect(() => {
    const id = setInterval(() => setPhaseTick(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  const uiPhase: Phase = useMemo(() => {
    if (!snap) return 'waiting';
    const spin = spinRuntimeRef.current;
    if ((snap.phase === 'spinning' || snap.phase === 'completed') && spin) {
      const endAt = spin.startedAt + spin.durationMs;
      if (Date.now() < endAt - 30) return 'spinning';
    }
    return snap.phase;
  }, [snap, phaseTick]);

  useEffect(() => {
    if (!snap) return;
    if (lastPhaseRef.current && lastPhaseRef.current !== snap.phase) {
      if (snap.phase === 'spinning') soundManager.play('game.bet_placed');
    }
    lastPhaseRef.current = snap.phase;
  }, [snap]);

  useEffect(() => {
    if (!snap) return;
    if (lastUiPhaseRef.current && lastUiPhaseRef.current !== uiPhase) {
      if (uiPhase === 'completed') {
        soundManager.play('game.cashout');
        void fetchBalance();
      }
    }
    lastUiPhaseRef.current = uiPhase;
  }, [uiPhase, snap, fetchBalance]);

  const placeBet = async () => {
    if (busy) return;
    if (amount <= 0) {
      toast.warn('Введите сумму ставки');
      return;
    }
    const have = balance?.amount ?? 0;
    if (amount > have) {
      toast.warn(
        `Недостаточно средств — у вас ${have.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`
      );
      return;
    }
    if (snap?.phase !== 'waiting') {
      toast.warn('Приём ставок закрыт');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/games/wheel/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, pick }),
      });
      const j = await res.json();
      if (!res.ok) {
        reportApiError(res, j, 'Could not place bet');
        throw new Error(j?.message ?? 'bet failed');
      }
      soundManager.play('ui.click');
      void fetchBalance();
      void load();
    } catch (err) {
      console.error('wheel:bet', err);
    } finally {
      setBusy(false);
    }
  };

  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(balance?.amount ?? 10000)),
    [balance]
  );

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar title="Wheel" Icon={Disc3} />

        {snap && <HistoryStrip history={snap.history.slice(0, 12)} />}

        {/* Wheel stage */}
        <div className="relative rounded-card border border-white/10 bg-midnight-canvas overflow-hidden">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.22) 0%, rgba(255, 172, 46, 0.14) 35%, rgba(160, 224, 171, 0.10) 65%, transparent 85%)',
            }}
          />
          <div className="relative aspect-[1/1] sm:aspect-[4/3] flex items-center justify-center">
            <Wheel layout={layout} snap={snap} uiPhase={uiPhase} />
          </div>
        </div>

        <PhasePill snap={snap} />

        {/* Pick chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {PICKS.map((p) => {
            const c = SEG_COLOR[p];
            const active = pick === p;
            return (
              <button
                key={p}
                onClick={() => setPick(p)}
                className={cn(
                  'shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-pill border font-roobert font-semibold tabular-nums text-[13px] transition-all active:scale-[0.97]',
                  active
                    ? 'text-frost-white shadow-[0_0_18px_rgba(255,172,46,0.18)]'
                    : 'text-frost-white/85 border-white/10 bg-white/[0.03]'
                )}
                style={
                  active
                    ? {
                        borderColor: c.rim,
                        background: `${c.base}55`,
                      }
                    : undefined
                }
              >
                ×{p}
              </button>
            );
          })}
        </div>

        {/* Bet panel */}
        <div className="rounded-card border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="grid grid-cols-2 items-center">
            <div className="px-4 py-3 border-r border-white/10">
              <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                Bet
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  step={1}
                  min={minBet}
                  max={maxBet}
                  value={amount}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v))
                      setAmount(Math.max(minBet, Math.min(maxBet, v)));
                  }}
                  className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[20px] font-light tabular-nums focus:outline-none"
                />
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                Возможный выигрыш
              </div>
              <div className="mt-1.5 font-roobert text-[20px] font-light tabular-nums text-frost-white">
                {(amount * pick).toLocaleString('ru-RU', {
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[12px] text-whisper-gray">zł</span>
              </div>
            </div>
          </div>
          <div className="px-3 pb-3 pt-1 border-t border-white/10">
            <button
              onClick={placeBet}
              disabled={busy || uiPhase !== 'waiting'}
              className={cn(
                'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-all active:scale-[0.99]',
                uiPhase === 'waiting' && !busy
                  ? 'bg-frost-white text-midnight-canvas hover:bg-frost-white/95 shadow-[0_4px_18px_rgba(255,255,255,0.18)]'
                  : 'bg-white/[0.06] text-frost-white/65 border border-white/15 cursor-not-allowed'
              )}
            >
              {uiPhase === 'waiting'
                ? `Bet on ×${pick}`
                : uiPhase === 'spinning'
                  ? 'Spinning…'
                  : 'Round ended'}
            </button>
          </div>
        </div>

        {snap && (
          <BetsFeed bets={snap.bets} stats={snap.stats} phase={snap.phase} />
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function PhasePill({ snap }: { snap: Snapshot | null }) {
  if (!snap) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white/[0.05] border border-white/10">
        <Shield size={11} className="text-frost-white/60" strokeWidth={2} />
        <span className="text-[10px] font-roobert text-frost-white/70 tracking-wider">
          {snap.serverSeedHash
            ? `${snap.serverSeedHash.slice(0, 10)}…`
            : 'loading hash'}
        </span>
      </div>
    </div>
  );
}

function HistoryStrip({
  history,
}: {
  history: Array<{ multiplier: number }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history.slice(0, 20) : history.slice(0, 12);

  return (
    <div className="rounded-card bg-white/[0.04] border border-white/10 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            'flex-1 min-w-0',
            expanded
              ? 'flex flex-wrap gap-1.5'
              : 'flex items-center gap-1.5 overflow-x-auto scrollbar-hide'
          )}
        >
          {visible.length === 0 ? (
            <span className="text-whisper-gray text-[11px] font-roobert">
              History will appear after the first round
            </span>
          ) : (
            visible.map((h, i) => {
              const c = SEG_COLOR[h.multiplier];
              return (
                <span
                  key={i}
                  className="shrink-0 inline-flex items-center justify-center px-2.5 py-1 rounded-pill border font-roobert text-[11px] font-semibold tabular-nums"
                  style={{
                    background: `${c.base}66`,
                    borderColor: c.rim,
                    color: '#fff',
                  }}
                >
                  ×{h.multiplier}
                </span>
              );
            })
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 w-7 h-7 rounded-pill border border-white/15 flex items-center justify-center text-frost-white/70 hover:text-frost-white hover:border-white/25 transition-colors"
          aria-label="Toggle history"
        >
          <ChevronDown
            size={14}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>
    </div>
  );
}

function BetsFeed({
  bets,
  stats,
  phase,
}: {
  bets: Snapshot['bets'];
  stats: Snapshot['stats'];
  phase: Phase;
}) {
  const sorted = [...bets].sort((a, b) => b.amount - a.amount);
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-white/10">
        <div className="inline-flex items-center gap-1.5 text-whisper-gray font-roobert text-[10px] uppercase tracking-[0.2em]">
          <Users size={10} strokeWidth={2} />
          {stats.playerCount} игроков
        </div>
        <div className="inline-flex items-center gap-1.5 text-whisper-gray font-roobert text-[10px] uppercase tracking-[0.2em] justify-center">
          <Coins size={10} strokeWidth={2} />
          {stats.totalWagered.toLocaleString('ru-RU', {
            maximumFractionDigits: 0,
          })}{' '}
          zł
        </div>
        <div className="inline-flex items-center gap-1.5 text-whisper-gray font-roobert text-[10px] uppercase tracking-[0.2em] justify-end">
          <Wifi size={10} strokeWidth={2} />
          онлайн
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Игроки появятся, как только сделают ставку
          </div>
        )}
        {sorted.map((b) => {
          const c = SEG_COLOR[b.pick];
          return (
            <div
              key={b.userId + ':' + b.pick}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5"
            >
              {b.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.photoUrl}
                  alt={b.name}
                  className="w-7 h-7 rounded-pill border border-white/10 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-7 h-7 rounded-pill bg-white/10 flex items-center justify-center font-roobert text-[11px]">
                  {b.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="font-roobert text-[13px] text-frost-white truncate">
                  {b.name}
                </div>
                <div className="font-roobert text-[10px] text-whisper-gray tabular-nums">
                  {b.amount.toLocaleString('ru-RU', {
                    maximumFractionDigits: 2,
                  })}{' '}
                  zł · ×{b.pick}
                </div>
              </div>
              <div
                className="text-right font-roobert text-[12px] tabular-nums"
                style={{
                  color:
                    phase === 'completed'
                      ? b.won
                        ? c.rim
                        : 'rgba(255,138,118,0.8)'
                      : 'rgba(255,255,255,0.7)',
                }}
              >
                {phase === 'completed'
                  ? b.won && b.payout != null
                    ? `+${b.payout.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`
                    : '—'
                  : `×${b.pick}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Wheel canvas                                                               */
/* -------------------------------------------------------------------------- */

function Wheel({
  layout,
  snap,
  uiPhase,
}: {
  layout: number[] | null;
  snap: Snapshot | null;
  uiPhase: Phase;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ angle: -Math.PI / 2 });
  const idleTweenRef = useRef<gsap.core.Tween | null>(null);
  const spinTweenRef = useRef<gsap.core.Tween | null>(null);

  // Timer logic for center overlay
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!snap) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [snap]);

  const remaining =
    uiPhase === 'waiting' && snap?.waitingEndsAt
      ? Math.max(0, Math.ceil((snap.waitingEndsAt - now) / 1000))
      : null;

  // Render logic
  const draw = useCallback((rotation: number) => {
    if (!layout || !snap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;
    const segments = layout.length;
    const span = (2 * Math.PI) / segments;

    // ---- Drop shadow under the wheel -------------------------------
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
      cx, cy + radius * 0.95, 0,
      cx, cy + radius * 0.95, radius * 0.85
    );
    shadow.addColorStop(0, 'rgba(0,0,0,0.5)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fill();

    // ---- Outer glow ring -------------------------------------------
    const glow = ctx.createRadialGradient(
      cx, cy, radius * 0.9,
      cx, cy, radius * 1.18
    );
    glow.addColorStop(0, 'rgba(255, 200, 110, 0)');
    glow.addColorStop(0.5, 'rgba(255, 172, 46, 0.10)');
    glow.addColorStop(1, 'rgba(255, 172, 46, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // ---- Outer rim -------------------------------------------------
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.06, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 172, 46, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- Segments + labels ----------------------------------------
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    for (let i = 0; i < segments; i++) {
      const a0 = i * span;
      const a1 = (i + 1) * span;
      const m = layout[i];
      const c = SEG_COLOR[m];

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = c.base;
      ctx.fill();
      
      // Light sector highlighting (subtle gradient per sector)
      const grad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Sector divider lines
    for (let i = 0; i < segments; i++) {
      const a = i * span;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = '#fff';
    ctx.font =
      '700 14px ui-sans-serif, system-ui, "Segoe UI", Roobert, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < segments; i++) {
      const a0 = i * span;
      const a1 = (i + 1) * span;
      const m = layout[i];
      const aMid = (a0 + a1) / 2;
      const lx = Math.cos(aMid) * radius * 0.72;
      const ly = Math.sin(aMid) * radius * 0.72;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(aMid + Math.PI / 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText(`×${m}`, 0, 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(`×${m}`, 0, 0);
      ctx.restore();
    }

    // Inner dark center (for timer)
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#0f1115'; // Matte dark
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
    
    // Gloss on inner center
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    const gloss = ctx.createLinearGradient(-radius * 0.28, -radius * 0.28, radius * 0.28, radius * 0.28);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fill();

    ctx.restore();

    // ---- Static tick studs (no animation) -------------------------
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
      const sx = cx + Math.cos(a) * radius * 1.085;
      const sy = cy + Math.sin(a) * radius * 1.085;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 220, 150, 0.5)';
      ctx.fill();
    }

    // ---- Top pointer -----------------------------------------------
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
  }, [layout, snap]);

  useEffect(() => {
    if (!layout || !snap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    let size = { w: 0, h: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === size.w && h === size.h) return;
      size = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(rotRef.current.angle);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const renderLoop = () => draw(rotRef.current.angle);
    gsap.ticker.add(renderLoop);

    return () => {
      ro.disconnect();
      gsap.ticker.remove(renderLoop);
    };
  }, [layout, snap, draw]);

  useEffect(() => {
    if (!layout || !snap) return;

    if (snap.phase === 'waiting') {
      if (spinTweenRef.current) spinTweenRef.current.kill();
      if (!idleTweenRef.current || !idleTweenRef.current.isActive()) {
        idleTweenRef.current = gsap.to(rotRef.current, {
          angle: rotRef.current.angle + Math.PI * 2,
          duration: 30, // Slow idle rotation
          repeat: -1,
          ease: "none",
        });
      }
    } else if ((snap.phase === 'spinning' || snap.phase === 'completed') && snap.segmentIndex != null) {
      if (idleTweenRef.current) idleTweenRef.current.kill();
      if (spinTweenRef.current && spinTweenRef.current.isActive() && snap.phase === 'spinning') return;

      const seg = snap.segmentIndex;
      const segmentSpan = (2 * Math.PI) / layout.length;
      // Exact center of the winning sector at the top (-Math.PI/2)
      const targetAngle = -seg * segmentSpan - segmentSpan / 2 - Math.PI / 2;

      rotRef.current.angle = rotRef.current.angle % (Math.PI * 2);
      let diff = targetAngle - rotRef.current.angle;
      while (diff > 0) diff -= Math.PI * 2;
      
      // Only do the full spin animation if we are actually spinning
      if (snap.phase === 'spinning') {
        diff -= Math.PI * 2 * 6; // 6 extra spins for drama
        
        spinTweenRef.current = gsap.to(rotRef.current, {
          angle: rotRef.current.angle + diff,
          duration: (snap.spinDurationMs || 5000) / 1000,
          ease: "power3.out",
        });
      } else {
        // Just snap if it's completed (e.g. initial load)
        rotRef.current.angle = targetAngle;
      }
    }
  }, [snap, layout]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
      />
      <div className="absolute z-10 flex flex-col items-center justify-center pointer-events-none">
        {uiPhase === 'waiting' && remaining !== null && (
          remaining > 0 ? (
            <span className="font-roobert text-frost-white text-[20px] sm:text-[24px] font-medium tabular-nums drop-shadow-md">
              00:{String(remaining).padStart(2, '0')}
            </span>
          ) : (
            <span className="font-roobert text-[#5fb37d] text-[20px] sm:text-[24px] font-bold tracking-widest drop-shadow-[0_0_8px_rgba(95,179,125,0.6)]">
              GO!
            </span>
          )
        )}
        {uiPhase === 'spinning' && (
          <span className="font-roobert text-frost-white text-[16px] sm:text-[18px] font-bold tracking-widest animate-pulse drop-shadow-md">
            SPINNING
          </span>
        )}
      </div>
    </div>
  );
}
