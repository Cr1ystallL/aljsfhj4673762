'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bomb, ShieldCheck, Copy, Check, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { GameTopBar } from '@/components/game/game-top-bar';
import { ProvablyFairModal } from '@/components/game/provably-fair-modal';
import { MinesGrid } from '@/components/game/mines/mines-grid';
import {
  MinesBetPanel,
  type MinesPhase,
} from '@/components/game/mines/mines-bet-panel';
import { MinesRulesModal } from '@/components/game/mines/mines-rules-modal';
import {
  MinesRecentBets,
  type MinesRecentBet,
} from '@/components/game/mines/mines-recent-bets';
import {
  MinesHistory,
  type MinesHistoryEntry,
} from '@/components/game/mines/mines-history';
import { useBalance } from '@/hooks/use-balance';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';

/**
 * Mines Game Page — Monopo Saigon Theme
 *
 * Single-player REST game: place a stake, choose a mine count (1–24),
 * reveal safe cells, cash out at any time. State lives on the server —
 * we mirror the authoritative `MinesPublicState` and rerender on each
 * call.
 *
 * On mount we re-fetch any active round so a refresh resumes the
 * session instead of forfeiting the stake.
 */

interface ServerState {
  roundId: string;
  mineCount: number;
  betAmount: number;
  revealed: number[];
  currentMultiplier: number;
  nextMultiplier: number;
  serverSeedHash: string;
  state: 'active' | 'cashed' | 'busted';
  serverSeed?: string;
  minePositions?: number[];
  finalMultiplier?: number;
  finalPayout?: number;
}

