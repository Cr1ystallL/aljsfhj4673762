'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dice5 } from 'lucide-react';

import { GameTopBar } from '@/components/game/game-top-bar';
import { KenoBoard } from '@/components/game/keno/keno-board';
import { KenoBetPanel, type KenoPhase } from '@/components/game/keno/keno-bet-panel';
import { KenoDrawTray } from '@/components/game/keno/keno-draw-tray';
import { KenoLiveBets, type KenoLiveBetEntry } from '@/components/game/keno/keno-live-bets';
import { KenoPayoutStrip } from '@/components/game/keno/keno-payout-strip';
import { ProvablyFairModal } from '@/components/game/provably-fair-modal';
import { useBalance } from '@/hooks/use-balance';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { soundManager } from '@/lib/sound/sound-manager';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { useT } from '@/i18n/use-t';
import {
  KENO_BOARD_SIZE,
  KENO_DRAW_COUNT,
  KENO_MAX_PICKS,
  KENO_MULTIPLIERS,
  type KenoRisk,
} from '@/components/game/keno/keno-multipliers';

interface KenoServerResult {
  drawnNumbers: number[];
  hits: number;
  multiplier: number;
  payout: number;
  serverSeedHash?: string;
  roundId?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function KenoGamePage() {
  const { t } = useT();
  const { fetchBalance } = useBalance();
  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    isTournament,
  } = useActiveBalance('keno');

  const [phase, setPhase] = useState<KenoPhase>('idle');
  const [busy, setBusy] = useState(false);
  const autoLock = useRef(false);

  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState('low');
  const [picks, setPicks] = useState<number[]>([]);

  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [lastDrawnNumber, setLastDrawnNumber] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [lastRoundId, setLastRoundId] = useState<string | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState<number | null>(null);

  const [frozenBalance, setFrozenBalance] = useState<number | null>(null);
  const displayBalance = frozenBalance !== null ? frozenBalance : activeBalance;

  const [history, setHistory] = useState<KenoLiveBetEntry[]>([]);
  const [pfOpen, setPfOpen] = useState(false);

