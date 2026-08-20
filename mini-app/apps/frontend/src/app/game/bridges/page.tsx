'use client';

import { useRouter } from 'next/navigation';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Footprints,
  RotateCcw,
  Flame,
  ChevronUp,
  Minus,
  Plus,
  Repeat,
  Play,
  Trophy,
  ShieldHalf,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { useBalanceStore } from '@/store/balance-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/use-t';
import type { TxKey } from '@/i18n/use-t';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  KitStepperButton,
  StakeField,
} from '@/components/game/kit';

/**
 * Bridges — premium redesign with a proper betting panel.
 *
 * Layout (mobile-first):
 *   1. Top bar.
 *   2. Difficulty pills.
 *   3. Headline plate (current/potential payout + ×N badge).
 *   4. Bridge field (5 rows × 4 planks, top-down).
 *   5. Betting panel — the centrepiece.
 *      Two columns:
 *        - Stake input with `−` / `÷2` / `×2` / `+` buttons + quick
 *          chips for common amounts.
 *        - Auto-bet toggle + auto-bet count input.
 *      One full-width gradient CTA "Start Round".
 *   6. Cashout / new round CTA replaces panel during active round.
 *
 * Auto-bet runs locally: keeps re-firing /start at the configured
 * difficulty, but only when the user is OUT of an active round AND
 * has at least `amount` balance. A counter shows remaining auto-bet
 * runs; setting it to 0 means infinite.
 *
 * All UI text goes through the locale dictionaries (RU default).
 */

type Level = 'easy' | 'medium' | 'hard';

interface PublicState {
  roundId: string;
  level: Level;
  betAmount: number;
  rows: number;
  cols: number;
  picks: number[];
  currentMultiplier: number;
  nextMultiplier: number;
  ladder: number[];
  state: 'active' | 'cashed' | 'busted';
  serverSeedHash: string;
  serverSeed?: string;
  broken?: number[][];
  finalMultiplier?: number;
  finalPayout?: number;
  bustedAt?: { row: number; col: number };
}

function bridgesLevel(
  t: (key: TxKey, vars?: Record<string, string | number>) => string,
  lv: Level
) {
  switch (lv) {
    case 'easy':
      return { label: t('bridges.easy'), sub: t('bridges.easySub') };
    case 'medium':
      return { label: t('bridges.medium'), sub: t('bridges.mediumSub') };
    case 'hard':
      return { label: t('bridges.hard'), sub: t('bridges.hardSub') };
  }
}

const QUICK_AMOUNTS: number[] = [];
// Unused — kept as a placeholder so hot-reload doesn't whine about empties.
void QUICK_AMOUNTS;

