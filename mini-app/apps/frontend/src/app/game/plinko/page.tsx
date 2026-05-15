'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';

import { GameTopBar } from '@/components/game/game-top-bar';
import { PlinkoBoard, type PlinkoDrop } from '@/components/game/plinko/plinko-board';
import { PlinkoMultiplierStrip } from '@/components/game/plinko/plinko-multiplier-strip';
import { PlinkoRiskSelector } from '@/components/game/plinko/plinko-risk-selector';
import { PlinkoBetPanel } from '@/components/game/plinko/plinko-bet-panel';
import { PlinkoHistory } from '@/components/game/plinko/plinko-history';
import {
  PlinkoMyWins,
  type PlinkoMyWin,
} from '@/components/game/plinko/plinko-my-wins';
import { PlinkoRulesModal } from '@/components/game/plinko/plinko-rules-modal';

import { useBalance } from '@/hooks/use-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import type {
  PlinkoConfig,
  PlinkoDropResult,
  PlinkoHistoryEntry,
  PlinkoRisk,
} from '@/lib/games/plinko/types';

/**
 * Plinko Game Page — Monopo Saigon Theme
 *
 * Single-shot REST flow:
 *   1. POST /api/games/plinko/drop — server picks the bucket via
 *      provably-fair seed, debits the stake, credits the payout.
 *   2. Frontend animates the ball along the deterministic path returned
 *      by the server using a parabolic-arc physics simulation, then
 *      flashes the winning bucket pill and emits the outcome SFX once
 *      the ball actually arrives.
 *   3. Live ticker pulls /api/games/plinko/history every few seconds,
 *      sampled deterministically so we don't show every single drop.
 *
 * Auto mode: the user enables a checkbox; the page kicks off a drop,
 * waits ~1.5 s, then kicks off the next, until the user disables it or
 * the balance can no longer cover the stake.
 */