  useEffect(() => {
    soundManager.initialize();
    soundManager.register('cases.tick', { src: '/audio/tick.mp3', category: 'sfx' });
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

  const clearDraw = () => {
    setDrawnNumbers([]);
    setLastDrawn(null);
    setFinalMultiplier(null);
  };

  const handlePick = (num: number) => {
    if (phase !== 'idle' || busy || autoLock.current) return;

    if (drawnNumbers.length > 0) clearDraw();

    setPicks((prev) => {
      if (prev.includes(num)) return prev.filter((p) => p !== num);
      if (prev.length >= KENO_MAX_PICKS) return prev;
      return [...prev, num];
    });
    soundManager.play('ui.click');
  };

  const handleAutoPick = async () => {
    if (phase !== 'idle' || busy || autoLock.current) return;

    if (drawnNumbers.length > 0) clearDraw();

    const pool = Array.from({ length: KENO_BOARD_SIZE }, (_, i) => i + 1);
    const next: number[] = [];
    for (let i = 0; i < KENO_MAX_PICKS; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      next.push(pool[idx]);
      pool.splice(idx, 1);
    }

    if (prefersReducedMotion()) {
      setPicks(next);
      soundManager.play('ui.click');
      return;
    }

    autoLock.current = true;
    setPicks([]);
    try {
      for (let i = 0; i < next.length; i++) {
        await sleep(48);
        setPicks(next.slice(0, i + 1));
        soundManager.play('ui.click');
      }
    } finally {
      autoLock.current = false;
    }
  };

  const handleClear = () => {
    if (phase !== 'idle') return;
    setPicks([]);
    clearDraw();
    soundManager.play('ui.click');
  };

  const handleBet = async () => {
    if (phase !== 'idle' || picks.length === 0 || busy) return;

    if (!isBalanceReady) {
      toast.warn(t('common.loading'));
      return;
    }
    if (amount > activeBalance) {
      toast.error(t('errors.insufficientBalance'));
      return;
    }

    setBusy(true);
    setFrozenBalance(activeBalance - amount);
    clearDraw();
    setServerSeedHash(null);
    setLastRoundId(null);

    try {
      soundManager.play('game.bet_placed');
      const res = await fetch('/api/games/keno/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          betAmount: amount,
          picks,
          risk,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        reportApiError(res, data, t('keno.betError'));
        throw new Error(data.error || t('keno.betError'));
      }

      const result = data.result as KenoServerResult;
      setServerSeedHash(result.serverSeedHash ?? null);
      setLastRoundId(result.roundId ?? null);

      setPhase('revealing');
      await revealNumbers(result.drawnNumbers, result.multiplier);
    } catch (err) {
      if (err instanceof TypeError) {
        reportApiError(null, null, t('keno.betError'));
      }
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  const revealNumbers = async (serverDraw: number[], multiplier: number) => {
    for (let i = 0; i < serverDraw.length; i++) {
      // Step-by-step reveal animation delay
      await new Promise((resolve) => setTimeout(resolve, 240));
      
      const num = serverDraw[i];
      setLastDrawnNumber(num);
      setDrawnNumbers((prev) => [...prev, num]);
      
      if (picks.includes(num)) {
        soundManager.play('win');
      } else {
        soundManager.play('tick');
      }
    }

    // Clear active ball indicator after draw ends
    await new Promise((resolve) => setTimeout(resolve, 300));
    setLastDrawnNumber(null);

    // Finalize
    await new Promise((resolve) => setTimeout(resolve, 300));
    setFinalMultiplier(multiplier);
    
    if (multiplier > 1) {
      soundManager.play('win');
    } else {
      soundManager.play('lose');
    }
    
    fetchBalance();
    void refreshHistory(); // Refresh history immediately after round

    if (multiplier > 0) soundManager.play('game.win');
    else soundManager.play('game.lose');

    void fetchBalance();
    void refreshHistory();

    setPhase('idle');
    setFrozenBalance(null);
  };

  const hitsCount = picks.filter((p) => drawnNumbers.includes(p)).length;
  const payoutTable = KENO_MULTIPLIERS[risk as KenoRisk]?.[picks.length] ?? [];
  const drawComplete = drawnNumbers.length >= KENO_DRAW_COUNT;

  return (
    <main className="min-h-screen w-full bg-[#000000] text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-4 pb-32 flex flex-col gap-5">
        <GameTopBar
          title="Keno"
          Icon={Dice5}
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
                    phase !== 'idle' && hitsCount === idx && drawnNumbers.length >= 1
                      ? "bg-emerald-500/30 border-emerald-400 text-white shadow-[0_0_15px_rgba(52,211,153,0.5)] scale-105" 
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
        </AnimatePresence>

        <KenoDrawTray
          drawn={drawnNumbers}
          picks={picks}
          drawCount={KENO_DRAW_COUNT}
          lastDrawn={lastDrawn}
        />

          <KenoBoard
            picks={picks}
            onTogglePick={handlePick}
            drawnNumbers={drawnNumbers}
            lastDrawnNumber={lastDrawnNumber}
            phase={phase}
            maxPick={MAX_PICKS}
          />
        </div>

        <KenoBetPanel
          amount={amount}
          onAmountChange={setAmount}
          risk={risk}
          onRiskChange={setRisk}
          picks={picks}
          onAutoPick={() => {
            void handleAutoPick();
          }}
          onClear={handleClear}
          phase={phase}
          onBet={() => {
            void handleBet();
          }}
          busy={busy}
          maxPick={KENO_MAX_PICKS}
          activeBalance={displayBalance}
          currency={isTournament ? 'T-COIN' : 'zł'}
        />

        <KenoLiveBets
          entries={history}
          currency={isTournament ? 'T-COIN' : 'zł'}
        />

        {lastRoundId && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setPfOpen(true)}
              className="text-[10px] uppercase tracking-[0.2em] text-whisper-gray font-roobert"
            >
              {t('info.fairness')}
            </button>
            <ProvablyFairModal
              roundId={lastRoundId}
              open={pfOpen}
              onOpenChange={setPfOpen}
            />
          </div>
        )}
      </div>
    </main>
  );
}
