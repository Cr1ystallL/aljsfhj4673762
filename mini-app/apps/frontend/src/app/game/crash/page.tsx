'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CrashTopBar } from '@/components/game/crash/crash-top-bar';
import { CrashHistoryStrip } from '@/components/game/crash/crash-history-strip';
import { CrashStage } from '@/components/game/crash/crash-stage';
import { CrashBetPanel, type BetSlotPhase } from '@/components/game/crash/crash-bet-panel';
import { CrashStatsBar } from '@/components/game/crash/crash-stats-bar';
import {
  CrashPlayerFeed,
  type CrashPlayerEntry,
} from '@/components/game/crash/crash-player-feed';

import { useBalance } from '@/hooks/use-balance';
import { useDemoMode } from '@/store/demo-mode-store';
import { CrashGameClient } from '@/lib/games/crash/crash-client';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Crash Game Page — Monopo Saigon Theme
 *
 * Full-bleed dark canvas with deep ocean gradient atmospherics provided
 * by the global animated background. Page composes:
 *   - Top bar (title, support pills)
 *   - Recent multipliers strip
 *   - Atmospheric stage (countdown / multiplier / curve)
 *   - Two parallel bet slots
 *   - Round stats tiles
 *   - Live player feed
 *
 * Tokens come from globals.css and tailwind.config.ts (frost white,
 * midnight canvas, whisper gray, pill radius, frosted glass surfaces).
 */

type Phase = 'waiting' | 'countdown' | 'active' | 'crashed';

interface BetSlotState {
  amount: number;
  autoCashoutEnabled: boolean;
  autoCashoutMultiplier: number;
  phase: BetSlotPhase;
}

const INITIAL_SLOT: BetSlotState = {
  amount: 0,
  autoCashoutEnabled: true,
  autoCashoutMultiplier: 2.0,
  phase: 'idle',
};

