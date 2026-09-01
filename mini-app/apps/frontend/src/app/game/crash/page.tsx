'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Rocket } from 'lucide-react';

import { GameTopBar } from '@/components/game/game-top-bar';
import { CrashHistoryStrip } from '@/components/game/crash/crash-history-strip';
import { CrashStage } from '@/components/game/crash/crash-stage';
import {
  CrashBetPanel,
  type BetSlotPhase,
} from '@/components/game/crash/crash-bet-panel';
import { CrashStatsBar } from '@/components/game/crash/crash-stats-bar';
import { CrashPlayerFeed } from '@/components/game/crash/crash-player-feed';
import { CrashRulesModal } from '@/components/game/crash/crash-rules-modal';

import { useBalance } from '@/hooks/use-balance';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { useCrashLive } from '@/hooks/use-crash-live';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { haptics } from '@/lib/haptics';

/**
 * Crash Game Page — Live Multiplayer
 *
 * Full-bleed dark canvas with deep ocean gradient atmospherics. The page is a
 * thin orchestrator: it subscribes to a single live WebSocket stream
 * (`useCrashLive`) and routes that snapshot through composable section
 * components.
 *
 * Per-slot UI state is derived in two layers:
 *   1. Local: the user's two slots have an "intent" — idle, queued,
 *      cashable — driven by the bet flow on this client.
 *   2. Server: when an authoritative server event arrives (placed,
 *      cancelled, cashed_out, lost) we sync the slot state.
 */

interface SlotConfig {
  amount: number;
  autoCashoutEnabled: boolean;
  autoCashoutMultiplier: number;
}

interface SlotRuntime {
  phase: BetSlotPhase;
  busy: boolean;
}

const DEFAULT_SLOT: SlotConfig = {
  amount: 0,
  autoCashoutEnabled: true,
  autoCashoutMultiplier: 2.0,
};

