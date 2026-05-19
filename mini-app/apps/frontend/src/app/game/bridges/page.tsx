'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Footprints, Hand, RotateCcw } from 'lucide-react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { useBalance } from '@/hooks/use-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

/**
 * Bridges — single-player. 5 rows × 4 cells. Cross from bottom up.
 *
 * UI:
 *   - Difficulty pills at the top (Лёгкий / Средний / Сложный) — one
 *     broken cell per row / two / three.
 *   - The bridge is rendered top-down (row 4 at top, row 0 at bottom)
 *     so the user "climbs". Active row glows. Below the bridge: the
 *     ladder of multipliers per row.
 *   - Bet panel + a single CTA that flips between "Начать" → "Шаг"
 *     prompts → "Забрать выигрыш".
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

const LEVEL_LABEL: Record<Level, { ru: string; broken: string }> = {
  easy: { ru: 'Лёгкий', broken: '1 ловушка в ряду' },
  medium: { ru: 'Средний', broken: '2 ловушки в ряду' },
  hard: { ru: 'Сложный', broken: '3 ловушки в ряду' },
};

export default function BridgesPage() {
  const { balance, fetchBalance } = useBalance();
  const [state, setState] = useState<PublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(10);
  const [level, setLevel] = useState<Level>('easy');

  // Fetch existing round (resume after refresh).
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

  const start = async () => {
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
        reportApiError(res, j, 'Не удалось начать раунд');
        throw new Error(j?.message ?? 'start failed');
      }
      setState(j.state);
      soundManager.play('ui.click');
      void fetchBalance();
    } catch (err) {
      console.error('bridges:start', err);
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
        reportApiError(res, j, 'Шаг невозможен');
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
      toast.warn('Сначала пройдите хотя бы один ряд');
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
        reportApiError(res, j, 'Не удалось забрать выигрыш');
        throw new Error(j?.message ?? 'cashout failed');
      }
      setState(j.state);
      toast.success('Выигрыш забран');
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
    () => Math.max(minBet, Math.floor(balance?.amount ?? 10000)),
    [balance]
  );

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar title="Мосты" Icon={Footprints} />

        {/* Difficulty picker — disabled mid-round */}
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
                  'rounded-card border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                  active
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-frost-white/85'
                )}
              >
                <div className="font-roobert text-[14px]">
                  {LEVEL_LABEL[lv].ru}
                </div>
                <div className="font-roobert text-[10px] text-whisper-gray">
                  {LEVEL_LABEL[lv].broken}
                </div>
              </button>
            );
          })}
        </div>

        {/* Bridge field */}
        <BridgeField
          state={state}
          previewLevel={level}
          onStep={step}
          busy={busy}
        />

        {/* CTA */}
        {state && state.state === 'active' ? (
          <button
            onClick={cashout}
            disabled={busy || state.picks.length === 0}
            className={cn(
              'w-full h-12 rounded-pill font-roobert text-[13px] uppercase tracking-[0.2em] transition-colors active:scale-[0.99]',
              state.picks.length > 0
                ? 'bg-frost-white text-midnight-canvas'
                : 'bg-white/[0.06] text-frost-white/65 border border-white/15'
            )}
          >
            {state.picks.length > 0
              ? `Забрать ${(state.betAmount * state.currentMultiplier).toLocaleString('ru-RU', {
                  maximumFractionDigits: 2,
                })} zł · x${state.currentMultiplier}`
              : 'Сделайте первый шаг'}
          </button>
        ) : state && state.state !== 'active' ? (
          <button
            onClick={dismiss}
            className="w-full h-12 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[13px] uppercase tracking-[0.2em] active:scale-[0.99] inline-flex items-center justify-center gap-2"
          >
            <RotateCcw size={14} strokeWidth={1.8} />
            Новый раунд
          </button>
        ) : (
          <BetPanel
            amount={amount}
            setAmount={setAmount}
            minBet={minBet}
            maxBet={maxBet}
            onStart={start}
            busy={busy}
          />
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function BetPanel({
  amount,
  setAmount,
  minBet,
  maxBet,
  onStart,
  busy,
}: {
  amount: number;
  setAmount: (v: number) => void;
  minBet: number;
  maxBet: number;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-card border border-white/10 bg-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
          Ставка
        </div>
        <div className="mt-1.5">
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
            className="w-full bg-transparent text-frost-white font-roobert text-[24px] font-light tabular-nums focus:outline-none"
          />
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        <button
          onClick={onStart}
          disabled={busy}
          className="w-full h-12 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[13px] uppercase tracking-[0.2em] active:scale-[0.99] disabled:opacity-50"
        >
          Начать раунд
        </button>
      </div>
    </div>
  );
}

function BridgeField({
  state,
  previewLevel,
  onStep,
  busy,
}: {
  state: PublicState | null;
  previewLevel: Level;
  onStep: (col: number) => void;
  busy: boolean;
}) {
  const ROWS = 5;
  const COLS = 4;
  const ladder = state
    ? state.ladder
    : previewLadder(previewLevel);

  // Render rows top → bottom (so visually row 4 is at the top).
  const rowsTopDown = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);

  // Where the player currently stands.
  const currentRow = state ? state.picks.length : 0;
  const isFinished = state && state.state !== 'active';
  const broken = state?.broken; // revealed only on finish

  return (
    <div className="relative rounded-card border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-1.5">
      {rowsTopDown.map((row) => {
        const isCurrent = state && state.state === 'active' && row === currentRow;
        const isCleared = state && row < currentRow;
        const m = ladder[row];
        return (
          <div
            key={row}
            className="grid grid-cols-[44px_1fr_44px] items-center gap-2"
          >
            {/* Left badge: row number */}
            <div className="font-roobert text-[10px] text-whisper-gray text-center tabular-nums">
              {row + 1}/{ROWS}
            </div>

            {/* Cells */}
            <div className="grid grid-cols-4 gap-1.5">
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
                  <motion.button
                    key={col}
                    onClick={() => interactive && onStep(col)}
                    disabled={!interactive}
                    animate={
                      isBustHere
                        ? { scale: [1, 0.94, 1.04, 1] }
                        : pickedHere
                          ? { scale: [0.95, 1.02, 1] }
                          : { scale: 1 }
                    }
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className={cn(
                      'relative aspect-square rounded-card border flex items-center justify-center font-roobert text-[12px] tabular-nums select-none transition-colors',
                      isBustHere
                        ? 'border-[rgba(165,45,37,0.7)] bg-[rgba(165,45,37,0.45)] text-frost-white'
                        : isBrokenReveal
                          ? 'border-[rgba(165,45,37,0.35)] bg-[rgba(165,45,37,0.18)] text-[#ff8a76]'
                          : pickedHere
                            ? 'border-[rgba(160,224,171,0.55)] bg-[rgba(160,224,171,0.20)] text-frost-white'
                            : isCurrent
                              ? 'border-white/30 bg-white/[0.10] text-frost-white hover:bg-white/[0.16]'
                              : isCleared
                                ? 'border-white/10 bg-white/[0.03] text-whisper-gray/50'
                                : 'border-white/10 bg-white/[0.04] text-frost-white/40'
                    )}
                  >
                    {isBustHere
                      ? '✕'
                      : isBrokenReveal
                        ? '✕'
                        : pickedHere
                          ? '✓'
                          : null}
                  </motion.button>
                );
              })}
            </div>

            {/* Right badge: row multiplier */}
            <div
              className={cn(
                'rounded-pill border px-2 py-0.5 text-center font-roobert text-[11px] tabular-nums font-semibold',
                isCleared
                  ? 'border-[rgba(160,224,171,0.45)] bg-[rgba(160,224,171,0.15)] text-frost-white'
                  : isCurrent
                    ? 'border-white/30 bg-white/[0.06] text-frost-white'
                    : 'border-white/10 bg-white/[0.03] text-whisper-gray'
              )}
            >
              x{m}
            </div>
          </div>
        );
      })}

      {/* Status banner */}
      <AnimatePresence>
        {state?.state === 'cashed' && state.finalMultiplier && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 rounded-card border border-[rgba(160,224,171,0.45)] bg-[rgba(160,224,171,0.10)] px-3 py-2.5 text-center font-roobert text-[12px] text-frost-white"
          >
            Победа · x{state.finalMultiplier} ·{' '}
            +{(state.finalPayout ?? 0).toLocaleString('ru-RU', {
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
            className="mt-2 rounded-card border border-[rgba(165,45,37,0.45)] bg-[rgba(165,45,37,0.10)] px-3 py-2.5 text-center font-roobert text-[12px] text-[#ff8a76]"
          >
            Поражение · ставка списана
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint at the bottom */}
      {state?.state === 'active' && state.picks.length > 0 && (
        <p className="mt-1 font-roobert text-[11px] text-whisper-gray inline-flex items-center justify-center gap-1.5">
          <Hand size={11} strokeWidth={1.7} />
          Следующий ряд: x{state.nextMultiplier}
        </p>
      )}
    </div>
  );
}

/** Same multiplier ladder constants as the backend, for the preview. */
function previewLadder(level: Level): number[] {
  if (level === 'easy') return [1.32, 1.76, 2.34, 3.12, 4.16];
  if (level === 'medium') return [1.97, 3.95, 7.89, 15.78, 31.56];
  return [3.93, 15.72, 62.86, 251.45, 1005.81];
}