const DEFAULT_CONFIG: PlinkoConfig = {
  rows: 16,
  buckets: 17,
  risks: ['low', 'medium', 'high'],
  multipliers: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

/** Delay between drops in auto mode (ms). */
const AUTO_INTERVAL_MS = 700;

export default function PlinkoGamePage() {
  const { balance, fetchBalance } = useBalance();

  const [config, setConfig] = useState<PlinkoConfig>(DEFAULT_CONFIG);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [drops, setDrops] = useState<PlinkoDrop[]>([]);
  const [highlightedBucket, setHighlightedBucket] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<PlinkoDropResult | null>(null);

  /**
   * Pending results — keyed by drop id. We hold them in a ref (not in
   * state) until the ball animation reports `onBallLanded`. Only then do
   * we (a) reveal `lastResult`, (b) play SFX, (c) push to live feed.
   */
  const pendingByIdRef = useRef<Map<string, PlinkoDropResult>>(new Map());
  const dropCounterRef = useRef(0);

  const [history, setHistory] = useState<PlinkoHistoryEntry[]>([]);
  const [myWins, setMyWins] = useState<PlinkoMyWin[]>([]);

  // For auto mode lifecycle.
  const autoEnabledRef = useRef(false);
  const balanceRef = useRef(0);
  const amountRef = useRef(amount);
  const riskRef = useRef(risk);

  useEffect(() => {
    autoEnabledRef.current = autoEnabled;
  }, [autoEnabled]);
  useEffect(() => {
    balanceRef.current = balance?.amount ?? 0;
  }, [balance?.amount]);
  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);
  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);

  // Sound init.
  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Pull config + history on mount, then poll history every 5s for live feel.
  useEffect(() => {
    let alive = true;
    void fetchBalance();

    (async () => {
      try {
        const res = await fetch('/api/games/plinko/config', {
          credentials: 'include',
        });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json()) as PlinkoConfig;
          setConfig(json);
        }
      } catch {
        // keep the default config if backend is unreachable
      }
    })();

    const fetchHist = async () => {
      try {
        const res = await fetch('/api/games/plinko/history?limit=40', {
          credentials: 'include',
        });
        if (!alive || !res.ok) return;
        const json = (await res.json()) as { history: PlinkoHistoryEntry[] };
        setHistory(json.history ?? []);
      } catch {
        // ignore
      }
    };

    const fetchMine = async () => {
      try {
        const res = await fetch('/api/games/plinko/my-big-wins?limit=12', {
          credentials: 'include',
        });
        if (!alive || !res.ok) return;
        const json = (await res.json()) as { history: PlinkoMyWin[] };
        setMyWins(json.history ?? []);
      } catch {
        // ignore
      }
    };

    void fetchHist();
    void fetchMine();
    const id = setInterval(() => {
      void fetchHist();
      void fetchMine();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ actions */

  /**
   * Fire one drop. Resolves once the server replies (NOT once the ball
   * lands) — this keeps auto-mode pacing predictable and lets the
   * animation queue up multiple in-flight balls if requested.
   */
  async function dropBall() {
    if (amount <= 0) return;
    try {
      const res = await fetch('/api/games/plinko/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, risk }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Drop failed');

      const result = json.result as PlinkoDropResult;

      const id = `drop_${Date.now()}_${dropCounterRef.current++}`;
      pendingByIdRef.current.set(id, result);

      setDrops((prev) => [
        ...prev,
        { id, path: result.path, bucket: result.bucket },
      ]);

      soundManager.play('ui.click');
      // Refresh balance so the header pill reflects the post-drop figure
      // even if the WebSocket push got dropped.
      void fetchBalance();
    } catch (err) {
      console.error('plinko:drop', err);
      throw err;
    }
  }

  /** Manual single-shot drop (also serves as Auto Off → kick start). */
  async function handleManualDrop() {
    if (autoEnabled) {
      // The CTA doubles as "stop auto" while auto is running.
      setAutoEnabled(false);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await dropBall();
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------------------------------- auto mode loop */

  useEffect(() => {
    if (!autoEnabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled || !autoEnabledRef.current) return;
      // Stop if we don't have funds for the next bet.
      if (balanceRef.current < amountRef.current) {
        setAutoEnabled(false);
        return;
      }
      try {
        await dropBall();
      } catch {
        // Server rejected — bail out of auto so we don't spam errors.
        setAutoEnabled(false);
        return;
      }
      if (cancelled || !autoEnabledRef.current) return;
      timer = setTimeout(tick, AUTO_INTERVAL_MS);
    };

    // Start immediately, then keep going.
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled]);

  /* -------------------------------------------------- ball-landed event */

  /** Called by PlinkoBoard when a ball reaches its bucket. */
  function handleBallLanded(d: PlinkoDrop) {
    const result = pendingByIdRef.current.get(d.id);
    pendingByIdRef.current.delete(d.id);

    setHighlightedBucket(d.bucket);
    setTimeout(() => setHighlightedBucket(null), 600);

    // Now is the right moment to reveal the outcome to the rest of the
    // UI: the live last-multiplier pill and the SFX.
    if (result) {
      setLastResult(result);
    }

    // Drop the ball from the active list so memory stays bounded.
    setDrops((prev) => prev.filter((x) => x.id !== d.id));

    const m = config.multipliers[risk][d.bucket];
    if (m >= 5) soundManager.play('game.win');
    else if (m >= 1) soundManager.play('game.cashout');
    else soundManager.play('game.lose');
  }

  /* ----------------------------------------------------------- derived */

  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(balance?.amount ?? 10000)),
    [balance]
  );

  /** True when the user can afford the current stake. */
  const canAfford = (balance?.amount ?? 0) >= amount && amount >= minBet;

  const multipliers = config.multipliers[risk];

  /**
   * Sample the live feed — show only ~30% of recent drops + always keep
   * notable ones (≥5x payout). Sampling is deterministic per row id so
   * the UI doesn't flicker between renders.
   */
  const sampledHistory = useMemo(() => {
    return history.filter((row) => {
      if (row.multiplier >= 5) return true;
      // FNV-1a 32-bit hash for stable sampling.
      let h = 2166136261;
      for (let i = 0; i < row.id.length; i++) {
        h ^= row.id.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return ((h >>> 0) % 100) < 30;
    });
  }, [history]);

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-3 pb-28 flex flex-col gap-2">
        <GameTopBar
          title="Plinko"
          Icon={CircleDot}
          onHowToPlay={() => setRulesOpen(true)}
        />

        {/* Risk + last-multiplier strip */}
        <div className="flex items-center justify-between gap-2">
          <PlinkoRiskSelector
            value={risk}
            onChange={setRisk}
            disabled={busy || autoEnabled || drops.length > 0}
          />
          {lastResult && (
            <span
              className="font-roobert text-[12px] tabular-nums px-3 py-1 rounded-pill border border-white/15 bg-white/[0.04] backdrop-blur-md"
              style={{
                color:
                  lastResult.multiplier >= 1 ? '#ffffff' : 'rgba(255,138,118,0.85)',
              }}
            >
              x{lastResult.multiplier.toFixed(2)}
            </span>
          )}
        </div>

        {/* Board — sized so pyramid + CTA fit on a single phone viewport */}
        <div className="relative rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
          <div className="aspect-[4/3] sm:aspect-[5/3]">
            <PlinkoBoard
              rows={config.rows}
              drops={drops}
              onBallLanded={handleBallLanded}
              highlightedBucket={highlightedBucket}
            />
          </div>

          {/* Bucket multipliers sit just under the board, aligned with columns */}
          <div className="px-1.5 pb-1.5 -mt-0.5">
            <PlinkoMultiplierStrip
              multipliers={multipliers}
              highlightedBucket={highlightedBucket}
            />
          </div>
        </div>

        {/* Bet panel */}
        <PlinkoBetPanel
          amount={amount}
          onAmountChange={setAmount}
          minBet={minBet}
          maxBet={maxBet}
          busy={busy}
          autoEnabled={autoEnabled}
          onAutoToggle={setAutoEnabled}
          onPrimary={handleManualDrop}
          canAfford={canAfford}
        />

        {/* Player's personal big-wins highlight reel (>=5x) */}
        <PlinkoMyWins wins={myWins} />

        {/* History */}
        <PlinkoHistory entries={sampledHistory} />
      </div>

      <PlinkoRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
