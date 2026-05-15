'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { CoinflipIcon } from '@/components/ui/game-icon';
import { CoinflipCoin } from '@/components/game/coinflip/coinflip-coin';
import { CoinflipMultiplierStrip } from '@/components/game/coinflip/coinflip-multiplier-strip';
import { CoinflipSideButtons } from '@/components/game/coinflip/coinflip-side-buttons';
import { CoinflipBetPanel } from '@/components/game/coinflip/coinflip-bet-panel';
import { CoinflipHistory } from '@/components/game/coinflip/coinflip-history';
import { CoinflipRulesModal } from '@/components/game/coinflip/coinflip-rules-modal';

import { useBalance } from '@/hooks/use-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import type {
  CoinSide,
  CoinflipMode,
  CoinflipMultiplyState,
  CoinflipQuickResult,
  CoinflipHistoryEntry,
} from '@/lib/games/coinflip/types';

/**
 * Coinflip Game Page — Monopo Saigon Theme
 *
 * Two flows wrapped in a single page:
 *
 *   quick    — POST /api/games/coinflip/quick → outcome immediately,
 *              the coin spins for ~1.2 s, then the SFX fires.
 *
 *   multiply — POST /api/games/coinflip/start to debit the stake and
 *              resolve the first toss; subsequent rounds use /flip.
 *              The user can /cashout after any winning round; one
 *              losing round wipes the bank. /dismiss clears a finished
 *              session so the user can start fresh without leaving the
 *              page.
 *
 * The animation is fire-and-forget: the page receives the outcome from
 * the server and tells <CoinflipCoin> which face to settle on. The coin
 * handles its own spin internally.
 */

const STEP_MULTIPLIER = 1.94;

