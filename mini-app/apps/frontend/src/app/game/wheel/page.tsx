'use client';

import { useRouter } from 'next/navigation';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { Disc3, ChevronDown, Trophy } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';
import { Pressable } from '@/components/ui/pressable';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';
import { UserAvatar } from '@/components/ui/user-avatar';

/* ========================================================================== */
/*  Monopo Saigon — Wheel of Fortune                                          */
/*  Cinematic darkroom aesthetic · achromatic palette · editorial typography   */
/* ========================================================================== */

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
    isTournament?: boolean;
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

/* -------------------------------------------------------------------------- */
/*  Achromatic segment palette                                                 */
/*  Rarer multipliers = lighter tones. 30x is near-white — it POPS.           */
/* -------------------------------------------------------------------------- */

const SEG_COLOR: Record<
  number,
  { base: string; face: string; label: string; pill: string; pillBg: string }
> = {
  1: {
    base: '#1c1c1c',
    face: '#252525',
    label: '#6d6d6d',
    pill: '#6d6d6d',
    pillBg: 'rgba(109,109,109,0.12)',
  },
  2: {
    base: '#2563eb', // Blue
    face: '#3b82f6',
    label: '#ffffff',
    pill: '#60a5fa',
    pillBg: 'rgba(96,165,250,0.15)',
  },
  3: {
    base: '#16a34a', // Green
    face: '#22c55e',
    label: '#ffffff',
    pill: '#4ade80',
    pillBg: 'rgba(74,222,128,0.15)',
  },
  5: {
    base: '#9333ea', // Purple
    face: '#a855f7',
    label: '#ffffff',
    pill: '#c084fc',
    pillBg: 'rgba(192,132,252,0.15)',
  },
  30: {
    base: '#dc2626', // Red
    face: '#ef4444',
    label: '#ffffff',
    pill: '#f87171',
    pillBg: 'rgba(248,113,113,0.15)',
  },
};

/** Bettable multipliers — x1 deliberately removed */
const PICKS: number[] = [2, 3, 5, 30];

const POINTER_ANGLE = -Math.PI / 2;

