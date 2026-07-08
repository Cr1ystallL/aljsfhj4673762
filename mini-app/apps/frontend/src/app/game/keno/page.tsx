'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { cn } from '@/lib/utils';
import { GameTopBar } from '@/components/game/game-top-bar';
import { KenoBoard } from '@/components/game/keno/keno-board';
import { KenoBetPanel, type KenoPhase } from '@/components/game/keno/keno-bet-panel';
import { KenoLiveBets, type KenoLiveBetEntry } from '@/components/game/keno/keno-live-bets';
import { ProvablyFairModal } from '@/components/game/provably-fair-modal';
import { useBalance } from '@/hooks/use-balance';
import { useBalanceStore } from '@/store/balance-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';

import type { GameResultInfo } from '@/lib/game-engine/types';

interface KenoServerResult extends GameResultInfo {
  drawnNumbers: number[];
  hits: number;
}

export default function KenoGamePage() {
  const { balance, fetchBalance } = useBalance();
  const tBals = useBalanceStore((s) => s.tournamentBalances);
  const tBal = tBals.find((t) => t.gameType === 'keno');
  const activeBalance = tBal ? tBal.balance : balance?.amount ?? 10000;

  // Game configuration
  const MAX_PICKS = 10;
  
  // State
  const [phase, setPhase] = useState<KenoPhase>('idle');
  const [busy, setBusy] = useState(false);
  
  // Bet parameters
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState('classic');
  const [picks, setPicks] = useState<number[]>([]);
  
  // Game round data
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState<number | null>(null);

  // Live bets
  const [history, setHistory] = useState<KenoLiveBetEntry[]>([]);

  // Sound init
  useEffect(() => {
    soundManager.initialize();
  }, []);

  const refreshHistory = async () => {
    try {
      const res = await fetch('/api/games/keno/history?limit=20', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.history) {
        setHistory(data.history);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshHistory();
    const id = setInterval(refreshHistory, 8000);
    return () => clearInterval(id);
  }, []);

  const handleTogglePick = (num: number) => {
    setPicks((prev) => {
      if (prev.includes(num)) {
        return prev.filter((p) => p !== num);
      }
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, num].sort((a, b) => a - b);
    });
  };

  const handleAutoPick = () => {
    if (phase !== 'idle') return;
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    const shuffled = pool.sort(() => 0.5 - Math.random());
    // Auto pick random count between 1 and 10, or just fill to 10
    const count = Math.max(1, Math.floor(Math.random() * MAX_PICKS) + 1);
    const selected = shuffled.slice(0, count).sort((a, b) => a - b);
    setPicks(selected);
    soundManager.play('click');
  };

  const handleClear = () => {
    if (phase !== 'idle') return;
    setPicks([]);
    soundManager.play('click');
  };

  const handleBet = async () => {
    if (phase !== 'idle' || picks.length === 0 || busy) return;
    
    if (amount > activeBalance) {
      toast.error('Недостаточно средств');
      return;
    }

    setBusy(true);
    setDrawnNumbers([]);
    setFinalMultiplier(null);
    setServerSeedHash(null);
    setLastRoundId(null);

    try {
      soundManager.play('bet');
      const res = await fetch('/api/games/keno/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betAmount: amount,
          picks,
          risk,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка ставки');

      const result = data.result as KenoServerResult;
      setServerSeedHash(result.serverSeedHash);
      setLastRoundId(result.roundId);
      
      // Start reveal sequence
      setPhase('revealing');
      await revealNumbers(result.drawnNumbers, result.multiplier);
      
    } catch (err) {
      reportApiError(err, 'keno');
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  const revealNumbers = async (serverDraw: number[], multiplier: number) => {
    for (let i = 0; i < serverDraw.length; i++) {
      // Small delay between each draw
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      const num = serverDraw[i];
      setDrawnNumbers((prev) => [...prev, num]);
      
      if (picks.includes(num)) {
        soundManager.play('win'); // Optional: special sound for hit
      } else {
        soundManager.play('tick');
      }
    }

    // Finalize
    await new Promise((resolve) => setTimeout(resolve, 500));
    setFinalMultiplier(multiplier);
    
    if (multiplier > 1) {
      soundManager.play('win'); // Or a bigger jackpot sound
      toast.success(`Победа! x${multiplier.toFixed(2)}`);
    } else {
      soundManager.play('lose');
    }
    
    fetchBalance();
    setPhase('idle');
    void refreshHistory(); // Refresh history immediately after round
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <GameTopBar
        title="Keno"
        balance={activeBalance}
        currency={tBal ? 'T-COIN' : 'TON'}
        serverSeedHash={serverSeedHash ?? undefined}
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 relative">
          
          {/* Multiplier Display (Shown at end of round) */}
          <AnimatePresence>
            {finalMultiplier !== null && phase === 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "absolute top-4 lg:top-8 px-6 py-3 rounded-2xl font-bold text-3xl shadow-xl z-20 backdrop-blur-md border",
                  finalMultiplier > 1 
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" 
                    : "bg-black/40 text-white/50 border-white/10"
                )}
              >
                x{finalMultiplier.toFixed(2)}
              </motion.div>
            )}
          </AnimatePresence>

          <KenoBoard
            picks={picks}
            onTogglePick={handleTogglePick}
            drawnNumbers={drawnNumbers}
            phase={phase}
            maxPick={MAX_PICKS}
          />
        </div>

        {/* Sidebar Controls */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/20 p-4 overflow-y-auto flex flex-col gap-4">
          <KenoBetPanel
            amount={amount}
            onAmountChange={setAmount}
            risk={risk}
            onRiskChange={setRisk}
            picks={picks}
            onAutoPick={handleAutoPick}
            onClear={handleClear}
            phase={phase}
            onBet={handleBet}
            busy={busy}
            maxPick={MAX_PICKS}
            activeBalance={activeBalance}
            currency={tBal ? 'T-COIN' : 'TON'}
          />

          <KenoLiveBets entries={history} currency={tBal ? 'T-COIN' : 'TON'} />
          
          {/* Provably Fair Hook */}
          {lastRoundId && phase === 'idle' && (
            <div className="mt-2 flex justify-center">
              <ProvablyFairModal roundId={lastRoundId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
