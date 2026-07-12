'use client';

import { useEffect, useState } from 'react';
import { GameTopBar } from '@/components/game/game-top-bar';
import { ChickenRoadBetPanel, type ChickenRoadLevel } from '@/components/game/chicken-road/chicken-road-bet-panel';
import { ChickenRoadBoard } from '@/components/game/chicken-road/chicken-road-board';
import { MinesHistory, type MinesHistoryEntry } from '@/components/game/mines/mines-history';
import { MinesRecentBets } from '@/components/game/mines/mines-recent-bets';
import { useBalance } from '@/hooks/use-balance';
import { useBalanceStore } from '@/store/balance-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';

interface ServerState {
  roundId: string;
  level: ChickenRoadLevel;
  betAmount: number;
  lanesCount: number;
  currentLane: number;
  crashLane: number | null;
  currentMultiplier: number;
  nextMultiplier: number;
  ladder: number[];
  state: 'active' | 'cashed' | 'busted';
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed: string;
  nonce: number;
  finalMultiplier?: number;
  finalPayout?: number;
}

// Fallback ladders so the board looks correct before a bet is placed
const FALLBACK_LADDERS: Record<ChickenRoadLevel, number[]> = {
  easy: [1.06, 1.18, 1.31, 1.46, 1.62, 1.80, 2.00, 2.22, 2.47, 2.75], // 10
  medium: [1.12, 1.32, 1.56, 1.83, 2.16, 2.54, 2.99, 3.52, 4.14, 4.87, 5.73, 6.74], // 12
  hard: [1.2, 1.5, 1.87, 2.34, 2.93, 3.66, 4.57, 5.72, 7.15, 8.93, 11.17, 13.96, 17.45, 21.81, 27.27] // 15
};

const MOCK_HISTORY: MinesHistoryEntry[] = Array.from({ length: 15 }).map((_, i) => {
  const isWin = Math.random() > 0.5;
  const mult = isWin ? 1.2 + Math.random() * 3 : 0;
  const bet = 10 + Math.floor(Math.random() * 100);
  return {
    id: `mock-cr-${i}`,
    name: `User${Math.floor(Math.random() * 9999)}`,
    photoUrl: null,
    betAmount: bet,
    multiplier: mult,
    payout: isWin ? bet * mult : 0,
    timestamp: Date.now() - i * 15000,
  };
});

export default function ChickenRoadGamePage() {
  const router = useRouter();
  const { balance, fetchBalance } = useBalance();
  const tBals = useBalanceStore((s) => s.tournamentBalances);
  const tBal = tBals.find((t) => t.gameType === 'chicken-road');
  const activeBalance = tBal ? tBal.balance : balance?.amount ?? 0;

  const [server, setServer] = useState<ServerState | null>(null);
  const [busy, setBusy] = useState(false);

  // Local config
  const [amount, setAmount] = useState(10);
  const [level, setLevel] = useState<ChickenRoadLevel>('easy');

  useEffect(() => {
    soundManager.initialize();
  }, []);

  // Resume active round
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const res = await fetch('/api/games/chicken-road/state', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        if (data.state && data.state.state === 'active') {
          applyServer(data.state);
        }
      } catch (e) {
        console.error('Failed to load active chicken-road state:', e);
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  const applyServer = (st: ServerState) => {
    setServer(st);
    setLevel(st.level);
    if (st.state !== 'active') {
      fetchBalance();
      if (st.state === 'cashed') {
        soundManager.play('win');
        toast.success(`You won $${st.finalPayout?.toFixed(2)}!`);
      } else if (st.state === 'busted') {
        soundManager.play('lose');
        // The killer car animation handles itself when it sees crashLane
      }
    }
  };

  const handleBet = async () => {
    setBusy(true);
    setServer(null);
    try {
      const res = await fetch('/api/games/chicken-road/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, level }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      fetchBalance();
      soundManager.play('click');
      applyServer(data.result);
    } catch (e: any) {
      reportApiError(e);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStep = async () => {
    if (busy || server?.state !== 'active') return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/chicken-road/step', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      soundManager.play('click');
      applyServer(data.result);
    } catch (e: any) {
      reportApiError(e);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCashout = async () => {
    if (busy || server?.state !== 'active' || server.currentLane === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/games/chicken-road/cashout', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      applyServer(data.result);
      
      // After a win, we reset the board visually to sidewalk after 3s
      if (data.result.state === 'cashed') {
        setTimeout(() => {
          setServer(prev => prev && prev.state === 'cashed' ? { ...prev, currentLane: 0, state: 'idle' } : prev);
        }, 3000);
      }
    } catch (e: any) {
      reportApiError(e);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Determine effective phase
  const phase = !server || server.state !== 'active' ? 'idle' : server.currentLane > 0 ? 'cashout' : 'playing';

  // Derived state for board rendering
  const lanesCount = server ? server.lanesCount : (level === 'easy' ? 10 : level === 'medium' ? 12 : 15);
  const ladder = server ? server.ladder : FALLBACK_LADDERS[level];
  const currentLane = server ? server.currentLane : 0;
  const crashLane = server ? server.crashLane : null;
  const boardState = server ? server.state : 'idle';

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white flex flex-col">
      <div className="mx-auto w-full max-w-[800px] px-4 pt-4 pb-32 flex flex-col gap-5">
        <GameTopBar title="Chicken Road" />

        <ChickenRoadBoard
          lanesCount={lanesCount}
          ladder={ladder}
          currentLane={currentLane}
          crashLane={crashLane}
          state={boardState}
          onStep={handleStep}
          busy={busy}
        />

        <ChickenRoadBetPanel
          phase={phase}
          amount={amount}
          onAmountChange={setAmount}
          level={level}
          onLevelChange={setLevel}
          onBet={handleBet}
          onCashout={handleCashout}
          busy={busy}
          balance={activeBalance}
          currentMultiplier={server?.currentMultiplier ?? 0}
          nextMultiplier={server?.nextMultiplier ?? 0}
        />

        <MinesRecentBets bets={MOCK_HISTORY.slice(0, 5)} />
        <MinesHistory entries={MOCK_HISTORY} />
      </div>
    </main>
  );
}