export default function CrashGamePage() {
  const { fetchBalance } = useBalance();
  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    isTournament,
    currencyLabel,
  } = useActiveBalance('crash');
  const { snapshot, stream, userId } = useCrashLive();

  const [slots, setSlots] = useState<[SlotConfig, SlotConfig]>([
    { ...DEFAULT_SLOT },
    { ...DEFAULT_SLOT },
  ]);
  const [runtime, setRuntime] = useState<[SlotRuntime, SlotRuntime]>([
    { phase: 'idle', busy: false },
    { phase: 'idle', busy: false },
  ]);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Sound manager warm-up.
  useEffect(() => {
    soundManager.initialize();
  }, []);

  /* -------------------------------------------------------- slot state ----
   * Re-derive each slot's UI phase from the authoritative server snapshot.
   * If the server says a slot has an active bet for current user → 'queued'
   * during waiting, 'locked' during countdown, 'cashable' once active,
   * finished_won / finished_lost once the round resolves.
   */
  useEffect(() => {
    if (!userId) return;

    setRuntime((prev) => {
      const out: [SlotRuntime, SlotRuntime] = [prev[0], prev[1]];
      for (const slot of [0, 1] as const) {
        const live = snapshot.players.find(
          (p) => p.userId === userId && p.slot === slot
        );

        if (!live) {
          // No active bet for this slot on the server → idle.
          if (out[slot].phase !== 'idle') {
            out[slot] = { phase: 'idle', busy: false };
          }
          continue;
        }

        let phase: BetSlotPhase = out[slot].phase;
        if (live.status === 'cashed') phase = 'finished_won';
        else if (live.status === 'lost') phase = 'finished_lost';
        else if (snapshot.phase === 'active') phase = 'cashable';
        else if (snapshot.phase === 'starting') phase = 'locked';
        else phase = 'queued';

        if (phase !== out[slot].phase || out[slot].busy) {
          out[slot] = { phase, busy: false };
        }
      }
      return out;
    });
  }, [snapshot.phase, snapshot.players, userId]);

  // Reset finished slot to idle when a brand-new round opens betting again.
  useEffect(() => {
    if (snapshot.phase === 'waiting') {
      setRuntime((prev) => {
        const map = (r: SlotRuntime): SlotRuntime =>
          r.phase === 'finished_won' || r.phase === 'finished_lost'
            ? { phase: 'idle', busy: false }
            : r;
        return [map(prev[0]), map(prev[1])];
      });
    }
  }, [snapshot.phase]);

  // Play short cues for round transitions.
  const prevPhaseRef = useRef(snapshot.phase);
  useEffect(() => {
    if (prevPhaseRef.current !== snapshot.phase) {
      if (snapshot.phase === 'active') soundManager.play('game.bet_placed');
      if (snapshot.phase === 'completed') soundManager.play('game.lose');
      prevPhaseRef.current = snapshot.phase;
    }
  }, [snapshot.phase]);

  /* ------------------------------------------------------------ actions */

  async function placeSlotBet(slot: 0 | 1) {
    const cfg = slots[slot];
    if (cfg.amount <= 0) {
      toast.warn('Введите сумму ставки');
      return;
    }
    // Pre-flight balance check — stops the round-trip when we already
    // know it'll fail. Server still rechecks atomically.
    if (!isBalanceReady) {
      toast.warn('Баланс ещё загружается');
      return;
    }
    const have = activeBalance;
    if (cfg.amount > have) {
      toast.warn(
        `Недостаточно средств — у вас ${have.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currencyLabel}`
      );
      return;
    }

    haptics.impact('medium');
    setRuntime((prev) => {
      const out = [...prev] as [SlotRuntime, SlotRuntime];
      out[slot] = { phase: 'queued', busy: true };
      return out;
    });

    try {
      const res = await fetch('/api/games/crash/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slot,
          amount: cfg.amount,
          autoCashout: cfg.autoCashoutEnabled
            ? cfg.autoCashoutMultiplier
            : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        reportApiError(res, data, 'Не удалось сделать ставку');
        throw new Error(data.message || 'Failed to place bet');
      }
      soundManager.play('ui.click');
    } catch (err) {
      console.error('Bet failed:', err);
      setRuntime((prev) => {
        const out = [...prev] as [SlotRuntime, SlotRuntime];
        out[slot] = { phase: 'idle', busy: false };
        return out;
      });
    }
  }

  async function cancelSlot(slot: 0 | 1) {
    haptics.impact('light');
    setRuntime((prev) => {
      const out = [...prev] as [SlotRuntime, SlotRuntime];
      out[slot] = { ...out[slot], busy: true };
      return out;
    });

    try {
      const res = await fetch('/api/games/crash/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        reportApiError(res, data, 'Не удалось отменить ставку');
        throw new Error(data.message || 'Cancel failed');
      }
      soundManager.play('ui.click');
    } catch (err) {
      console.error('Cancel failed:', err);
      setRuntime((prev) => {
        const out = [...prev] as [SlotRuntime, SlotRuntime];
        out[slot] = { ...out[slot], busy: false };
        return out;
      });
    }
  }

  async function cashoutSlot(slot: 0 | 1) {
    haptics.impact('heavy');
    setRuntime((prev) => {
      const out = [...prev] as [SlotRuntime, SlotRuntime];
      out[slot] = { ...out[slot], busy: true };
      return out;
    });

    try {
      const res = await fetch('/api/games/crash/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slot }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        reportApiError(res, data, 'Не удалось забрать выигрыш');
        throw new Error(data.message || 'Cashout failed');
      }
      soundManager.play('game.cashout');
      haptics.notification('success');
      toast.cashout(snapshot.serverMultiplier, 'Выигрыш забран');
    } catch (err) {
      console.error('Cashout failed:', err);
      setRuntime((prev) => {
        const out = [...prev] as [SlotRuntime, SlotRuntime];
        out[slot] = { ...out[slot], busy: false };
        return out;
      });
    }
  }

  function handlePrimary(slot: 0 | 1) {
    const phase = runtime[slot].phase;
    if (phase === 'idle') return placeSlotBet(slot);
    if (phase === 'queued' || phase === 'locked') return cancelSlot(slot);
    if (phase === 'cashable') return cashoutSlot(slot);
  }

  /* ----------------------------------------------------------- derived */



  const minBet = 1;
  const maxBet = useMemo(
    () => Math.max(minBet, Math.floor(activeBalance)),
    [activeBalance]
  );

  const bettingClosed = snapshot.phase === 'starting' || snapshot.phase === 'active' || snapshot.phase === 'completed' || snapshot.phase === 'resolving';

  const cashouts = useMemo(
    () =>
      snapshot.players
        .filter((p) => p.status === 'cashed' && typeof p.multiplier === 'number')
        .map((p) => ({ key: p.key, multiplier: p.multiplier as number })),
    [snapshot.players]
  );

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        <GameTopBar
          title="MacvJet"
          Icon={Rocket}
          iconRotate={-30}
          onHowToPlay={() => setRulesOpen(true)}
        />

        <CrashHistoryStrip history={snapshot.history} />

        <CrashStage
          stream={stream}
          phase={snapshot.phase}
          countdown={snapshot.countdown}
          waitingEndsAt={snapshot.waitingEndsAt}
          serverSeedHash={snapshot.serverSeedHash}
          latencyMs={snapshot.latencyMs}
          connected={snapshot.connected}
          lastCrashPoint={snapshot.lastCrashPoint}
          cashouts={cashouts}
        />

        <div className="flex flex-col gap-2.5">
          {([0, 1] as const).map((slot) => (
            <CrashBetPanel
              key={slot}
              amount={slots[slot].amount}
              onAmountChange={(v) =>
                setSlots((prev) => {
                  const out = [...prev] as [SlotConfig, SlotConfig];
                  out[slot] = { ...out[slot], amount: v };
                  return out;
                })
              }
              autoCashoutEnabled={slots[slot].autoCashoutEnabled}
              onAutoCashoutToggle={(v) =>
                setSlots((prev) => {
                  const out = [...prev] as [SlotConfig, SlotConfig];
                  out[slot] = { ...out[slot], autoCashoutEnabled: v };
                  return out;
                })
              }
              autoCashoutMultiplier={slots[slot].autoCashoutMultiplier}
              onAutoCashoutChange={(v) =>
                setSlots((prev) => {
                  const out = [...prev] as [SlotConfig, SlotConfig];
                  out[slot] = { ...out[slot], autoCashoutMultiplier: v };
                  return out;
                })
              }
              slotPhase={runtime[slot].phase}
              multiplier={snapshot.serverMultiplier}
              bettingClosed={bettingClosed}
              minBet={minBet}
              maxBet={maxBet}
              onPrimary={() => handlePrimary(slot)}
              busy={runtime[slot].busy}
            />
          ))}
        </div>

        <CrashStatsBar
          playerCount={snapshot.stats.playerCount}
          totalBets={snapshot.stats.totalWagered}
        />

        <CrashPlayerFeed players={snapshot.players} currentUserId={userId} />
      </div>

      <CrashRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