export default function BridgesPage() {
  const { t, localeTag } = useT();
  const router = useRouter();
  const { balance, isLoading: isBalanceLoading, fetchBalance } = useBalance();
  const tournamentBalances = useBalanceStore((s) => s.tournamentBalances);
  const tournamentBalance = tournamentBalances.find(
    (entry) => entry.gameType === 'bridges'
  );
  const isBalanceReady = tournamentBalance !== undefined || balance !== null;
  const activeBalance = tournamentBalance?.balance ?? balance?.amount ?? 0;
  const [state, setState] = useState<PublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(10);
  const [level, setLevel] = useState<Level>('easy');

  // Auto-bet config.
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoCount, setAutoCount] = useState<number>(0); // 0 = infinite
  const [autoRemaining, setAutoRemaining] = useState<number>(0);

  useEffect(() => {
    soundManager.initialize();
    void (async () => {
      try {
        const res = await fetch('/api/games/bridges/state', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const j = await res.json();
        const s = j.state as PublicState | null;
        if (s) {
          setState(s);
          setLevel(s.level);
        }
      } catch {
        // ignore
      }
    })();
    void fetchBalance();
  }, [fetchBalance]);

  // Auto-bet driver: when no active round + autoEnabled, kick off /start.
  useEffect(() => {
    if (!autoEnabled) return;
    if (state?.state === 'active') return;
    if (autoCount > 0 && autoRemaining <= 0) {
      setAutoEnabled(false);
      return;
    }
    if (!isBalanceReady) return;
    if (amount > activeBalance || amount <= 0) {
      setAutoEnabled(false);
      toast.warn('Авто-ставка остановлена — недостаточно средств');
      return;
    }
    const id = setTimeout(() => void startGame(), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoEnabled,
    state?.state,
    activeBalance,
    autoRemaining,
    isBalanceReady,
  ]);

  const startGame = async () => {
    if (busy) return;
    if (!isBalanceReady) {
      toast.warn('Баланс ещё загружается');
      return;
    }
    if (amount <= 0) {
      toast.warn('Введите сумму ставки');
      return;
    }
    const have = activeBalance;
    if (amount > have) {
      toast.warn(
        `Недостаточно средств — у вас ${have.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${tournamentBalance ? '🏆' : 'zł'}`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/games/bridges/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, level }),
      });
      const j = await res.json();
      if (!res.ok) {
        reportApiError(res, j, t('bridges.startFailed'));
        throw new Error(j?.message ?? 'start failed');
      }
      setState(j.state);
      soundManager.play('ui.click');
      void fetchBalance();
      if (autoEnabled && autoCount > 0) {
        setAutoRemaining((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error('bridges:start', err);
      setAutoEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const step = async (col: number) => {
    if (busy || !state || state.state !== 'active') return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/bridges/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ col }),
      });
      const j = await res.json();
      if (!res.ok) {
        reportApiError(res, j, t('bridges.stepFailed'));
        throw new Error(j?.message ?? 'step failed');
      }
      const next = j.state as PublicState;
      setState(next);
      if (next.state === 'busted') {
        soundManager.play('game.lose');
        void fetchBalance();
      } else {
        soundManager.play('ui.click');
      }
    } catch (err) {
      console.error('bridges:step', err);
    } finally {
      setBusy(false);
    }
  };

  const cashout = async () => {
    if (busy || !state || state.state !== 'active') return;
    if (state.picks.length === 0) {
      toast.warn('Перейдите хотя бы один ряд, перед тем как забрать выигрыш');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/games/bridges/cashout', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await res.json();
      if (!res.ok) {
        reportApiError(res, j, t('bridges.cashoutFailed'));
        throw new Error(j?.message ?? 'cashout failed');
      }
      setState(j.state);
      toast.cashout((j.state as PublicState)?.currentMultiplier ?? 0, t('bridges.cashedToast'));
      soundManager.play('game.cashout');
      void fetchBalance();
    } catch (err) {
      console.error('bridges:cashout', err);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    try {
      await fetch('/api/games/bridges/dismiss', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    setState(null);
  };

  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(activeBalance)),
    [activeBalance]
  );
  const canAfford =
    isBalanceReady && amount >= minBet && amount <= activeBalance;

  const isActive = state?.state === 'active';
  const ladder = state?.ladder ?? previewLadder(level);
  const currentRowIndex = state ? state.picks.length : -1;
  const potentialPayout =
    state && state.picks.length > 0
      ? state.betAmount * state.currentMultiplier
      : 0;

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar
          title="Bridges"
          Icon={Footprints}
          onHowToPlay={() => router.push('/info#faq')}
        />

        {/* Difficulty pills */}
        <div className="grid grid-cols-3 gap-2">
          {(['easy', 'medium', 'hard'] as Level[]).map((lv) => {
            const active = state ? state.level === lv : level === lv;
            const dis = state?.state === 'active';
            return (
              <button
                key={lv}
                disabled={dis}
                onClick={() => !dis && setLevel(lv)}
                className={cn(
                  'rounded-card border px-3 py-2.5 text-left transition-colors disabled:opacity-50 active:scale-[0.99]',
                  active
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/85'
                )}
              >
                <div className="font-roobert text-[14px] font-semibold">
                  {bridgesLevel(t, lv).label}
                </div>
                <div className="font-roobert text-[10px] text-whisper-gray">
                  {bridgesLevel(t, lv).sub}
                </div>
              </button>
            );
          })}
        </div>

        <HeadlinePlate
          state={state}
          potentialPayout={potentialPayout}
          level={level}
        />

        <BridgeField
          state={state}
          ladder={ladder}
          currentRow={currentRowIndex}
          onStep={step}
          busy={busy}
        />

        {!state && (
          <BetPanel
            amount={amount}
            setAmount={setAmount}
            minBet={minBet}
            maxBet={maxBet}
            onStart={startGame}
            busy={busy}
            autoEnabled={autoEnabled}
            setAutoEnabled={(v) => {
              setAutoEnabled(v);
              if (v) setAutoRemaining(autoCount);
            }}
            autoCount={autoCount}
            setAutoCount={setAutoCount}
            autoRemaining={autoRemaining}
            disabled={busy || isBalanceLoading || !canAfford}
            balanceReady={isBalanceReady}
            canAfford={canAfford}
            balanceAmount={activeBalance}
          />
        )}

        {state && isActive && (
          <button
            onClick={cashout}
            disabled={busy || state.picks.length === 0}
            className={cn(
              'w-full h-14 rounded-pill font-roobert text-[14px] font-semibold uppercase tracking-[0.18em] transition-all active:scale-[0.99]',
              state.picks.length > 0
                ? 'bg-frost-white text-midnight-canvas shadow-[0_4px_24px_rgba(255,255,255,0.18)] hover:bg-frost-white/95'
                : 'bg-white/[0.06] text-frost-white/65 border border-white/15'
            )}
          >
            {state.picks.length > 0
              ? t('bridges.cashOut', {
                  amount: potentialPayout.toLocaleString(localeTag, {
                    maximumFractionDigits: 2,
                  }),
                })
              : t('bridges.step')}
          </button>
        )}

        {state && !isActive && (
          <button
            onClick={dismiss}
            className="w-full h-14 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[14px] font-semibold uppercase tracking-[0.18em] active:scale-[0.99] inline-flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(255,255,255,0.18)]"
          >
            <RotateCcw size={15} strokeWidth={1.8} />
            {t('bridges.newRound')}
          </button>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Headline plate                                                             */
/* -------------------------------------------------------------------------- */

function HeadlinePlate({
  state,
  potentialPayout,
  level,
}: {
  state: PublicState | null;
  potentialPayout: number;
  level: Level;
}) {
  const { t, localeTag } = useT();
  const status = state?.state ?? 'idle';

  return (
    <div className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(110% 90% at 100% 0%, rgba(160, 224, 171, 0.18) 0%, rgba(255, 172, 46, 0.10) 50%, transparent 75%)',
        }}
      />
      <div className="relative px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-roobert text-[10px] uppercase tracking-[0.32em] text-whisper-gray">
            {status === 'active'
              ? t('bridges.currentWin')
              : status === 'cashed'
                ? t('bridges.cashedOut')
                : status === 'busted'
                  ? t('bridges.roundLost')
                  : t('bridges.ready')}
          </div>
          <div className="mt-1 font-roobert text-[28px] font-light tabular-nums text-frost-white leading-none">
            {state?.state === 'cashed'
              ? `+${(state.finalPayout ?? 0).toLocaleString(localeTag, { maximumFractionDigits: 2 })}`
              : state?.state === 'busted'
                ? '0.00'
                : potentialPayout.toLocaleString(localeTag, {
                    maximumFractionDigits: 2,
                  })}{' '}
            <span className="text-[14px] text-whisper-gray">zł</span>
          </div>
          <div className="mt-1 font-roobert text-[11px] text-whisper-gray">
            {state
              ? t('bridges.stakeLine', {
                  level: bridgesLevel(t, state.level).label,
                  amount: state.betAmount.toLocaleString(localeTag),
                })
              : bridgesLevel(t, level).label}
          </div>
        </div>

        <div
          className={cn(
            'shrink-0 inline-flex items-center justify-center w-16 h-16 rounded-card border font-roobert font-light tabular-nums',
            status === 'active'
              ? 'border-[#ffac2e]/45 bg-[#ffac2e]/10 text-frost-white'
              : status === 'cashed'
                ? 'border-[#a0e0ab]/45 bg-[#a0e0ab]/10 text-frost-white'
                : status === 'busted'
                  ? 'border-[#ff8a76]/45 bg-[#ff8a76]/10 text-[#ff8a76]'
                  : 'border-white/15 bg-white/[0.04] text-frost-white/85'
          )}
        >
          <div className="text-center leading-none">
            <div className="text-[18px] font-semibold">
              ×
              {state?.state === 'cashed'
                ? state.finalMultiplier
                : state?.state === 'busted'
                  ? '0'
                  : state?.currentMultiplier ?? 1}
            </div>
            <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-whisper-gray">
              multiplier
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bridge field                                                               */
/* -------------------------------------------------------------------------- */

function BridgeField({
  state,
  ladder,
  currentRow,
  onStep,
  busy,
}: {
  state: PublicState | null;
  ladder: number[];
  currentRow: number;
  onStep: (col: number) => void;
  busy: boolean;
}) {
  const ROWS = 5;
  const COLS = 4;
  const rowsTopDown = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);
  const isFinished = state && state.state !== 'active';
  const broken = state?.broken;
  const isActive = state?.state === 'active';

  return (
    <div
      className="relative rounded-card border border-white/10 overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(20,30,28,0.55) 0%, rgba(10,12,16,0.85) 100%)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(160,224,171,0.55), rgba(160,224,171,0.05) 65%, transparent)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-[3px] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,172,46,0.55), rgba(255,172,46,0.05) 65%, transparent)',
        }}
      />

      <div className="relative p-3 flex flex-col gap-2">
        {rowsTopDown.map((row) => {
          const isCurrent = isActive && row === currentRow;
          const isCleared = state ? row < currentRow : false;
          const isUntouched = !state || row > currentRow;
          const m = ladder[row];

          return (
            <div
              key={row}
              className="grid grid-cols-[1fr_auto] items-center gap-2"
            >
              <div
                className={cn(
                  'relative grid grid-cols-4 gap-1.5 px-2 py-2 rounded-card transition-colors',
                  isCurrent &&
                    'bg-[rgba(255,172,46,0.06)] ring-1 ring-[rgba(255,172,46,0.45)]'
                )}
              >
                {Array.from({ length: COLS }, (_, col) => {
                  const pickedHere = state?.picks[row] === col;
                  const isBrokenReveal =
                    isFinished && broken?.[row]?.includes(col);
                  const isBustHere =
                    state?.state === 'busted' &&
                    state.bustedAt?.row === row &&
                    state.bustedAt.col === col;
                  const interactive =
                    isCurrent && !busy && state?.state === 'active';

                  return (
                    <Plank
                      key={col}
                      onClick={() => interactive && onStep(col)}
                      interactive={interactive}
                      pickedHere={pickedHere}
                      brokenReveal={!!isBrokenReveal}
                      bustHere={isBustHere ?? false}
                      cleared={isCleared}
                      untouched={isUntouched}
                      currentRow={isCurrent}
                    />
                  );
                })}

                {isCurrent && (
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute -left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded-pill bg-[#ffac2e] text-midnight-canvas"
                  >
                    <ChevronUp size={12} strokeWidth={2.4} />
                  </motion.span>
                )}
              </div>

              <RowBadge
                value={m}
                row={row}
                cleared={isCleared}
                current={isCurrent}
              />
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {state?.state === 'cashed' && state.finalMultiplier && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2.5 mx-3 mb-3 rounded-card border border-[rgba(160,224,171,0.45)] bg-[rgba(160,224,171,0.10)] text-center font-roobert text-[12px] text-frost-white"
          >
            Win · ×{state.finalMultiplier} ·{' '}
            +
            {(state.finalPayout ?? 0).toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            zł
          </motion.div>
        )}
        {state?.state === 'busted' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2.5 mx-3 mb-3 rounded-card border border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.10)] text-center font-roobert text-[12px] text-[#ff8a76] inline-flex items-center justify-center gap-1.5"
          >
            <Flame size={13} strokeWidth={1.8} />
            Lost — stake forfeited
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plank                                                                      */
/* -------------------------------------------------------------------------- */

function Plank({
  onClick,
  interactive,
  pickedHere,
  brokenReveal,
  bustHere,
  cleared,
  untouched,
  currentRow,
}: {
  onClick: () => void;
  interactive: boolean;
  pickedHere: boolean;
  brokenReveal: boolean;
  bustHere: boolean;
  cleared: boolean;
  untouched: boolean;
  currentRow: boolean;
}) {
  let style: 'bust' | 'broken' | 'picked' | 'current' | 'cleared' | 'untouched';
  if (bustHere) style = 'bust';
  else if (brokenReveal) style = 'broken';
  else if (pickedHere) style = 'picked';
  else if (currentRow) style = 'current';
  else if (cleared) style = 'cleared';
  else style = 'untouched';

  const STYLES: Record<
    typeof style,
    { bg: string; border: string; text: string; glow?: string }
  > = {
    bust: {
      bg: 'linear-gradient(180deg, rgb(176, 60, 50) 0%, rgb(120, 30, 22) 100%)',
      border: 'rgba(255,138,118,0.7)',
      text: '#fff',
      glow: 'rgba(165,45,37,0.55)',
    },
    broken: {
      bg: 'linear-gradient(180deg, rgba(120, 30, 22, 0.55) 0%, rgba(80, 20, 14, 0.55) 100%)',
      border: 'rgba(255,138,118,0.4)',
      text: 'rgba(255,138,118,0.95)',
    },
    picked: {
      bg: 'linear-gradient(180deg, rgb(120, 78, 34) 0%, rgb(82, 50, 22) 100%)',
      border: 'rgba(160,224,171,0.55)',
      text: '#fff',
    },
    current: {
      bg: 'linear-gradient(180deg, rgb(110, 72, 32) 0%, rgb(70, 44, 18) 100%)',
      border: 'rgba(255,172,46,0.7)',
      text: 'rgba(255,255,255,0.95)',
    },
    cleared: {
      bg: 'linear-gradient(180deg, rgba(60, 38, 18, 0.6) 0%, rgba(38, 24, 12, 0.6) 100%)',
      border: 'rgba(160,224,171,0.25)',
      text: 'rgba(220,220,220,0.55)',
    },
    untouched: {
      bg: 'linear-gradient(180deg, rgba(70, 44, 22, 0.45) 0%, rgba(44, 28, 14, 0.45) 100%)',
      border: 'rgba(255,255,255,0.10)',
      text: 'rgba(220,220,220,0.45)',
    },
  };
  const s = STYLES[style];

  return (
    <motion.button
      onClick={onClick}
      disabled={!interactive}
      whileTap={interactive ? { scale: 0.94 } : undefined}
      animate={
        bustHere
          ? { scale: [1, 0.92, 1.05, 1] }
          : pickedHere
            ? { scale: [0.92, 1.04, 1] }
            : { scale: 1 }
      }
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={cn(
        'relative aspect-[4/3] rounded-md border flex items-center justify-center font-roobert font-semibold text-[14px] tabular-nums select-none overflow-hidden',
        interactive && 'cursor-pointer'
      )}
      style={{
        background: s.bg,
        borderColor: s.border,
        color: s.text,
        boxShadow: s.glow
          ? `0 0 14px 1px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.45)`
          : 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.40)',
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(180deg, transparent 0 6px, rgba(0,0,0,0.10) 6px 7px)',
        }}
      />
      <span className="relative">
        {bustHere ? '✕' : brokenReveal ? '✕' : pickedHere ? '✓' : null}
      </span>
    </motion.button>
  );
}

/* -------------------------------------------------------------------------- */
/* Row badge                                                                  */
/* -------------------------------------------------------------------------- */

function RowBadge({
  value,
  row,
  cleared,
  current,
}: {
  value: number;
  row: number;
  cleared: boolean;
  current: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5 w-16">
      <span
        className={cn(
          'inline-flex items-center justify-center px-2 py-0.5 rounded-pill border font-roobert font-semibold tabular-nums text-[11px]',
          cleared
            ? 'border-[rgba(160,224,171,0.55)] bg-[rgba(160,224,171,0.15)] text-frost-white'
            : current
              ? 'border-[rgba(255,172,46,0.55)] bg-[rgba(255,172,46,0.15)] text-frost-white'
              : 'border-white/10 bg-white/[0.03] text-whisper-gray'
        )}
      >
        ×{formatMult(value)}
      </span>
      <span className="font-roobert text-[9px] uppercase tracking-[0.18em] text-whisper-gray tabular-nums">
        Row {row + 1}
      </span>
    </div>
  );
}

function formatMult(m: number): string {
  if (m >= 1000) {
    const k = m / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}K` : `${k.toFixed(1)}K`;
  }
  if (m >= 100) return m.toFixed(0);
  if (m >= 10) return m.toFixed(1);
  return m.toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* BetPanel — premium                                                         */
/* -------------------------------------------------------------------------- */

function BetPanel({
  amount,
  setAmount,
  minBet,
  maxBet,
  onStart,
  busy,
  autoEnabled,
  setAutoEnabled,
  autoCount,
  setAutoCount,
  autoRemaining,
  disabled,
  balanceReady,
  canAfford,
  balanceAmount,
}: {
  amount: number;
  setAmount: (v: number) => void;
  minBet: number;
  maxBet: number;
  onStart: () => void;
  busy: boolean;
  autoEnabled: boolean;
  setAutoEnabled: (v: boolean) => void;
  autoCount: number;
  setAutoCount: (v: number) => void;
  autoRemaining: number;
  disabled: boolean;
  balanceReady: boolean;
  canAfford: boolean;
  balanceAmount: number;
}) {
  const { t } = useT();
  const clamp = (v: number) => Math.max(minBet, Math.min(maxBet, v));
  const ctaDisabled = disabled;
  const ctaActive = balanceReady && canAfford && !busy;

  return (
    <BetPanelShell>
      <div className="grid grid-cols-2 items-stretch">
        <div className="px-4 py-3 border-r border-white/10">
          <StakeField
            amount={amount}
            onAmountChange={(next) => setAmount(clamp(next))}
            minBet={minBet}
            maxBet={maxBet}
            disabled={autoEnabled}
            label={t('common.bet')}
            decreaseLabel={t('common.decreaseBet')}
            increaseLabel={t('common.increaseBet')}
          />
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert truncate">
              {t('common.autoBet')}
            </span>
            <button
              type="button"
              onClick={() => setAutoEnabled(!autoEnabled)}
              disabled={!autoEnabled && disabled}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[9px] uppercase tracking-[0.16em] font-roobert transition-colors disabled:opacity-40',
                autoEnabled
                  ? 'bg-frost-white text-midnight-canvas border-frost-white'
                  : 'bg-transparent text-frost-white/70 border-white/20 hover:border-white/35'
              )}
            >
              {autoEnabled ? t('common.on') : t('common.off')}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <KitStepperButton
              onClick={() => setAutoCount(Math.max(0, autoCount - 1))}
              disabled={autoEnabled}
              ariaLabel={t('common.decreaseBet')}
            >
              <Minus size={12} strokeWidth={2.2} />
            </KitStepperButton>
            <input
              type="number"
              min={0}
              max={9999}
              value={autoCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setAutoCount(Number.isFinite(v) ? Math.max(0, Math.min(9999, v)) : 0);
              }}
              placeholder="∞"
              disabled={autoEnabled}
              className="flex-1 min-w-0 bg-transparent text-frost-white font-roobert text-[22px] font-light tabular-nums focus:outline-none text-center disabled:opacity-50"
            />
            <KitStepperButton
              onClick={() => setAutoCount(Math.min(9999, autoCount + 1))}
              disabled={autoEnabled}
              ariaLabel={t('common.increaseBet')}
            >
              <Plus size={12} strokeWidth={2.2} />
            </KitStepperButton>
          </div>
        </div>
      </div>

      <BetPanelCtaRow>
        <GamePrimaryButton
          onClick={onStart}
          disabled={ctaDisabled}
          tone={ctaActive ? 'solid' : 'muted'}
        >
          {!balanceReady
            ? t('common.loadingBalance')
            : !canAfford
              ? t('common.insufficientFunds')
              : busy
                ? t('bridges.starting')
                : t('bridges.startRound')}
        </GamePrimaryButton>
      </BetPanelCtaRow>
    </BetPanelShell>
  );
}

function previewLadder(level: Level): number[] {
  if (level === 'easy') return [1.32, 1.76, 2.34, 3.12, 4.16];
  if (level === 'medium') return [1.97, 3.95, 7.89, 15.78, 31.56];
  return [3.93, 15.72, 62.86, 251.45, 1005.81];
}
