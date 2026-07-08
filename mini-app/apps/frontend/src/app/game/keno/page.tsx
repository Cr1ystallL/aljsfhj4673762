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
import { KENO_MULTIPLIERS, type KenoRisk } from '@/components/game/keno/keno-multipliers';

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
    // Auto pick always exactly 8 (user requested max 8, auto-picking the max allowed for this mode)
    const selected = shuffled.slice(0, 8).sort((a, b) => a - b);
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
    void refreshHistory(); // Refresh history immediately after round

    // 1.5s delay to show final dark overlay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setFinalMultiplier(null);
    setPhase('idle');
  };

  const hitsCount = picks.filter(p => drawnNumbers.includes(p)).length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <GameTopBar
        title="Keno"
        balance={activeBalance}
        currency={tBal ? 'T-COIN' : 'zł'}
        serverSeedHash={serverSeedHash ?? undefined}
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Main Game Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 relative">
          
          {/* Multiplier Strip */}
          {picks.length > 0 && (
            <div className="w-full max-w-2xl mb-4 flex gap-1 overflow-x-auto pb-2">
              {KENO_MULTIPLIERS[risk as KenoRisk][picks.length].map((mult, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex-1 min-w-[3rem] py-1.5 px-1 rounded flex flex-col items-center justify-center border transition-colors",
                    phase !== 'idle' && hitsCount === idx && drawnNumbers.length === 10
                      ? "bg-white/20 border-white text-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
                      : "bg-black/40 border-white/5 text-white/50",
                    mult === 0 && "opacity-50"
                  )}
                >
                  <span className="text-[10px] uppercase font-bold leading-none mb-0.5">{idx}x</span>
                  <span className="text-xs font-black leading-none">{mult}</span>
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
            currency={tBal ? 'T-COIN' : 'zł'}
          />

          <KenoLiveBets entries={history} currency={tBal ? 'T-COIN' : 'zł'} />
          
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