export default function MinesGamePage() {
  const { fetchBalance } = useBalance();
  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    isTournament,
    currencyLabel,
  } = useActiveBalance('mines');

  const [server, setServer] = useState<ServerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pfModalOpen, setPfModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Local config (used while no round is live).
  const [amount, setAmount] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  /** The cell that ended the round, derived from server state. */
  const [hitPosition, setHitPosition] = useState<number | null>(null);

  /** Player's last 5 completed bets — drives the horizontal recap strip. */
  const [recentBets, setRecentBets] = useState<MinesRecentBet[]>([]);
  /** Sampled live ticker — recent bets across all players. */
  const [history, setHistory] = useState<MinesHistoryEntry[]>([]);

  // Sound init.
  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Load the player's recent history once on mount and again whenever a
  // round wraps (handled inside applyServer below).
  const refreshHistory = async () => {
    try {
      const [my, all] = await Promise.all([
        fetch('/api/games/mines/my-history?limit=5', {
          credentials: 'include',
        }).then((r) => (r.ok ? r.json() : { history: [] })),
        fetch('/api/games/mines/history?limit=20', {
          credentials: 'include',
        }).then((r) => (r.ok ? r.json() : { history: [] })),
      ]);
      setRecentBets(my.history ?? []);
      setHistory(all.history ?? []);
    } catch {
      // best-effort
    }
  };

  // Resume any active round on mount + refresh the balance so the page
  // never shows a stale figure if the WebSocket push was missed.
  useEffect(() => {
    let cancelled = false;
    void fetchBalance();
    void refreshHistory();
    (async () => {
      try {
        const res = await fetch('/api/games/mines/state', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        const s: ServerState | null = json?.state ?? null;
        if (!cancelled && s) applyServer(s);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the global history every 8s so the live ticker stays warm.
  useEffect(() => {
    const id = setInterval(() => {
      void refreshHistory();
    }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyServer(next: ServerState, knownHit?: number) {
    setServer(next);

    if (next.state === 'busted' && next.minePositions) {
      if (
        typeof knownHit === 'number' &&
        next.minePositions.includes(knownHit)
      ) {
        // The caller knew which cell ended the round (e.g. the reveal
        // handler). Use that for an exact highlight.
        setHitPosition(knownHit);
      } else {
        // Server doesn't tag the hit cell explicitly, so we fall back to
        // the first mine that wasn't otherwise revealed. With one bust
        // per round this is functionally identical.
        const candidate = next.minePositions.find(
          (p) => !next.revealed.includes(p)
        );
        setHitPosition(typeof candidate === 'number' ? candidate : null);
      }
    } else {
      setHitPosition(null);
    }

    if (next.state === 'cashed') soundManager.play('game.cashout');
    if (next.state === 'busted') soundManager.play('game.lose');

    // Whenever the authoritative state changes — round started (stake
    // debited), busted (stake forfeit), or cashed (winnings credited) —
    // pull a fresh balance. This keeps the header pill in sync even if
    // the WebSocket broadcast was dropped.
    void fetchBalance();
    // Round just resolved → refresh the history strips.
    if (next.state === 'cashed' || next.state === 'busted') {
      void refreshHistory();
    }
  }

  /* ------------------------------------------------------------ actions */

  async function startRound() {
    if (busy) return;
    if (amount <= 0) {
      toast.warn('Введите сумму ставки');
      return;
    }
    if (!isBalanceReady) {
      toast.warn('Баланс ещё загружается');
      return;
    }
    const have = activeBalance;
    if (amount > have) {
      toast.warn(
        `Недостаточно средств — у вас ${have.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currencyLabel}`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/games/mines/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, mineCount }),
      });
      const json = await res.json();
      if (!res.ok) {
        reportApiError(res, json, 'Could not start round');
        throw new Error(json?.message ?? 'Could not start round');
      }
      applyServer(json.state as ServerState);
      soundManager.play('ui.click');
    } catch (err) {
      console.error('mines:start', err);
    } finally {
      setBusy(false);
    }
  }

  async function reveal(position: number) {
    if (busy) return;
    if (server?.state !== 'active') return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/mines/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ position }),
      });
      const json = await res.json();
      if (!res.ok) {
        reportApiError(res, json, 'Could not reveal cell');
        throw new Error(json?.message ?? 'Reveal failed');
      }
      const next = json.state as ServerState;
      applyServer(next, position);
      if (next.state === 'active') soundManager.play('ui.click');
    } catch (err) {
      console.error('mines:reveal', err);
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (busy) return;
    if (server?.state !== 'active') return;
    if (server.revealed.length === 0) {
      toast.warn('Сначала откройте хотя бы одну ячейку');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/games/mines/cashout', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        reportApiError(res, json, 'Could not cash out');
        throw new Error(json?.message ?? 'Cashout failed');
      }
      const next = json.state as ServerState;
      applyServer(next);
      toast.cashout(next.currentMultiplier ?? 0, 'Cashed out');
    } catch (err) {
      console.error('mines:cashout', err);
    } finally {
      setBusy(false);
    }
  }

  async function newRound() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/games/mines/dismiss', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // best-effort
    }
    setServer(null);
    setHitPosition(null);
    setBusy(false);
  }

  function handlePrimary() {
    if (!server || server.state === 'cashed' || server.state === 'busted') {
      if (server) {
        void newRound();
      } else {
        void startRound();
      }
      return;
    }
    if (server.state === 'active') {
      void cashout();
    }
  }

  /* ----------------------------------------------------------- derived */

  const phase: MinesPhase = !server
    ? 'idle'
    : server.state === 'active'
    ? 'active'
    : server.state;



  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(activeBalance)),
    [activeBalance]
  );

  const displayMineCount = server?.mineCount ?? mineCount;
  const displayAmount = server?.betAmount ?? amount;
  const revealedCount = server?.revealed.length ?? 0;
  const safeRevealed = phase === 'active' ? revealedCount : 0;

  const currentMult = server?.currentMultiplier ?? 1;
  const nextMult = server?.nextMultiplier ?? 1;
  const canCashout = phase === 'active' && revealedCount > 0;

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar
          title="Mines"
          Icon={Bomb}
          onHowToPlay={() => setRulesOpen(true)}
        />

        {/* Status strip — current and next multiplier preview */}
        <div className="relative rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-3 grid grid-cols-3 gap-3 items-center overflow-hidden">
          {/* Soft brand-coloured wash that strengthens as the round progresses */}
          {phase === 'active' && (
            <div
              aria-hidden
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, rgba(160, 224, 171, 0.10) 0%, rgba(255, 172, 46, 0.08) 55%, rgba(165, 45, 37, 0.06) 100%)',
              }}
            />
          )}
          <div className="relative">
            <Stat
              label="Revealed"
              value={`${safeRevealed} / ${25 - displayMineCount}`}
            />
          </div>
          <div className="relative">
            <Stat
              label="Current"
              value={`x${currentMult.toFixed(2)}`}
              emphasis
            />
          </div>
          <div className="relative">
            <Stat label="Next" value={`x${nextMult.toFixed(2)}`} muted />
          </div>
        </div>

        {/* Grid */}
        <MinesGrid
          revealed={server?.revealed ?? []}
          minePositions={
            phase === 'busted' || phase === 'cashed'
              ? server?.minePositions
              : undefined
          }
          hitPosition={hitPosition}
          disabled={phase !== 'active' || busy}
          onCellClick={reveal}
        />

        {/* Bet controls */}
        <MinesBetPanel
          amount={displayAmount}
          onAmountChange={setAmount}
          mineCount={displayMineCount}
          onMineCountChange={setMineCount}
          phase={phase}
          currentMultiplier={currentMult}
          busy={busy}
          minBet={minBet}
          maxBet={maxBet}
          canCashout={canCashout}
          onPrimary={handlePrimary}
        />

        {/* Player's last 5 completed rounds */}
        <MinesRecentBets bets={recentBets} />

        {/* Provably-fair seed strip & verification */}
        {server?.serverSeedHash && (
          <div className="rounded-card border border-emerald-500/30 bg-emerald-950/15 backdrop-blur-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-bold font-roobert">
                <ShieldCheck size={13} className="text-emerald-400" />
                Provably Fair
              </span>
              <button
                type="button"
                onClick={() => setPfModalOpen(true)}
                className="text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Подробнее</span>
                <ExternalLink size={11} />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/50 border border-white/5 font-mono text-[11px]">
                <span className="text-white/40 text-[10px] select-none">SHA-256:</span>
                <span className="text-emerald-300 truncate flex-1 font-bold">
                  {server.serverSeedHash}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(server.serverSeedHash);
                    setCopiedKey('ssh');
                    setTimeout(() => setCopiedKey(null), 2000);
                  }}
                  className="p-1 text-white/60 hover:text-white transition-colors"
                  title="Скопировать SHA-256 хэш"
                >
                  {copiedKey === 'ssh' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>

              {server.serverSeed && (
                <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/50 border border-white/5 font-mono text-[11px]">
                  <span className="text-white/40 text-[10px] select-none">Seed:</span>
                  <span className="text-amber-200 truncate flex-1">
                    {server.serverSeed}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(server.serverSeed!);
                      setCopiedKey('ss');
                      setTimeout(() => setCopiedKey(null), 2000);
                    }}
                    className="p-1 text-white/60 hover:text-white transition-colors"
                    title="Скопировать открытый Server Seed"
                  >
                    {copiedKey === 'ss' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live ticker — recent mines bets across all players */}
        <MinesHistory entries={history} />
      </div>

      <MinesRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ProvablyFairModal
        roundId={server?.roundId || null}
        open={pfModalOpen}
        onOpenChange={setPfModalOpen}
      />
    </main>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[9px] uppercase tracking-[0.2em] text-whisper-gray font-roobert">
        {label}
      </span>
      <span
        className={
          'mt-0.5 font-roobert tabular-nums ' +
          (emphasis
            ? 'text-frost-white text-[20px] font-light'
            : muted
            ? 'text-whisper-gray text-[15px] font-light'
            : 'text-frost-white text-[15px] font-light')
        }
      >
        {value}
      </span>
    </div>
  );
}