export default function CrashGamePage() {
  const { balance } = useBalance();
  const { isDemoMode, toggleDemoMode, setActiveBet } = useDemoMode();

  const [client] = useState(() => new CrashGameClient('crash_main'));

  const [phase, setPhase] = useState<Phase>('waiting');
  const [multiplier, setMultiplier] = useState(1.0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [graphPoints, setGraphPoints] = useState<
    Array<{ time: number; multiplier: number }>
  >([]);
  const [history, setHistory] = useState<Array<{ crashPoint: number }>>([
    { crashPoint: 1.24 },
    { crashPoint: 1.48 },
    { crashPoint: 2.72 },
    { crashPoint: 3.78 },
    { crashPoint: 9.76 },
    { crashPoint: 1.08 },
    { crashPoint: 7.73 },
  ]);

  const [slotA, setSlotA] = useState<BetSlotState>(INITIAL_SLOT);
  const [slotB, setSlotB] = useState<BetSlotState>(INITIAL_SLOT);

  const [playerCount, setPlayerCount] = useState(32);
  const [totalBets, setTotalBets] = useState(2524.88);
  const [feed] = useState<CrashPlayerEntry[]>([
    {
      id: 'p1',
      name: 'pazikgara',
      avatarColor: 'bg-[#a05cd6]',
      amount: 435,
      status: 'active',
    },
    {
      id: 'p2',
      name: 'Андрей Шад…',
      avatarColor: 'bg-white/10',
      amount: 350,
      status: 'active',
    },
    {
      id: 'p3',
      name: 'Мухаммад А…',
      avatarColor: 'bg-white/10',
      amount: 350,
      status: 'active',
    },
  ]);

  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise sound manager once
  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Wire up the game client lifecycle
  useEffect(() => {
    client.on('phase:waiting', () => {
      setPhase('waiting');
      setSlotA((s) => (s.phase === 'finished' ? { ...INITIAL_SLOT, amount: s.amount, autoCashoutEnabled: s.autoCashoutEnabled, autoCashoutMultiplier: s.autoCashoutMultiplier } : s));
      setSlotB((s) => (s.phase === 'finished' ? { ...INITIAL_SLOT, amount: s.amount, autoCashoutEnabled: s.autoCashoutEnabled, autoCashoutMultiplier: s.autoCashoutMultiplier } : s));
      setActiveBet(false);
    });

    client.on('phase:countdown', (data: { duration: number }) => {
      setPhase('countdown');
      setCountdown(Math.ceil(data.duration / 1000));

      if (countdownInterval.current) clearInterval(countdownInterval.current);
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
              countdownInterval.current = null;
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    });

    client.on('phase:active', () => {
      setPhase('active');
      setCountdown(null);
      setSlotA((s) => (s.phase === 'queued' ? { ...s, phase: 'cashable' } : s));
      setSlotB((s) => (s.phase === 'queued' ? { ...s, phase: 'cashable' } : s));
      soundManager.play('game.bet_placed');
    });

    client.on('display:update', (data: { multiplier: number; graphPoints: Array<{ time: number; multiplier: number }> }) => {
      setMultiplier(data.multiplier);
      setGraphPoints(data.graphPoints);
    });

    client.on('game:crashed', (data: { crashPoint: number }) => {
      setPhase('crashed');
      setMultiplier(data.crashPoint);
      setSlotA((s) => (s.phase === 'cashable' ? { ...s, phase: 'finished' } : s));
      setSlotB((s) => (s.phase === 'cashable' ? { ...s, phase: 'finished' } : s));
      soundManager.play('game.lose');
    });

    client.on('round:completed', (data: { crashPoint: number }) => {
      setHistory((prev) => [{ crashPoint: data.crashPoint }, ...prev].slice(0, 50));
    });

    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      client.removeAllListeners();
      client.destroy();
    };
  }, [client, setActiveBet]);

  const placeBetForSlot = async (
    slot: BetSlotState,
    setSlot: (next: BetSlotState | ((prev: BetSlotState) => BetSlotState)) => void
  ) => {
    if (slot.amount <= 0) return;

    setSlot((prev) => ({ ...prev, phase: 'queued' }));
    setActiveBet(true);

    try {
      const response = await fetch('/api/games/crash/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: slot.amount,
          demoMode: isDemoMode,
          autoCashout: slot.autoCashoutEnabled ? slot.autoCashoutMultiplier : null,
        }),
      });

      if (!response.ok) throw new Error('Failed to place bet');
      soundManager.play('ui.click');
    } catch (err) {
      console.error('Bet failed:', err);
      setSlot((prev) => ({ ...prev, phase: 'idle' }));
      setActiveBet(false);
    }
  };

  const cashoutSlot = async (
    setSlot: (next: BetSlotState | ((prev: BetSlotState) => BetSlotState)) => void
  ) => {
    try {
      const response = await fetch('/api/games/crash/cashout', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to cashout');
      client.emit('cashout:requested', {});
      setSlot((prev) => ({ ...prev, phase: 'finished' }));
      soundManager.play('game.cashout');
    } catch (err) {
      console.error('Cashout failed:', err);
    }
  };

  const handleSlotPrimary = (
    slot: BetSlotState,
    setSlot: (next: BetSlotState | ((prev: BetSlotState) => BetSlotState)) => void
  ) => {
    if (slot.phase === 'idle') {
      placeBetForSlot(slot, setSlot);
      return;
    }
    if (slot.phase === 'queued') {
      // Cancel a queued bet
      setSlot((prev) => ({ ...prev, phase: 'idle' }));
      setActiveBet(false);
      return;
    }
    if (slot.phase === 'cashable') {
      cashoutSlot(setSlot);
    }
  };

  const minBet = 1;
  const maxBet = useMemo(() => Math.max(minBet, Math.floor(balance?.amount ?? 10000)), [balance]);

  const slotADisabled = phase === 'crashed';
  const slotBDisabled = phase === 'crashed';

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-3.5">
        {/* Top bar */}
        <CrashTopBar
          isDemoMode={isDemoMode}
          onToggleDemoMode={() => toggleDemoMode()}
        />

        {/* History */}
        <CrashHistoryStrip history={history} />

        {/* Stage */}
        <CrashStage
          phase={phase}
          multiplier={multiplier}
          countdown={countdown}
          graphPoints={graphPoints}
        />

        {/* Bet slots */}
        <div className="flex flex-col gap-2.5">
          <CrashBetPanel
            amount={slotA.amount}
            onAmountChange={(v) => setSlotA((s) => ({ ...s, amount: v }))}
            autoCashoutEnabled={slotA.autoCashoutEnabled}
            onAutoCashoutToggle={(v) =>
              setSlotA((s) => ({ ...s, autoCashoutEnabled: v }))
            }
            autoCashoutMultiplier={slotA.autoCashoutMultiplier}
            onAutoCashoutChange={(v) =>
              setSlotA((s) => ({ ...s, autoCashoutMultiplier: v }))
            }
            phase={slotA.phase}
            multiplier={multiplier}
            minBet={minBet}
            maxBet={maxBet}
            onPrimary={() => handleSlotPrimary(slotA, setSlotA)}
            disabled={slotADisabled}
          />

          <CrashBetPanel
            amount={slotB.amount}
            onAmountChange={(v) => setSlotB((s) => ({ ...s, amount: v }))}
            autoCashoutEnabled={slotB.autoCashoutEnabled}
            onAutoCashoutToggle={(v) =>
              setSlotB((s) => ({ ...s, autoCashoutEnabled: v }))
            }
            autoCashoutMultiplier={slotB.autoCashoutMultiplier}
            onAutoCashoutChange={(v) =>
              setSlotB((s) => ({ ...s, autoCashoutMultiplier: v }))
            }
            phase={slotB.phase}
            multiplier={multiplier}
            minBet={minBet}
            maxBet={maxBet}
            onPrimary={() => handleSlotPrimary(slotB, setSlotB)}
            disabled={slotBDisabled}
          />
        </div>

        {/* Stats */}
        <CrashStatsBar playerCount={playerCount} totalBets={totalBets} />

        {/* Player feed */}
        <CrashPlayerFeed entries={feed} />
      </div>
    </main>
  );
}
