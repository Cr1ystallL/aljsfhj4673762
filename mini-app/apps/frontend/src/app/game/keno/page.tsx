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
import { useActiveBalance } from '@/hooks/use-active-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { KENO_MULTIPLIERS, type KenoRisk } from '@/components/game/keno/keno-multipliers';

import type { GameResultInfo } from '@/lib/game-engine/types';

interface KenoServerResult extends GameResultInfo {
  drawnNumbers: number[];
  hits: number;
}

export default function KenoGamePage() {
  const { fetchBalance } = useBalance();
  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    isTournament,
    currencyLabel,
  } = useActiveBalance('keno');

  // Game configuration
  const MAX_PICKS = 7;
  
  // State
  const [phase, setPhase] = useState<KenoPhase>('idle');
  const [busy, setBusy] = useState(false);
  
  // Bet parameters
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState('low');
  const [picks, setPicks] = useState<number[]>([]);
  
  // Game round data
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState<number | null>(null);

  // Freeze balance to prevent WS jumps spoiling the game
  const [frozenBalance, setFrozenBalance] = useState<number | null>(null);
  const displayBalance = frozenBalance !== null ? frozenBalance : activeBalance;

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

  const handlePick = (num: number) => {
    if (phase !== 'idle' || busy) return;
    
    // If we're interacting after a round, clear the previous draw
    if (drawnNumbers.length > 0) {
      setDrawnNumbers([]);
      setFinalMultiplier(null);
    }
    
    let selected = [...picks];
    if (selected.includes(num)) {
      selected = selected.filter((p) => p !== num);
    } else {
      if (selected.length >= MAX_PICKS) return;
      selected.push(num);
    }
    setPicks(selected);
    soundManager.play('click');
  };

  const handleAutoPick = () => {
    if (phase !== 'idle' || busy) return;
    
    if (drawnNumbers.length > 0) {
      setDrawnNumbers([]);
      setFinalMultiplier(null);
    }

    const newPicks: number[] = [];
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    
    for (let i = 0; i < MAX_PICKS; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      newPicks.push(pool[idx]);
      pool.splice(idx, 1);
    }
    
    setPicks(newPicks);
    soundManager.play('click');
  };

  const handleClear = () => {
    if (phase !== 'idle') return;
    setPicks([]);
    setDrawnNumbers([]);
    soundManager.play('click');
  };

  const handleBet = async () => {
    if (phase !== 'idle' || picks.length === 0 || busy) return;
    
    if (!isBalanceReady) {
      toast.warn('Баланс ещё загружается');
      return;
    }
    if (amount > activeBalance) {
      toast.error('Недостаточно средств');
      return;
    }

    setBusy(true);
    setFrozenBalance(activeBalance - amount);
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
    } else {
      soundManager.play('lose');
    }
    
    fetchBalance();
    void refreshHistory(); // Refresh history immediately after round

    // 1.5s delay to show final dark overlay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setFinalMultiplier(null);
    setPhase('idle');
    setFrozenBalance(null);
  };

  const hitsCount = picks.filter(p => drawnNumbers.includes(p)).length;

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] overflow-y-auto">
      <GameTopBar
        title="Keno"
        balance={displayBalance}
        currency={isTournament ? 'T-COIN' : 'zł'}
        serverSeedHash={serverSeedHash ?? undefined}
      />

      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 relative">
          
          {/* Multiplier Strip */}
          {picks.length > 0 && (
            <div className="w-full max-w-2xl mb-4 flex flex-wrap justify-center gap-1.5 pb-2">
              {KENO_MULTIPLIERS[risk as KenoRisk][picks.length].map((mult, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex-1 min-w-[3.5rem] max-w-[4.5rem] py-1.5 px-1 rounded-lg flex flex-col items-center justify-center border transition-all",
                    phase !== 'idle' && hitsCount === idx && drawnNumbers.length === 7
                      ? "bg-white/20 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-105" 
                      : "bg-black/40 border-white/5 text-white/60 hover:bg-white/5",
                    mult === 0 && "opacity-40"
                  )}
                >
                  <span className="text-[8px] uppercase font-bold leading-none mb-1 opacity-70 tracking-widest">{idx} ПОПАД.</span>
                  <span className="text-[13px] font-black leading-none">x{mult}</span>
                </div>
              ))}
            </div>
          )}

          {/* Multiplier Display (Shown at end of round) */}
          <AnimatePresence>
            {finalMultiplier !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl m-4 lg:m-8"
              >
                <motion.div
                  initial={{ scale: 0.8, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.8, y: -20 }}
                  className={cn(
                    "px-10 py-8 rounded-3xl font-black text-6xl shadow-2xl border-4",
                    finalMultiplier > 1 
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.3)]" 
                      : "bg-black/60 text-white/40 border-white/10"
                  )}
                >
                  x{finalMultiplier.toFixed(2)}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <KenoBoard
            picks={picks}
            onTogglePick={handlePick}
            drawnNumbers={drawnNumbers}
            phase={phase}
            maxPick={MAX_PICKS}
          />
        </div>

        {/* Sidebar Controls */}
        <div className="w-full lg:w-[350px] border-t lg:border-t-0 lg:border-l border-white/10 bg-black/20 p-4 flex flex-col gap-4">
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
            activeBalance={displayBalance}
            currency={isTournament ? 'T-COIN' : 'zł'}
          />

          <div className="flex-1 w-full pt-2 min-h-[400px] lg:min-h-0">
            <KenoLiveBets entries={history} currency={isTournament ? 'T-COIN' : 'zł'} />
          </div>
          
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