export default function CoinflipGamePage() {
  const { balance, fetchBalance } = useBalance();

  const [mode, setMode] = useState<CoinflipMode>('multiply');
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Coin animation state
  const [coinFace, setCoinFace] = useState<CoinSide>('heads');
  const [flipKey, setFlipKey] = useState(0);
  const [flipping, setFlipping] = useState(false);

  // Quick-mode last result (revealed AFTER the spin completes).
  const [lastQuick, setLastQuick] = useState<CoinflipQuickResult | null>(null);

  // Multiply state mirrored from server.
  const [multi, setMulti] = useState<CoinflipMultiplyState | null>(null);

  // Live ticker
  const [history, setHistory] = useState<CoinflipHistoryEntry[]>([]);

  /** Pending side reveal — withheld until the spin animation finishes. */
  const pendingResolveRef = useRef<{
    outcome: CoinSide;
    state?: CoinflipMultiplyState;
    quick?: CoinflipQuickResult;
  } | null>(null);

  // Init sound + resume any active multiply session.
  useEffect(() => {
    soundManager.initialize();
    let alive = true;
    void fetchBalance();
    (async () => {
      try {
        const res = await fetch('/api/games/coinflip/state', {
          credentials: 'include',
        });
        if (!alive || !res.ok) return;
        const json = (await res.json()) as { state: CoinflipMultiplyState | null };
        if (json.state) {
          setMulti(json.state);
          if (json.state.lastOutcome) {
            setCoinFace(json.state.lastOutcome);
          }
        }
      } catch {
        // ignore
      }
    })();

    const fetchHist = async () => {
      try {
        const res = await fetch('/api/games/coinflip/history?limit=40', {
          credentials: 'include',
        });
        if (!alive || !res.ok) return;
        const json = (await res.json()) as { history: CoinflipHistoryEntry[] };
        setHistory(json.history ?? []);
      } catch {}
    };
    void fetchHist();
    const id = setInterval(fetchHist, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------- spin orchestration */

  /** Trigger the spin animation and reveal the result when it settles. */
  function startSpin(
    outcome: CoinSide,
    payload: { state?: CoinflipMultiplyState; quick?: CoinflipQuickResult }
  ) {
    pendingResolveRef.current = { outcome, ...payload };
    setFlipping(true);
    setCoinFace(outcome);
    setFlipKey((k) => k + 1);

    // After the animation duration, reveal.
    setTimeout(() => {
      const pending = pendingResolveRef.current;
      pendingResolveRef.current = null;
      setFlipping(false);
      if (!pending) return;

      if (pending.quick) {
        setLastQuick(pending.quick);
        soundManager.play(pending.quick.won ? 'game.win' : 'game.lose');
      }
      if (pending.state) {
        setMulti(pending.state);
        if (pending.state.status === 'busted') {
          soundManager.play('game.lose');
        } else if (pending.state.status === 'cashed') {
          soundManager.play('game.cashout');
        } else {
          soundManager.play('game.bet_placed');
        }
      }
      void fetchBalance();
    }, 1250);
  }

  /* ------------------------------------------------------- actions */

  async function pickSide(side: CoinSide) {
    if (busy || flipping) return;

    if (mode === 'quick') {
      setBusy(true);
      try {
        const res = await fetch('/api/games/coinflip/quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ amount, choice: side }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message ?? 'Quick toss failed');
        const result = json.result as CoinflipQuickResult;
        startSpin(result.outcome, { quick: result });
      } catch (err) {
        console.error('coinflip:quick', err);
      } finally {
        setBusy(false);
      }
      return;
    }

    // Multiply mode — either start a new session or feed the next flip.
    setBusy(true);
    try {
      if (!multi || multi.status !== 'awaiting') {
        const res = await fetch('/api/games/coinflip/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ amount, choice: side }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message ?? 'Start failed');
        startSpin(json.outcome as CoinSide, {
          state: json.state as CoinflipMultiplyState,
        });
      } else {
        const res = await fetch('/api/games/coinflip/flip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ choice: side }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message ?? 'Flip failed');
        startSpin(json.outcome as CoinSide, {
          state: json.state as CoinflipMultiplyState,
        });
      }
    } catch (err) {
      console.error('coinflip:flip', err);
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (busy || flipping) return;
    if (!multi || multi.status !== 'awaiting' || multi.currentMultiplier <= 1) return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/coinflip/cashout', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Cashout failed');
      setMulti(json.state as CoinflipMultiplyState);
      soundManager.play('game.cashout');
      void fetchBalance();
    } catch (err) {
      console.error('coinflip:cashout', err);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    try {
      await fetch('/api/games/coinflip/dismiss', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    setMulti(null);
    setLastQuick(null);
  }

  /* --------------------------------------------------- derived state */

  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(balance?.amount ?? 10000)),
    [balance]
  );

  const sessionActive = !!multi && multi.status === 'awaiting';
  const sessionFinished = !!multi && multi.status !== 'awaiting';

  /** True when the user has enough balance to start a NEW session. */
  const canAfford = (balance?.amount ?? 0) >= amount && amount >= minBet;

  const currentRound = multi?.round ?? 1;
  const maxRounds = multi?.maxRounds ?? 20;
  const currentMultiplier = multi?.currentMultiplier ?? 0;
  const nextMultiplier = multi?.nextMultiplier ?? STEP_MULTIPLIER;

  const fallbackMultipliers = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) =>
        +(STEP_MULTIPLIER ** (i + 1)).toFixed(2)
      ),
    []
  );
  const stripMultipliers = multi?.multipliers ?? fallbackMultipliers;

  const headsCaption =
    mode === 'multiply'
      ? sessionActive
        ? `x${nextMultiplier.toFixed(2)}`
        : `x${STEP_MULTIPLIER.toFixed(2)}`
      : `x${STEP_MULTIPLIER.toFixed(2)}`;
  const tailsCaption = headsCaption;

  /* -------------------------------------------------------- render */

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-3 pb-28 flex flex-col gap-3">
        <GameTopBar
          title="Coinflip"
          Icon={CoinflipIcon}
          onHowToPlay={() => setRulesOpen(true)}
        />

        {/* Hero — coin centre stage, then round/multiplier plate, then side picks */}
        <section className="relative rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl px-4 pt-6 pb-4 flex flex-col items-center gap-4 overflow-hidden">
          {/* Atmospheric backdrop */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background:
                'radial-gradient(80% 60% at 50% 20%, rgba(255, 172, 46, 0.15) 0%, rgba(165, 45, 37, 0.08) 35%, transparent 75%)',
            }}
          />

          {/* The coin itself — front and centre */}
          <div className="relative">
            <CoinflipCoin
              face={coinFace}
              flipKey={flipKey}
              flipping={flipping}
            />
          </div>

          {/* Round / multiplier plate */}
          <div className="relative w-full grid grid-cols-2 gap-2 items-stretch">
            <div className="rounded-card border border-white/10 bg-white/[0.04] px-4 py-2.5">
              <span className="font-roobert text-frost-white text-[18px] font-light tabular-nums leading-none">
                {mode === 'multiply'
                  ? `${Math.max(0, currentRound - 1)} из ${maxRounds}`
                  : '—'}
              </span>
              <div className="mt-1 font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
                раунд
              </div>
            </div>
            <div className="rounded-card border border-white/10 bg-white/[0.04] px-4 py-2.5 text-right">
              <span
                className={`font-roobert text-[18px] font-light tabular-nums leading-none ${
                  currentMultiplier > 0 ? 'text-frost-white' : 'text-whisper-gray'
                }`}
              >
                x{currentMultiplier.toFixed(2)}
              </span>
              <div className="mt-1 font-roobert text-[10px] uppercase tracking-[0.2em] text-whisper-gray">
                множитель
              </div>
            </div>
          </div>

          {/* Side buttons */}
          <div className="relative w-full">
            <CoinflipSideButtons
              onPick={pickSide}
              disabled={busy || flipping || sessionFinished || (!sessionActive && !canAfford)}
              captions={{ heads: headsCaption, tails: tailsCaption }}
            />
          </div>

          {/* Insufficient-balance hint */}
          {!sessionActive && !canAfford && (
            <span className="relative font-roobert text-[11px] text-[#ff8a76]/85">
              Недостаточно средств для ставки
            </span>
          )}

          {/* Multiplier dot strip — only shown in multiply mode */}
          {mode === 'multiply' && (
            <div className="relative w-full">
              <CoinflipMultiplierStrip
                multipliers={stripMultipliers}
                round={currentRound}
              />
            </div>
          )}
        </section>

        {/* Bet + mode */}
        <CoinflipBetPanel
          amount={amount}
          onAmountChange={setAmount}
          mode={mode}
          onModeChange={(next) => {
            // Don't let the user switch modes while a multiply session
            // is mid-flight — they'd lose their stake.
            if (sessionActive) return;
            setMode(next);
          }}
          minBet={minBet}
          maxBet={maxBet}
          locked={sessionActive || flipping || busy}
        />

        {/* Quick-mode result reveal */}
        {mode === 'quick' && lastQuick && !flipping && (
          <div
            className="rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl px-4 py-3 flex items-center justify-between"
            style={{
              borderColor: lastQuick.won
                ? 'rgba(160,224,171,0.45)'
                : 'rgba(165,45,37,0.45)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-roobert text-[12px] uppercase tracking-[0.2em] text-whisper-gray">
                Результат
              </span>
              <span
                className={`font-roobert text-[14px] tabular-nums ${
                  lastQuick.won ? 'text-frost-white' : 'text-[#ff8a76]'
                }`}
              >
                {lastQuick.outcome === 'heads' ? 'Орёл' : 'Решка'}
              </span>
            </div>
            <span
              className={`font-roobert text-[14px] tabular-nums ${
                lastQuick.won ? 'text-frost-white' : 'text-[#ff8a76]/80'
              }`}
            >
              {lastQuick.won ? '+' : '−'}
              {(lastQuick.won
                ? lastQuick.payout
                : lastQuick.betAmount
              ).toLocaleString('ru-RU')}{' '}
              ₽
            </span>
          </div>
        )}

        {/* Multiply round CTA — cashout / new round */}
        {mode === 'multiply' && multi && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={cashout}
              disabled={
                busy || flipping || multi.status !== 'awaiting' || multi.currentMultiplier <= 1
              }
              className="h-11 rounded-pill border border-white/15 bg-white/[0.04] font-roobert text-[12px] uppercase tracking-[0.2em] text-frost-white hover:border-white/30 disabled:opacity-50 transition-colors"
            >
              Забрать
              {multi.currentMultiplier > 1 ? ` · x${multi.currentMultiplier.toFixed(2)}` : ''}
            </button>
            <button
              onClick={dismiss}
              disabled={multi.status === 'awaiting'}
              className="h-11 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[12px] uppercase tracking-[0.2em] hover:bg-frost-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {multi.status === 'busted'
                ? 'Новая ставка'
                : multi.status === 'cashed'
                ? `Забрано · +${(multi.payout ?? 0).toLocaleString('ru-RU')} ₽`
                : 'Серия идёт…'}
            </button>
          </div>
        )}

        {/* Live history */}
        <CoinflipHistory entries={history} />
      </div>

      <CoinflipRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
