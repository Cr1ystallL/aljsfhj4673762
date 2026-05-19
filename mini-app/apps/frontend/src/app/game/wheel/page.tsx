'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Disc3, Coins, Users, Shield, Wifi } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * Wheel of Fortune — live multiplayer.
 *
 * Layout: 25 segments around a circle, multipliers 1 / 2 / 3 / 5 / 30.
 * Players bet on a SINGLE multiplier. Round flow:
 *
 *   waiting (~9 s) → spinning (5 s, deterministic landing) → completed
 *   (3 s viewing) → next waiting.
 *
 * The page polls /wheel/state every 1.5 s while idle and every 250 ms
 * during the spin so the visual rotation lands precisely on the
 * server-confirmed segment.
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

const SEGMENT_COLOURS: Record<number, { fill: string; rim: string }> = {
  1: {
    fill: 'rgba(120, 120, 120, 0.55)',
    rim: 'rgba(180, 180, 180, 0.9)',
  },
  2: {
    fill: 'rgba(160, 224, 171, 0.65)',
    rim: 'rgba(160, 224, 171, 1)',
  },
  3: {
    fill: 'rgba(255, 200, 110, 0.65)',
    rim: 'rgba(255, 200, 110, 1)',
  },
  5: {
    fill: 'rgba(255, 130, 56, 0.75)',
    rim: 'rgba(255, 150, 80, 1)',
  },
  30: {
    fill: 'rgba(220, 60, 50, 0.85)',
    rim: 'rgba(255, 100, 90, 1)',
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

  // Phase transition SFX + balance refresh.
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
      toast.warn('Укажите сумму ставки');
      return;
    }
    const have = balance?.amount ?? 0;
    if (amount > have) {
      toast.warn(
        `Недостаточно средств. На балансе ${have.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} zł`
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
        reportApiError(res, j, 'Не удалось поставить');
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
        <GameTopBar title="Колесо" Icon={Disc3} />

        {snap && (
          <HistoryStrip history={snap.history.slice(0, 12)} />
        )}

        {/* Wheel stage */}
        <div className="relative rounded-card border border-white/10 bg-midnight-canvas overflow-hidden">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(120% 100% at 50% 100%, rgba(165, 45, 37, 0.28) 0%, rgba(255, 172, 46, 0.16) 35%, rgba(160, 224, 171, 0.10) 65%, transparent 85%)',
            }}
          />
          <div className="relative aspect-[4/3] flex items-center justify-center">
            <Wheel
              layout={layout}
              snap={snap}
            />
          </div>
        </div>

        {/* Phase pill */}
        <PhasePill snap={snap} />

        {/* Pick chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {PICKS.map((p) => {
            const tier = SEGMENT_COLOURS[p];
            const active = pick === p;
            return (
              <button
                key={p}
                onClick={() => setPick(p)}
                className={cn(
                  'shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-pill border font-roobert font-semibold tabular-nums text-[13px] transition-colors',
                  active
                    ? 'text-frost-white'
                    : 'text-frost-white/85 border-white/10 bg-white/[0.03]'
                )}
                style={
                  active
                    ? {
                        borderColor: tier.rim,
                        background: tier.fill,
                      }
                    : undefined
                }
              >
                x{p}
              </button>
            );
          })}
        </div>

        {/* Bet panel */}
        <div className="rounded-card border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="grid grid-cols-2 items-center">
            <div className="px-4 py-3 border-r border-white/10">
              <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                Ставка
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
              disabled={busy || snap?.phase !== 'waiting'}
              className={cn(
                'w-full h-11 rounded-pill font-roobert text-[12px] uppercase tracking-[0.2em] transition-colors active:scale-[0.99]',
                snap?.phase === 'waiting' && !busy
                  ? 'bg-frost-white text-midnight-canvas'
                  : 'bg-white/[0.06] text-frost-white/65 border border-white/15 cursor-not-allowed'
              )}
            >
              {snap?.phase === 'waiting'
                ? `Поставить на x${pick}`
                : snap?.phase === 'spinning'
                  ? 'Колесо крутится…'
                  : 'Раунд завершён'}
            </button>
          </div>
        </div>

        {/* Live bets feed */}
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
              Приём ставок
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
              Вращение
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
              background: SEGMENT_COLOURS[snap.multiplier].fill,
              borderColor: SEGMENT_COLOURS[snap.multiplier].rim,
            }}
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-frost-white font-roobert">
              Выпало
            </span>
            <span className="font-roobert font-semibold text-frost-white text-[14px] tabular-nums">
              x{snap.multiplier}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-white/[0.05] border border-white/10">
        <Shield size={11} className="text-frost-white/60" strokeWidth={2} />
        <span className="text-[10px] font-roobert text-frost-white/70 tracking-wider">
          {snap.serverSeedHash
            ? `${snap.serverSeedHash.slice(0, 10)}…`
            : 'хеш загружается'}
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
  return (
    <div className="rounded-card bg-white/[0.04] border border-white/10 px-3 py-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {history.length === 0 ? (
        <span className="text-whisper-gray text-[11px] font-roobert">
          История появится после первого раунда
        </span>
      ) : (
        history.map((h, i) => {
          const t = SEGMENT_COLOURS[h.multiplier];
          return (
            <span
              key={i}
              className="shrink-0 inline-flex items-center justify-center px-2.5 py-1 rounded-pill border font-roobert text-[11px] font-semibold tabular-nums"
              style={{
                background: t.fill,
                borderColor: t.rim,
                color: '#fff',
              }}
            >
              x{h.multiplier}
            </span>
          );
        })
      )}
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
          Игроки {stats.playerCount}
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
          live
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center font-roobert text-[12px] text-whisper-gray">
            Игроки появятся здесь, как только сделают ставки
          </div>
        )}
        {sorted.map((b) => {
          const tier = SEGMENT_COLOURS[b.pick];
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
                  zł · ставка x{b.pick}
                </div>
              </div>
              <div
                className="text-right font-roobert text-[12px] tabular-nums"
                style={{
                  color:
                    phase === 'completed'
                      ? b.won
                        ? tier.rim
                        : 'rgba(255,138,118,0.8)'
                      : 'rgba(255,255,255,0.7)',
                }}
              >
                {phase === 'completed'
                  ? b.won && b.payout != null
                    ? `+${b.payout.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`
                    : '—'
                  : `x${b.pick}`}
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
  const rafRef = useRef<number | null>(null);

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

    // Compute target rotation when phase / segment changes.
    if (snap.phase === 'spinning' && snap.spinStartedAt) {
      const seg = snap.segmentIndex;
      if (seg != null) {
        // We want segment `seg` to land at the top (-π/2). Each segment
        // covers (2π/25) radians starting from 0 = top. Add ~5 turns.
        const segmentSpan = (2 * Math.PI) / layout.length;
        const targetAngle =
          5 * 2 * Math.PI - seg * segmentSpan - segmentSpan / 2;
        targetRotationRef.current = targetAngle;
      }
    } else if (snap.phase === 'completed' && snap.segmentIndex != null) {
      const segmentSpan = (2 * Math.PI) / layout.length;
      const targetAngle =
        5 * 2 * Math.PI -
        snap.segmentIndex * segmentSpan -
        segmentSpan / 2;
      targetRotationRef.current = targetAngle;
      rotationRef.current = targetAngle; // freeze on result
    }

    const spinStart = snap.spinStartedAt ?? null;
    const spinDuration = snap.spinDurationMs;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (needsResize) resize();
      const w = size.w;
      const h = size.h;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      // Animate rotation toward target with cubic-out easing tied to
      // the server's spin window so client + server lock together.
      if (snap.phase === 'spinning' && spinStart) {
        const t = Math.min(
          1,
          Math.max(0, (Date.now() - spinStart) / spinDuration)
        );
        const ease = 1 - Math.pow(1 - t, 3);
        rotationRef.current = ease * targetRotationRef.current;
      } else if (snap.phase === 'waiting') {
        rotationRef.current += 0.003; // gentle idle drift
      }

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;

      // Outer rim glow
      const rim = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.05);
      rim.addColorStop(0, 'rgba(255, 200, 110, 0)');
      rim.addColorStop(1, 'rgba(255, 172, 46, 0.18)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
      ctx.fill();

      // Wheel body
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotationRef.current - Math.PI / 2);
      const segments = layout.length;
      const span = (2 * Math.PI) / segments;
      for (let i = 0; i < segments; i++) {
        const a0 = i * span;
        const a1 = (i + 1) * span;
        const m = layout[i];
        const c = SEGMENT_COLOURS[m];

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a0, a1);
        ctx.closePath();
        ctx.fillStyle = c.fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        const aMid = (a0 + a1) / 2;
        const lx = Math.cos(aMid) * radius * 0.72;
        const ly = Math.sin(aMid) * radius * 0.72;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(aMid + Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.font = '600 12px Roobert, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`x${m}`, 0, 0);
        ctx.restore();
      }
      // Hub
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
      const hub = ctx.createRadialGradient(-radius * 0.05, -radius * 0.05, 0, 0, 0, radius * 0.18);
      hub.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      hub.addColorStop(1, 'rgba(120, 120, 120, 0.85)');
      ctx.fillStyle = hub;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Pointer (top, fixed)
      const px = cx;
      const py = cy - radius - 6;
      ctx.beginPath();
      ctx.moveTo(px, py + 14);
      ctx.lineTo(px - 9, py - 4);
      ctx.lineTo(px + 9, py - 4);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.2;
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
