'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  1: {
    base: '#3a3a3a',
    rim: 'rgba(180, 180, 180, 0.7)',
    light: '#5a5a5a',
    deep: '#222222',
  },
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

const PICKS: number[] = [1, 2, 3, 5, 30];

export default function WheelPage() {
  const { balance, fetchBalance } = useBalance();
  const [layout, setLayout] = useState<number[] | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pick, setPick] = useState<number>(2);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);

  const lastPhaseRef = useRef<Phase | null>(null);

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

  useEffect(() => {
    void load();
    void fetchBalance();
    soundManager.initialize();
    const id = setInterval(
      () => void load(),
      snap?.phase === 'spinning' ? 250 : 1500
    );
    return () => clearInterval(id);
  }, [load, fetchBalance, snap?.phase]);

  useEffect(() => {
    if (!snap) return;
    if (lastPhaseRef.current && lastPhaseRef.current !== snap.phase) {
      if (snap.phase === 'spinning') soundManager.play('game.bet_placed');
      else if (snap.phase === 'completed') {
        soundManager.play('game.cashout');
        void fetchBalance();
      }
    }
    lastPhaseRef.current = snap.phase;
  }, [snap, fetchBalance]);

  const placeBet = async () => {
    if (busy) return;
    if (amount <= 0) {
      toast.warn('Enter a bet amount');
      return;
    }
    const have = balance?.amount ?? 0;
    if (amount > have) {
      toast.warn(
        `Insufficient balance — you have ${have.toLocaleString('en-US', { maximumFractionDigits: 2 })} zł`
      );
      return;
    }
    if (snap?.phase !== 'waiting') {
      toast.warn('Betting closed');
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
            <Wheel layout={layout} snap={snap} />
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
                Potential win
              </div>
              <div className="mt-1.5 font-roobert text-[20px] font-light tabular-nums text-frost-white">
                {(amount * pick).toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[12px] text-whisper-gray">zł</span>
              </div>
            </div>
          </div>
          <div className="px-3 pb-3 pt-1 border-t border-white/10">
            <button
              onClick={placeBet}
              disabled={busy || snap?.phase !== 'waiting'}
              className={cn(
                'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-all active:scale-[0.99]',
                snap?.phase === 'waiting' && !busy
                  ? 'bg-frost-white text-midnight-canvas hover:bg-frost-white/95 shadow-[0_4px_18px_rgba(255,255,255,0.18)]'
                  : 'bg-white/[0.06] text-frost-white/65 border border-white/15 cursor-not-allowed'
              )}
            >
              {snap?.phase === 'waiting'
                ? `Bet on ×${pick}`
                : snap?.phase === 'spinning'
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!snap) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [snap]);

  if (!snap) return null;
  const remaining =
    snap.phase === 'waiting' && snap.waitingEndsAt
      ? Math.max(0, Math.ceil((snap.waitingEndsAt - now) / 1000))
      : null;

  return (
    <div className="flex items-center justify-between gap-2">
      <AnimatePresence mode="wait">
        {snap.phase === 'waiting' && (
          <motion.div
            key="w"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-white/[0.04] border border-white/10"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
              Place your bets
            </span>
            {remaining !== null && (
              <span className="font-roobert text-frost-white text-[13px] tabular-nums leading-none">
                00:{String(remaining).padStart(2, '0')}
              </span>
            )}
          </motion.div>
        )}
        {snap.phase === 'spinning' && (
          <motion.div
            key="s"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-white/[0.06] border border-white/15"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-frost-white font-roobert">
              Spinning
            </span>
          </motion.div>
        )}
        {snap.phase === 'completed' && snap.multiplier !== null && (
          <motion.div
            key="c"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill border"
            style={{
              background: `${SEG_COLOR[snap.multiplier].base}55`,
              borderColor: SEG_COLOR[snap.multiplier].rim,
            }}
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-frost-white font-roobert">
              Result
            </span>
            <span className="font-roobert font-semibold text-frost-white text-[14px] tabular-nums">
              ×{snap.multiplier}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

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
          {stats.playerCount} players
        </div>
        <div className="inline-flex items-center gap-1.5 text-whisper-gray font-roobert text-[10px] uppercase tracking-[0.2em] justify-center">
          <Coins size={10} strokeWidth={2} />
          {stats.totalWagered.toLocaleString('en-US', {
            maximumFractionDigits: 0,
          })}{' '}
          zł
        </div>
        <div className="inline-flex items-center gap-1.5 text-whisper-gray font-roobert text-[10px] uppercase tracking-[0.2em] justify-end">
          <Wifi size={10} strokeWidth={2} />
          live
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Players will appear here as soon as they place a bet
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
                  {b.amount.toLocaleString('en-US', {
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
                    ? `+${b.payout.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
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
}: {
  layout: number[] | null;
  snap: Snapshot | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  const settleStartRotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  // Locked spin contract for the current spin — we capture the spin
  // start, duration and target so a re-render with new snapshot data
  // doesn't yank the wheel mid-rotation.
  const spinLockRef = useRef<{
    startedAt: number;
    durationMs: number;
    target: number;
    /** Slight offset from the segment center — gives the pointer the
     *  "casino" landing where it doesn't sit dead-on the divider. */
    overshoot: number;
    seg: number;
  } | null>(null);

  useEffect(() => {
    if (!layout || !snap) return;
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

    if (snap.phase === 'spinning' && snap.spinStartedAt && snap.segmentIndex != null) {
      const seg = snap.segmentIndex;
      const segmentSpan = (2 * Math.PI) / layout.length;
      // Build the spin lock once per spin. If the lock is already set
      // for this spinStartedAt, keep it (re-renders shouldn't recompute
      // overshoot — that would change where the pointer lands).
      const same =
        spinLockRef.current &&
        spinLockRef.current.startedAt === snap.spinStartedAt &&
        spinLockRef.current.seg === seg;
      if (!same) {
        // Random landing offset within the wedge — clamped to ±35% of
        // the wedge span so the pointer never crosses into a neighbour.
        const u = (Math.sin(snap.spinStartedAt) * 9301 + 49297) % 233280;
        const r = (u / 233280) * 2 - 1; // -1..1
        const overshoot = r * segmentSpan * 0.35;
        // Number of full revolutions scales with the spin duration so
        // an 8s spin and a 15s spin both feel like the wheel is moving
        // throughout — roughly one revolution per 1.4s.
        const revs = Math.max(5, Math.round(snap.spinDurationMs / 1400));
        // Total target rotation: full revs + center on seg + overshoot.
        const target =
          revs * 2 * Math.PI - seg * segmentSpan - segmentSpan / 2 + overshoot;
        settleStartRotationRef.current = rotationRef.current;
        spinLockRef.current = {
          startedAt: snap.spinStartedAt,
          durationMs: snap.spinDurationMs,
          target,
          overshoot,
          seg,
        };
        targetRotationRef.current = target;
      }
    } else if (
      snap.phase === 'completed' &&
      snap.segmentIndex != null &&
      spinLockRef.current
    ) {
      // Park exactly where the lock said we'd land.
      rotationRef.current = spinLockRef.current.target;
      targetRotationRef.current = spinLockRef.current.target;
    } else if (snap.phase === 'waiting') {
      spinLockRef.current = null;
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (needsResize) resize();
      const w = size.w;
      const h = size.h;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      if (snap.phase === 'spinning' && spinLockRef.current) {
        const lock = spinLockRef.current;
        const t = Math.min(
          1,
          Math.max(0, (Date.now() - lock.startedAt) / lock.durationMs)
        );
        // Three-phase casino easing — keeps the wheel visibly moving
        // for most of the spin instead of asymptoting in the first
        // few seconds (which is what cubic ease-out does):
        //
        //   phase 1  t ∈ [0, 0.70)  → linear cruise, covers 78% of total
        //                              rotation at constant angular speed
        //   phase 2  t ∈ [0.70, 0.92) → cubic ease-out brake, covers next
        //                                17% as the wheel decelerates
        //   phase 3  t ∈ [0.92, 1.0)  → elastic settle around the target
        //                                with the per-spin overshoot, so
        //                                the pointer slips past the wedge
        //                                edge and tugs back instead of
        //                                snapping to a divider.
        //
        // The piecewise function is C0-continuous (no value jumps) and
        // the velocity discontinuities are small enough to read as a
        // natural deceleration on the wheel.
        const segmentSpan = (2 * Math.PI) / layout.length;
        const settleStart = settleStartRotationRef.current;
        const totalArc = lock.target - settleStart;
        const overshootArc = segmentSpan * 0.18;
        let value: number;
        if (t < 0.7) {
          // Linear cruise, covers 78% of the arc.
          const portion = (t / 0.7) * 0.78;
          value = settleStart + totalArc * portion;
        } else if (t < 0.92) {
          // Cubic ease-out, finishing the remaining 22% in 22% of time.
          const tt = (t - 0.7) / 0.22;
          const ease = 1 - Math.pow(1 - tt, 3);
          // Cover 0.78 → 1.0 + overshootArc/totalArc.
          const startPortion = 0.78;
          const overshootPortion = overshootArc / Math.max(1e-6, totalArc);
          const endPortion = 1 + overshootPortion;
          const portion = startPortion + (endPortion - startPortion) * ease;
          value = settleStart + totalArc * portion;
        } else {
          // Elastic settle: damped sine pulling back from overshoot.
          const tt = (t - 0.92) / 0.08;
          const damp = (1 - tt) * (1 - tt);
          const wave = Math.sin(tt * Math.PI * 1.5) * damp;
          value = lock.target + overshootArc * (1 - tt) - wave * overshootArc * 0.4;
        }
        rotationRef.current = value;
      } else if (snap.phase === 'waiting') {
        rotationRef.current += 0.0025;
      } else if (snap.phase === 'completed' && spinLockRef.current) {
        rotationRef.current = spinLockRef.current.target;
      }

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;
      const segments = layout.length;
      const span = (2 * Math.PI) / segments;
      const time = performance.now() / 1000;

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

      // ---- Outer glow ring -------------------------------------------
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

      // ---- Outer rim (decorative ring just outside the segments) -----
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
      ctx.rotate(rotationRef.current - Math.PI / 2);

      for (let i = 0; i < segments; i++) {
        const a0 = i * span;
        const a1 = (i + 1) * span;
        const m = layout[i];
        const c = SEG_COLOR[m];

        // Segment body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a0, a1);
        ctx.closePath();
        ctx.fillStyle = c.base;
        ctx.fill();
      }

      // Sector divider lines (drawn over the body for crispness)
      for (let i = 0; i < segments; i++) {
        const a = i * span;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Labels — large, bold, white, positioned at 70% of radius.
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
        // Tiny shadow for legibility on lighter sectors.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillText(`×${m}`, 0, 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(`×${m}`, 0, 0);
        ctx.restore();
      }

      // Inner ring (separates segments from hub)
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 172, 46, 0.45)';
      ctx.stroke();

      // Brass dot in the center
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
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Highlight wedge on the hub
      ctx.beginPath();
      ctx.arc(-radius * 0.05, -radius * 0.05, radius * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fill();

      ctx.restore();

      // ---- Tick studs around the rim (24 evenly-spaced bright dots)
      // These don't rotate with the wheel — they live on the bezel.
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * radius * 1.085;
        const sy = cy + Math.sin(a) * radius * 1.085;
        // Pulse the studs nearest the pointer for a "live" feel.
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.4);
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 150, ${0.35 + pulse * 0.45})`;
        ctx.fill();
      }

      // ---- Top pointer ------------------------------------------------
      const px = cx;
      const py = cy - radius * 1.04;
      // Soft shadow
      ctx.beginPath();
      ctx.arc(px, py + 6, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      // Pointer body — downward triangle with a small "anvil" base
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
  }, [layout, snap]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: 'auto' }}
    />
  );
}
