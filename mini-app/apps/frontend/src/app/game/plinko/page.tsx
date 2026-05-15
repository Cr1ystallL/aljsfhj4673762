'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot } from 'lucide-react';

import { GameTopBar } from '@/components/game/game-top-bar';
import { PlinkoBoard, type PlinkoDrop } from '@/components/game/plinko/plinko-board';
import { PlinkoMultiplierStrip } from '@/components/game/plinko/plinko-multiplier-strip';
import { PlinkoRiskSelector } from '@/components/game/plinko/plinko-risk-selector';
import { PlinkoBetPanel } from '@/components/game/plinko/plinko-bet-panel';
import { PlinkoHistory } from '@/components/game/plinko/plinko-history';
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
 *      by the server, then flashes the winning bucket pill.
 *   3. Live ticker pulls /api/games/plinko/history every few seconds.
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

export default function PlinkoGamePage() {
  const { balance, fetchBalance } = useBalance();

  const [config, setConfig] = useState<PlinkoConfig>(DEFAULT_CONFIG);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [drops, setDrops] = useState<PlinkoDrop[]>([]);
  const [highlightedBucket, setHighlightedBucket] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<PlinkoDropResult | null>(null);

  const [history, setHistory] = useState<PlinkoHistoryEntry[]>([]);

  const dropCounterRef = useRef(0);

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
        const res = await fetch('/api/games/plinko/history?limit=20', {
          credentials: 'include',
        });
        if (!alive || !res.ok) return;
        const json = (await res.json()) as { history: PlinkoHistoryEntry[] };
        setHistory(json.history ?? []);
      } catch {
        // ignore
      }
    };

    void fetchHist();
    const id = setInterval(fetchHist, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ actions */

  async function dropBall() {
    if (busy) return;
    if (amount <= 0) return;
    setBusy(true);
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
      setLastResult(result);

      const id = `drop_${Date.now()}_${dropCounterRef.current++}`;
      setDrops((prev) => [
        ...prev,
        { id, path: result.path, bucket: result.bucket },
      ]);

      soundManager.play('ui.click');
      // Refresh balance immediately so the header pill reflects the
      // post-drop figure even if the WebSocket push got dropped.
      void fetchBalance();
    } catch (err) {
      console.error('plinko:drop', err);
    } finally {
      // Keep the button responsive. Server is fast enough that we don't
      // need to lock until the animation finishes.
      setBusy(false);
    }
  }

  /** Called by PlinkoBoard when a ball reaches its bucket. */
  function handleBallLanded(d: PlinkoDrop) {
    setHighlightedBucket(d.bucket);
    setTimeout(() => setHighlightedBucket(null), 600);
    // Drop the ball from the active list so memory stays bounded.
    setDrops((prev) => prev.filter((x) => x.id !== d.id));

    // Outcome SFX based on multiplier of the matching result.
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

  const multipliers = config.multipliers[risk];

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar
          title="Plinko"
          Icon={CircleDot}
          onHowToPlay={() => setRulesOpen(true)}
        />

        {/* Risk + last-multiplier strip */}
        <div className="flex items-center justify-between gap-2">
          <PlinkoRiskSelector value={risk} onChange={setRisk} disabled={busy} />
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

        {/* Board */}
        <div className="relative rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
          <div className="aspect-[3/3.4] sm:aspect-[3/3]">
            <PlinkoBoard
              rows={config.rows}
              drops={drops}
              onBallLanded={handleBallLanded}
              highlightedBucket={highlightedBucket}
            />
          </div>

          {/* Bucket multipliers sit just under the board, aligned with columns */}
          <div className="px-2 pb-2 -mt-1">
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
          onPrimary={dropBall}
        />

        {/* History */}
        <PlinkoHistory entries={history} />
      </div>

      <PlinkoRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