function normalizeAngle(a: number) {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

/** Sector currently under the fixed top pointer. */
function pointerSegmentIndex(rotation: number, segments: number) {
  if (segments <= 0) return 0;
  const span = (Math.PI * 2) / segments;
  const local = normalizeAngle(POINTER_ANGLE - rotation);
  return Math.floor(local / span) % segments;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* ========================================================================== */
/*  Page                                                                       */
/* ========================================================================== */

export default function WheelPage() {
  const router = useRouter();
  const { t, localeTag } = useT();
  const { fetchBalance } = useBalance();
  const [layout, setLayout] = useState<number[] | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [clockSkew, setClockSkew] = useState(0);
  const [pick, setPick] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('10');
  const amount = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (isNaN(parsed)) return 0;
    return parsed;
  }, [amountInput]);

  const lastPhaseRef = useRef<Phase | null>(null);
  const lastUiPhaseRef = useRef<Phase | null>(null);
  const spinRuntimeRef = useRef<{
    startedAt: number;
    durationMs: number;
    seg: number | null;
  } | null>(null);
  const [phaseTick, setPhaseTick] = useState(0);

  useEffect(() => {
    soundManager.register('cases.tick', { src: '/audio/tick.mp3', category: 'sfx' });
  }, []);

  /* ----- Data fetching --------------------------------------------------- */

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/games/wheel/state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = await res.json();
      if (j.serverTime) {
        setClockSkew(Date.now() - j.serverTime);
      }
      setSnap(j.state as Snapshot);
      setLayout(j.layout as number[]);
    } catch {
      /* best-effort */
    }
  }, []);

  const pollMs = useMemo(() => {
    if (snap?.phase === 'spinning') return 250;
    if (snap?.phase === 'waiting' && snap.waitingEndsAt) {
      const remainingMs = snap.waitingEndsAt - (Date.now() - clockSkew);
      if (remainingMs < 3200) return 200;
    }
    return 1200;
  }, [snap?.phase, snap?.waitingEndsAt, clockSkew]);

  useEffect(() => {
    void load();
    void fetchBalance();
    soundManager.initialize();
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, fetchBalance, pollMs]);

  useEffect(() => {
    if (!snap || snap.phase !== 'waiting' || !snap.waitingEndsAt) return;
    const ms = snap.waitingEndsAt - (Date.now() - clockSkew);
    if (ms <= 0) return;
    const id = setTimeout(() => void load(), ms);
    return () => clearTimeout(id);
  }, [snap?.phase, snap?.waitingEndsAt, load, clockSkew]);

  /* ----- Spin runtime tracking ------------------------------------------- */

  useEffect(() => {
    if (!snap) return;
    if (snap.phase === 'waiting') {
      spinRuntimeRef.current = null;
      return;
    }
    if (
      (snap.phase === 'spinning' || snap.phase === 'completed') &&
      snap.segmentIndex != null
    ) {
      const durationMs = snap.spinDurationMs || 12000;
      const current = spinRuntimeRef.current;
      
      let startedAt = snap.spinStartedAt;
      if (startedAt == null) {
        if (current && current.seg === snap.segmentIndex) {
          startedAt = current.startedAt;
        } else {
          startedAt = Date.now() - clockSkew;
        }
      } else {
        startedAt = Math.min(startedAt, Date.now() - clockSkew);
      }

      if (
        !current ||
        current.seg !== snap.segmentIndex ||
        current.durationMs !== durationMs ||
        current.startedAt !== startedAt
      ) {
        spinRuntimeRef.current = { startedAt, durationMs, seg: snap.segmentIndex };
      }
    }
  }, [snap]);

  useEffect(() => {
    const id = setInterval(() => setPhaseTick(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  const uiPhase: Phase = useMemo(() => {
    if (!snap) return 'waiting';
    const spin = spinRuntimeRef.current;
    if (
      (snap.phase === 'spinning' || snap.phase === 'completed') &&
      spin
    ) {
      const endAt = spin.startedAt + spin.durationMs;
      if (Date.now() - clockSkew < endAt - 30) return 'spinning';
    }
    return snap.phase;
  }, [snap, phaseTick, clockSkew]);

  /* ----- Sound cues ------------------------------------------------------ */

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

  /* ----- Bet placement --------------------------------------------------- */

  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    isTournament,
    currencyLabel,
  } = useActiveBalance('wheel');

  const placeBet = async () => {
    if (busy) return;
    if (amount <= 0) {
      toast.warn('Введите сумму ставки');
      return;
    }
    if (!isBalanceReady) {
      toast.warn(t('common.loadingBalance'));
      return;
    }
    const have = activeBalance;
    if (amount > have) {
      toast.warn(
        t('common.insufficientWithBalance', {
          amount: have.toLocaleString(localeTag, { maximumFractionDigits: 2 }),
          currency: currencyLabel,
        })
      );
      return;
    }
    if (snap?.phase !== 'waiting') {
      toast.warn(t('wheel.bettingClosed'));
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
    () => Math.max(minBet, Math.floor(activeBalance)),
    [activeBalance]
  );

  /* ----- Render ---------------------------------------------------------- */

  return (
    <main className="min-h-screen w-full bg-[#000000] text-[#ffffff]">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-5">
        <GameTopBar
          title="Wheel"
          Icon={Disc3}
          onHowToPlay={() => router.push('/info#faq')}
        />

        {/* History */}
        {snap && <HistoryStrip history={snap.history.slice(0, 12)} />}

        {/* ---- Wheel Stage (Dark Immersive Frame) ---- */}
        <div className="relative overflow-hidden" style={{ borderRadius: 0 }}>
          {/* Atmospheric radial wash — achromatic only */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(70% 60% at 50% 45%, rgba(255,255,255,0.03) 0%, transparent 70%)',
            }}
          />
          <div className="relative aspect-square flex items-center justify-center">
            <WheelCanvas layout={layout} snap={snap} uiPhase={uiPhase} clockSkew={clockSkew} />
          </div>
        </div>

        {/* Phase + Hash */}
        <PhaseBar snap={snap} uiPhase={uiPhase} />

        {/* ---- Multiplier Picks (Pill Buttons) ---- */}
        <div className="flex items-center justify-center gap-2">
          {PICKS.map((p) => {
            const active = pick === p;
            return (
              <Pressable
                key={p}
                onClick={() => setPick(p)}
                className={cn(
                  'inline-flex items-center justify-center h-10 px-5',
                  'font-sans text-[13px] tracking-[0.08em] uppercase tabular-nums'
                )}
                style={{
                  borderRadius: 75,
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#000000' : '#9a9a9a',
                  border: active ? '1px solid #ffffff' : '1px solid #3a3a3a',
                  fontWeight: active ? 600 : 300,
                }}
              >
                ×{p}
              </Pressable>
            );
          })}
        </div>

        {/* ---- Bet Panel ---- */}
        <BetPanelShell>
          <div className="grid grid-cols-2 items-stretch">
            <div className="px-4 py-3 border-r border-white/10">
              <StakeField
                amount={amount || minBet}
                onAmountChange={(next) => setAmountInput(String(next))}
                minBet={minBet}
                maxBet={maxBet}
                disabled={busy || uiPhase !== 'waiting'}
                label={t('common.bet')}
                decreaseLabel={t('common.decreaseBet')}
                increaseLabel={t('common.increaseBet')}
              />
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                {t('common.payout')}
              </span>
              <div className="mt-2 font-roobert text-[22px] font-light tabular-nums text-frost-white">
                {(amount * pick).toLocaleString(localeTag, {
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
          <BetPanelCtaRow>
            <GamePrimaryButton
              onClick={placeBet}
              disabled={busy || uiPhase !== 'waiting'}
              tone={uiPhase === 'waiting' && !busy ? 'solid' : 'muted'}
            >
              {uiPhase === 'waiting'
                ? t('wheel.placeWithMult', { x: pick })
                : uiPhase === 'spinning'
                  ? t('common.spinning')
                  : t('common.roundOver')}
            </GamePrimaryButton>
          </BetPanelCtaRow>
        </BetPanelShell>

        {/* Quick bet presets */}
        <div className="flex items-center justify-center gap-2">
          {[10, 50, 100, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmountInput(Math.min(v, maxBet).toString())}
              className={cn(
                'font-roobert tabular-nums text-[11px] px-3 py-1.5 rounded-pill border transition-colors',
                amount === v
                  ? 'border-white/30 text-frost-white'
                  : 'border-transparent text-whisper-gray'
              )}
            >
              {v}
            </button>
          ))}
          <button
            onClick={() => setAmountInput(maxBet.toString())}
            className="font-roobert text-[11px] px-3 py-1.5 rounded-pill text-whisper-gray uppercase tracking-[0.16em]"
          >
            {t('common.max')}
          </button>
        </div>

        {/* ---- Bets Feed ---- */}
        {snap && (
          <BetsFeed bets={snap.bets} stats={snap.stats} phase={snap.phase} />
        )}
      </div>
    </main>
  );
}

/* ========================================================================== */
/*  Phase Bar                                                                  */
/* ========================================================================== */

function PhaseBar({
  snap,
  uiPhase,
}: {
  snap: Snapshot | null;
  uiPhase: Phase;
}) {
  const { t } = useT();
  if (!snap) return null;

  const phaseLabel =
    uiPhase === 'waiting'
      ? t('wheel.bettingOpen')
      : uiPhase === 'spinning'
        ? t('common.spinning')
        : t('coinflip.result');

  return (
    <div className="flex items-center justify-between">
      <span
        className="font-sans uppercase tracking-[0.2em] text-[#6d6d6d]"
        style={{ fontSize: 10 }}
      >
        {phaseLabel}
      </span>
      <span
        className="font-sans text-[#636363] tracking-wider"
        style={{ fontSize: 10 }}
      >
        {snap.serverSeedHash
          ? `${snap.serverSeedHash.slice(0, 12)}…`
          : '—'}
      </span>
    </div>
  );
}

/* ========================================================================== */
/*  History Strip                                                              */
/* ========================================================================== */

function HistoryStrip({
  history,
}: {
  history: Array<{ multiplier: number; roundId: string }>;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? history.slice(0, 20) : history.slice(0, 12);

  return (
    <div style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: 12 }}>
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
            <span
              className="font-sans text-[#636363]"
              style={{ fontSize: 11 }}
            >
              {t('wheel.historyEmpty')}
            </span>
          ) : (
            visible.map((h, i) => {
              const c = SEG_COLOR[h.multiplier] ?? SEG_COLOR[2];
              return (
                <div
                  key={i}
                  className="shrink-0 inline-flex items-center justify-center font-sans tabular-nums select-none"
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    padding: '4px 10px',
                    borderRadius: 75,
                    background: c.pillBg,
                    color: c.pill,
                    border: `1px solid ${c.pill}22`,
                  }}
                >
                  ×{h.multiplier}
                </div>
              );
            })
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 w-7 h-7 flex items-center justify-center transition-colors"
          style={{
            borderRadius: 75,
            border: '1px solid #2a2a2a',
            color: '#636363',
          }}
          aria-label="Toggle history"
        >
          <ChevronDown
            size={13}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Bets Feed                                                                  */
/* ========================================================================== */

function BetsFeed({
  bets,
  stats,
  phase,
}: {
  bets: Snapshot['bets'];
  stats: Snapshot['stats'];
  phase: Phase;
}) {
  const { t, localeTag } = useT();
  const sorted = [...bets].sort((a, b) => b.amount - a.amount);

  return (
    <div style={{ borderTop: '1px solid #1a1a1a' }}>
      {/* Stats header */}
      <div
        className="flex items-center justify-between py-3"
        style={{ borderBottom: '1px solid #0f0f0f' }}
      >
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {t('wheel.playersCount', { n: stats.playerCount })}
        </span>
        <span
          className="font-sans uppercase tracking-[0.2em] text-[#636363]"
          style={{ fontSize: 10 }}
        >
          {stats.totalWagered.toLocaleString(localeTag, {
            maximumFractionDigits: 0,
          })}{' '}
          zł
        </span>
      </div>

      {/* List */}
      <div className="max-h-[280px] overflow-y-auto scrollbar-hide">
        {sorted.length === 0 && (
          <div
            className="py-10 text-center font-sans text-[#636363]"
            style={{ fontSize: 12 }}
          >
            {t('wheel.waitingBets')}
          </div>
        )}
        {sorted.map((b) => {
          const c = SEG_COLOR[b.pick] ?? SEG_COLOR[2];
          return (
            <div
              key={b.userId + ':' + b.pick}
              className={cn(
                "flex items-center gap-3 py-3 px-2 rounded-md transition-colors",
                b.isTournament ? "bg-[#d4af37]/[0.08] border border-[#d4af37]/20" : ""
              )}
              style={!b.isTournament ? { borderBottom: '1px solid #0a0a0a' } : {}}
            >
              {/* Avatar with VIP badge */}
              <UserAvatar
                photoUrl={b.photoUrl}
                name={b.name}
                size="xs"
              />

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div
                  className="font-sans text-[#ffffff] truncate"
                  style={{ fontSize: 13, fontWeight: 400 }}
                >
                  {b.name}
                </div>
                <div
                  className="font-sans text-[#636363] flex items-center gap-1 tabular-nums"
                  style={{ fontSize: 10 }}
                >
                  {b.amount.toLocaleString(localeTag, {
                    maximumFractionDigits: 2,
                  })}{' '}
                  {b.isTournament ? <Trophy size={10} className="text-[#d4af37]" /> : 'zł'} · ×{b.pick}
                </div>
              </div>

              {/* Result */}
              <div
                className="text-right font-sans tabular-nums"
                style={{
                  fontSize: 12,
                  fontWeight: phase === 'completed' && b.won ? 600 : 300,
                  color:
                    phase === 'completed'
                      ? b.won
                        ? '#ffffff'
                        : '#3a3a3a'
                      : '#6d6d6d',
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

/* ========================================================================== */
/*  Wheel Canvas                                                               */
/* ========================================================================== */

function WheelCanvas({
  layout,
  snap,
  uiPhase,
  clockSkew,
}: {
  layout: number[] | null;
  snap: Snapshot | null;
  uiPhase: Phase;
  clockSkew: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ angle: -Math.PI / 2 });
  const idleTweenRef = useRef<gsap.core.Tween | null>(null);
  const spinTweenRef = useRef<gsap.core.Tween | null>(null);
  const lastSectorRef = useRef<number | null>(null);

  /* Timer for center overlay */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const remaining =
    uiPhase === 'waiting' && snap?.waitingEndsAt
      ? Math.max(0, Math.ceil((snap.waitingEndsAt - (now - clockSkew)) / 1000))
      : null;

  const { t } = useT();

  /* ---- Draw function ---------------------------------------------------- */

  const draw = useCallback(
    (rotation: number) => {
      if (!layout || !snap) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.43;
      const segments = layout.length;
      const span = (2 * Math.PI) / segments;
      const reduced = prefersReducedMotion();
      const waitingPulse =
        uiPhase === 'waiting' && !reduced
          ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(performance.now() / 520))
          : uiPhase === 'waiting'
            ? 0.55
            : 1;
      const hotIndex =
        uiPhase === 'completed' && snap.segmentIndex != null
          ? snap.segmentIndex
          : pointerSegmentIndex(rotation, segments);

      /* ---- Subtle floor shadow ---------------------------------------- */
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 0.95, radius * 0.75, radius * 0.1, 0, 0, Math.PI * 2);
      const shadowGrad = ctx.createRadialGradient(cx, cy + radius * 0.95, 0, cx, cy + radius * 0.95, radius * 0.75);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      /* ---- Outer rim glow ----------------------------- */
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      const rimGrad = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.06);
      rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
      rimGrad.addColorStop(0.5, `rgba(255,255,255,${0.03 + 0.05 * waitingPulse})`);
      rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rimGrad;
      ctx.fill();

      /* ---- Segments --------------------------------------------------- */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      // Inner shadow / vignette over the whole wheel
      const vignetteGrad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      vignetteGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
      vignetteGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.4)');

      for (let i = 0; i < segments; i++) {
        const a0 = i * span;
        const a1 = (i + 1) * span;
        const m = layout[i];
        const c = SEG_COLOR[m] ?? SEG_COLOR[2];

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a0, a1);
        ctx.closePath();

        // Base fill
        ctx.fillStyle = c.base;
        ctx.fill();

        // Gradient overlay for a slight 3D cone effect
        const segGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        segGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
        segGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = segGrad;
        ctx.fill();
      }

      /* Light on the sector under the pointer (or the settled winner). */
      if (hotIndex >= 0 && hotIndex < segments) {
        const a0 = hotIndex * span;
        const a1 = a0 + span;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a0, a1);
        ctx.closePath();
        const glow = ctx.createRadialGradient(0, 0, radius * 0.22, 0, 0, radius);
        glow.addColorStop(0, 'rgba(246, 200, 92, 0.05)');
        glow.addColorStop(0.55, 'rgba(246, 200, 92, 0.14)');
        glow.addColorStop(1, 'rgba(244, 232, 200, 0.26)');
        ctx.fillStyle = glow;
        ctx.globalAlpha = uiPhase === 'completed' ? 1 : 0.88;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius - 1.25, a0, a1);
        ctx.strokeStyle = `rgba(244, 232, 200, ${uiPhase === 'completed' ? 0.55 : 0.32})`;
        ctx.lineWidth = 2.25;
        ctx.stroke();
        ctx.restore();
      }

      /* Apply vignette to wheel */
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = vignetteGrad;
      ctx.fill();

      /* Outer ring stroke */
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* Divider hairlines */
      for (let i = 0; i < segments; i++) {
        const a = i * span;
        ctx.beginPath();
        ctx.moveTo(radius * 0.1, 0); // Don't draw all the way to center
        ctx.lineTo(radius, 0);
        ctx.rotate(span);
        
        // Use a gradient for the divider
        const lineGrad = ctx.createLinearGradient(0, 0, radius, 0);
        lineGrad.addColorStop(0, 'rgba(255,255,255,0.02)');
        lineGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)'); // Brighter center for visibility
        lineGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
        
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* Labels */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < segments; i++) {
        const a0 = i * span;
        const a1 = (i + 1) * span;
        const m = layout[i];
        const c = SEG_COLOR[m] ?? SEG_COLOR[2];
        const aMid = (a0 + a1) / 2;
        
        // Push text slightly further out and align properly
        const lx = Math.cos(aMid) * radius * 0.75;
        const ly = Math.sin(aMid) * radius * 0.75;
        
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(aMid + Math.PI / 2);
        
        // Premium typography
        const hot = i === hotIndex;
        ctx.font = `${hot ? 700 : 600} ${hot ? 17 : 16}px "Inter", ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = hot ? '#F4E8C8' : c.label;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(`×${m}`, 0, 0);
        ctx.restore();
      }

      /* ---- Central hub ------------------------------------------------ */
      /* Base outer ring (dark metal) */
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.stroke();

      /* Inner bezel */
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.26, 0, Math.PI * 2);
      const hubGrad = ctx.createLinearGradient(-radius * 0.26, -radius * 0.26, radius * 0.26, radius * 0.26);
      hubGrad.addColorStop(0, '#2a2a2a');
      hubGrad.addColorStop(0.5, '#0a0a0a');
      hubGrad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = hubGrad;
      ctx.fill();
      
      /* Inner hollow area (where text lives) */
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#050505';
      ctx.fill();
      
      // Inner shadow for depth
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.restore();

      /* ---- Tick studs (static, not rotating) -------------------------- */
      const tickCount = segments;
      for (let i = 0; i < tickCount; i++) {
        const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2 + (span / 2);
        const sx = cx + Math.cos(a) * radius * 1.03;
        const sy = cy + Math.sin(a) * radius * 1.03;
        
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();
      }

      /* Soft wash from the pointer onto the hot sector. */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius * 1.02);
      ctx.lineTo(cx + radius * 0.2, cy + radius * 0.08);
      ctx.lineTo(cx - radius * 0.2, cy + radius * 0.08);
      ctx.closePath();
      const wash = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius * 0.05);
      wash.addColorStop(0, 'rgba(244, 232, 200, 0.18)');
      wash.addColorStop(1, 'rgba(244, 232, 200, 0)');
      ctx.fillStyle = wash;
      ctx.globalAlpha = uiPhase === 'waiting' ? 0.4 + 0.35 * waitingPulse : 0.72;
      ctx.fill();
      ctx.restore();

      if (uiPhase === 'waiting') {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(246, 200, 92, ${0.05 + 0.16 * waitingPulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      /* ---- Top pointer (sleek modern diamond) -------------------------------- */
      const px = cx;
      const py = cy - radius * 1.05;

      ctx.beginPath();
      ctx.moveTo(px, py - 12);
      ctx.lineTo(px + 10, py);
      ctx.lineTo(px, py + 18);
      ctx.lineTo(px - 10, py);
      ctx.closePath();

      const pointerGrad = ctx.createLinearGradient(px, py - 12, px, py + 18);
      pointerGrad.addColorStop(0, '#ffffff');
      pointerGrad.addColorStop(1, '#aaaaaa');
      
      ctx.fillStyle = pointerGrad;
      ctx.fill();
      
      ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Reset shadow for subsequent draws
      ctx.shadowBlur = 0;
    },
    [layout, snap, uiPhase]
  );

  /* ---- Canvas setup + render loop -------------------------------------- */

  useEffect(() => {
    if (!layout || !snap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
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

  /* ---- GSAP spin / idle animation ------------------------------------- */

  useEffect(() => {
    if (!layout || !snap) return;

    if (snap.phase === 'waiting') {
      if (spinTweenRef.current) spinTweenRef.current.kill();
      if (prefersReducedMotion()) {
        if (idleTweenRef.current) idleTweenRef.current.kill();
      } else if (!idleTweenRef.current || !idleTweenRef.current.isActive()) {
        idleTweenRef.current = gsap.to(rotRef.current, {
          angle: rotRef.current.angle + Math.PI * 2,
          duration: 40,
          repeat: -1,
          ease: 'none',
        });
      }
    } else if (
      (uiPhase === 'spinning' || uiPhase === 'completed') &&
      snap.segmentIndex != null
    ) {
      if (idleTweenRef.current) idleTweenRef.current.kill();
      if (
        spinTweenRef.current &&
        spinTweenRef.current.isActive() &&
        uiPhase === 'spinning'
      )
        return;

      const seg = snap.segmentIndex;
      const segmentSpan = (2 * Math.PI) / layout.length;
      const targetAngle =
        -seg * segmentSpan - segmentSpan / 2 - Math.PI / 2;

      rotRef.current.angle = rotRef.current.angle % (Math.PI * 2);
      let diff = targetAngle - rotRef.current.angle;
      while (diff > 0) diff -= Math.PI * 2;

      if (uiPhase === 'spinning') {
        diff -= Math.PI * 2 * 6;
        lastSectorRef.current = null;
        spinTweenRef.current = gsap.to(rotRef.current, {
          angle: rotRef.current.angle + diff,
          duration: (snap.spinDurationMs || 5000) / 1000,
          ease: 'power4.out',
          onUpdate: () => {
            if (!layout || layout.length === 0) return;
            const currentSector = pointerSegmentIndex(rotRef.current.angle, layout.length);
            if (lastSectorRef.current === null) {
              lastSectorRef.current = currentSector;
            } else if (currentSector !== lastSectorRef.current) {
              soundManager.play('cases.tick');
              lastSectorRef.current = currentSector;
            }
          },
        });
      } else {
        rotRef.current.angle = targetAngle;
      }
    }
  }, [snap, layout]);

  /* ---- JSX ------------------------------------------------------------- */

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'auto' }}
      />

      {/* Center overlay text */}
      <div className="absolute z-10 flex flex-col items-center justify-center pointer-events-none">
        <AnimatePresence mode="wait">
          {uiPhase === 'waiting' && remaining !== null && (
            <motion.span
              key={remaining > 0 ? 'timer' : 'go'}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="font-sans tabular-nums"
              style={{
                fontSize: remaining > 0 ? 46 : 16,
                fontWeight: remaining > 0 ? 200 : 400,
                color: remaining > 0 ? '#ffffff' : '#a3a3a3',
                letterSpacing: remaining > 0 ? '-0.03em' : '0.4em',
                textTransform: remaining > 0 ? undefined : 'uppercase',
                textShadow: remaining > 0 ? '0 0 40px rgba(255,255,255,0.2)' : 'none',
              }}
            >
              {remaining > 0
                ? `${String(remaining).padStart(2, '0')}`
                : t('wheel.go')}
            </motion.span>
          )}

          {uiPhase === 'spinning' && (
            <motion.span
              key="spinning"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
              className="font-sans uppercase"
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: '#ffffff',
                letterSpacing: '0.5em',
                textShadow: '0 0 20px rgba(255,255,255,0.5)',
                marginLeft: '0.5em', // offset tracking visually
              }}
            >
              {t('wheel.spin')}
            </motion.span>
          )}

          {uiPhase === 'completed' && snap?.multiplier != null && (
            <motion.span
              key="result"
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="font-sans tabular-nums"
              style={{
                fontSize: 42,
                fontWeight: 300,
                color: SEG_COLOR[snap.multiplier]?.face ?? '#ffffff',
                letterSpacing: '-0.02em',
                textShadow: `0 0 40px ${SEG_COLOR[snap.multiplier]?.pillBg ?? 'rgba(255,255,255,0.2)'}`,
              }}
            >
              ×{snap.multiplier}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
