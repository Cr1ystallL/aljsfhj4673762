'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, HandCoins, ChevronUp, ChevronDown, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuthStore } from '@/store/auth-store';
import { useBalance } from '@/hooks/use-balance';
import { useBalanceStore } from '@/store/balance-store';
import { apiClient } from '@/lib/api/client';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { soundManager } from '@/lib/sound/sound-manager';

import { GameTopBar } from '@/components/game/game-top-bar';
import { CardData, PlayingCard } from '@/components/game/hilo/playing-card';
import { HiloHistory, type HiloHistoryEntry } from '@/components/game/hilo/hilo-history';
import { getCardColor, getRankName } from '@/components/game/hilo/playing-card';

type HiloStatus = 'idle' | 'playing' | 'cashed_out' | 'busted';

interface HiloState {
  status: HiloStatus;
  betAmount: number;
  currentMultiplier: number;
  currentCard: CardData | null;
  history: CardData[];
  nextMultipliers: { red: number; black: number; higher: number; lower: number } | null;
}

export function HiloClient() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { balance, fetchBalance } = useBalance();
  const tBals = useBalanceStore((s) => s.tournamentBalances);
  const tBal = tBals.find((t) => t.gameType === 'hilo');
  const activeBalance = tBal ? tBal.balance : balance?.amount ?? 10000;

  const [state, setState] = useState<HiloState | null>(null);
  const [betAmount, setBetAmount] = useState<string>('10');
  const [loading, setLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [history, setHistory] = useState<HiloHistoryEntry[]>([]);
  
  const refreshHistory = async () => {
    try {
      const res = await fetch('/api/games/hilo/history?limit=20', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setHistory(json.history ?? []);
      }
    } catch {}
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [state?.history?.length]);

  const refreshState = async () => {
    try {
      const res: any = await apiClient.get('/api/games/hilo/state');
      if (res.state) {
        setState(res.state);
      }
    } catch (err) {
      console.error('Failed to fetch hilo state', err);
    }
  };

  // Sound init & fetch initial state
  useEffect(() => {
    soundManager.initialize();
    refreshHistory();
    if (!user) return;
    
    let alive = true;
    setLoading(true);

    const init = async () => {
      try {
        await fetchBalance();
        await refreshState();
      } catch (err) {
        console.error('Failed to fetch hilo state', err);
      } finally {
        if (alive) setLoading(false);
      }
    };
    init();

    // Poll history every 8 seconds
    const interval = setInterval(() => {
      if (alive) refreshHistory();
    }, 8000);

    return () => { 
      alive = false; 
      clearInterval(interval);
    };
  }, [user, fetchBalance]);

  const handleSwap = async () => {
    if (state?.status === 'playing' || loading) return;
    try {
      setLoading(true);
      const res: any = await apiClient.post('/api/games/hilo/swap');
      if (res.state) setState(res.state);
      soundManager.play('game.click');
    } catch (err: any) {
      reportApiError(null, err?.response?.data || err, 'Failed to skip card');
      refreshState();
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.warn('Введите корректную сумму ставки');
      return;
    }
    if (amount > activeBalance) {
      toast.warn(`Недостаточно средств — у вас ${activeBalance.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${tBal ? '🏆' : 'zł'}`);
      return;
    }
    try {
      setLoading(true);
      const res: any = await apiClient.post('/api/games/hilo/start', { amount });
      if (res.state) {
        setState(res.state);
        soundManager.play('game.bet_placed');
        fetchBalance();
        refreshHistory();
      }
    } catch (err: any) {
      reportApiError(null, err?.response?.data || err, 'Failed to start');
      const refreshState = async () => {
        try {
          const r: any = await apiClient.get('/api/games/hilo/state');
          if (r.state) setState(r.state);
        } catch (e) {}
      };
      refreshState();
    } finally {
      setLoading(false);
    }
  };

  const handleGuess = async (choice: 'higher' | 'lower') => {
    if (state?.status !== 'playing' || loading) return;
    try {
      setLoading(true);
      const res: any = await apiClient.post('/api/games/hilo/guess', { choice });
      if (res.state) {
        setState(res.state);
        if (res.state.status === 'busted') {
          soundManager.play('game.lose');
          fetchBalance();
          refreshHistory();
        } else {
          soundManager.play('game.win');
        }
      }
    } catch (err: any) {
      reportApiError(null, err?.response?.data || err, 'Failed to guess');
      const refreshState = async () => {
        try {
          const r: any = await apiClient.get('/api/games/hilo/state');
          if (r.state) setState(r.state);
        } catch (e) {}
      };
      refreshState();
    } finally {
      setLoading(false);
    }
  };

  const handleCashout = async () => {
    if (state?.status !== 'playing' || loading) return;
    if (state.currentMultiplier <= 1.0) {
      toast.warn('Сначала выиграйте хотя бы один раунд');
      return;
    }
    try {
      setLoading(true);
      const res: any = await apiClient.post('/api/games/hilo/cashout');
      if (res.state) {
        setState(res.state);
        soundManager.play('game.cashout');
        fetchBalance();
        refreshHistory();
      }
    } catch (err: any) {
      reportApiError(null, err?.response?.data || err, 'Failed to cashout');
      const refreshState = async () => {
        try {
          const r: any = await apiClient.get('/api/games/hilo/state');
          if (r.state) setState(r.state);
        } catch (e) {}
      };
      refreshState();
    } finally {
      setLoading(false);
    }
  };

    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const isStateLoaded = state !== null;
  const isPlaying = state?.status === 'playing';
  const isBusted = state?.status === 'busted';
  const isCashed = state?.status === 'cashed_out';

  const currentRank = state?.currentCard?.rank || 1;
  const higherProb = ((14 - currentRank) / 13) * 100;
  const lowerProb = (currentRank / 13) * 100;
  
  const currentBet = state?.betAmount || parseFloat(betAmount) || 0;
  
  const higherMult = state?.nextMultipliers?.higher || 0;
  const lowerMult = state?.nextMultipliers?.lower || 0;
  
  const profitHigher = currentBet * higherMult;
  const profitLower = currentBet * lowerMult;

  const prevCard = state?.history?.length > 1 ? state.history[state.history.length - 2] : null;

  return (
    <main className="min-h-screen w-full bg-midnight-canvas text-frost-white">
      <div className="mx-auto w-full max-w-[480px] sm:max-w-[640px] px-3 pt-3 pb-28 flex flex-col gap-3">
        <GameTopBar title="Hi-Lo" Icon={ChevronUp} onHowToPlay={() => setRulesOpen(true)} />

        {/* Play Area */}
        <section className="relative rounded-card border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex flex-col items-center gap-6 overflow-hidden">
          
          {/* Status Message */}
          {(isBusted || isCashed) && (
            <div className={`w-full text-center py-2 rounded-lg bg-black/30 backdrop-blur-md border ${isBusted ? 'border-[#ff4949]/30 text-[#ff4949]' : 'border-emerald-500/30 text-emerald-400'}`}>
              <span className="font-roobert font-medium text-sm tracking-wide uppercase">
                {isBusted ? 'Ставка проиграна' : `Выиграно +${(currentBet * state!.currentMultiplier).toFixed(2)} zł`}
              </span>
            </div>
          )}

          {/* Backdrop Glow */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: isBusted 
                ? 'radial-gradient(50% 50% at 50% 50%, rgba(255, 73, 73, 0.15) 0%, transparent 100%)'
                : 'radial-gradient(50% 50% at 50% 50%, rgba(133, 150, 255, 0.1) 0%, transparent 100%)',
            }}
          />

          {/* Cards Display */}
          <div className="relative flex items-center justify-center w-full h-52">
            <AnimatePresence mode="popLayout">
              {/* Previous Card (Faded on Left) */}
              {prevCard && (
                <PlayingCard 
                  key={`prev-${state?.history?.length}`}
                  card={prevCard} 
                  faded 
                  className="w-24 h-36 absolute left-4 sm:left-12" 
                  direction="right-to-left"
                />
              )}
              
              {/* Current Card (Center) */}
              <PlayingCard 
                key={`current-${Math.max(1, state?.history?.length || 1)}`}
                card={state?.currentCard || null} 
                animateKey={`current-${Math.max(1, state?.history?.length || 1)}`}
                className="w-36 h-52 absolute z-10 shadow-2xl" 
                direction="right-to-left"
              />
              
              {/* Next Card Deck Placeholder (Right) */}
              <div className="w-24 h-36 absolute right-4 sm:right-12 z-0 rounded-xl bg-gradient-to-br from-[#1a1c29] to-[#0f1016] shadow-inner flex flex-col items-center justify-center opacity-80 overflow-hidden">
                <div className="w-full h-full rounded-lg m-1 relative flex items-center justify-center">
                  <div className="absolute inset-0 opacity-15 flex items-center justify-center">
                    <svg viewBox="0 0 1024 1024" className="w-20 h-20 text-white" fill="currentColor">
                      <g transform="translate(0,1024) scale(0.1,-0.1)">
                        <path d="M5050 8891 c-186 -60 -321 -200 -450 -465 -181 -372 -333 -968 -486 -1906 -20 -124 -38 -232 -41 -240 -3 -8 -22 35 -43 95 -129 377 -321 783 -495 1045 -195 294 -367 434 -585 477 -218 43 -440 -63 -585 -281 -268 -403 -405 -1125 -405 -2136 0 -955 176 -2298 335 -2549 93 -148 230 -221 389 -208 138 12 263 105 329 244 30 65 32 74 31 183 0 102 -7 144 -57 365 -125 557 -201 1068 -239 1615 -19 283 -16 1071 5 1340 39 478 93 772 144 788 31 9 115 -120 197 -305 236 -528 498 -1528 636 -2427 86 -566 99 -960 50 -1546 -26 -312 -20 -400 38 -515 35 -70 68 -110 136 -161 121 -92 292 -111 427 -46 122 58 216 182 245 324 13 62 13 102 -3 362 -24 399 -24 1277 0 1616 33 459 68 801 142 1392 112 891 214 1493 334 1971 60 234 86 309 109 305 42 -8 159 -453 256 -968 93 -495 211 -1393 271 -2055 94 -1040 92 -1452 -12 -2659 -14 -163 -15 -213 -5 -280 36 -247 222 -398 474 -384 69 4 100 12 153 36 85 41 175 129 214 212 50 106 56 167 41 449 -19 367 -6 665 51 1121 104 839 333 1741 594 2346 109 250 248 496 302 531 25 16 26 16 49 -10 72 -84 156 -523 196 -1017 17 -219 17 -987 0 -1220 -35 -467 -75 -835 -148 -1355 -43 -304 -46 -335 -35 -398 24 -142 112 -260 238 -320 62 -29 77 -32 163 -32 131 1 190 25 279 114 99 99 135 181 175 412 88 495 122 972 113 1569 -19 1153 -141 1925 -384 2416 -105 213 -230 350 -388 426 -224 107 -451 83 -681 -73 -221 -149 -470 -481 -674 -902 l-68 -139 -22 124 c-134 741 -300 1479 -410 1823 -172 536 -366 817 -618 895 -82 25 -205 26 -282 1z" />
                      </g>
                    </svg>
                  </div>
                </div>
              </div>
            </AnimatePresence>
          </div>

          {/* Profit Indicators */}
          <div className="grid grid-cols-2 gap-3 w-full relative z-10 mt-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center transition-colors">
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-roobert mb-1">
                Прибыль, если выше ({higherMult > 0 ? higherMult.toFixed(2) + '×' : '--'})
              </div>
              <div className="text-sm font-roobert text-frost-white font-medium">
                {higherMult > 0 ? profitHigher.toFixed(2) + ' zł' : '--'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center transition-colors">
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-roobert mb-1">
                Прибыль, если ниже ({lowerMult > 0 ? lowerMult.toFixed(2) + '×' : '--'})
              </div>
              <div className="text-sm font-roobert text-frost-white font-medium">
                {lowerMult > 0 ? profitLower.toFixed(2) + ' zł' : '--'}
              </div>
            </div>
          </div>

          {/* History Strip */}
          <div ref={scrollRef} className="flex gap-2 w-full overflow-x-auto items-center py-2 relative z-10 min-h-[4.5rem] px-2 hide-scrollbar scroll-smooth">
            <AnimatePresence initial={false}>
              {state?.history?.map((card, idx) => (
                <motion.div
                  key={`${idx}-${card.rank}-${card.suit}`}
                  initial={{ opacity: 0, x: -20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                  className="shrink-0"
                >
                  <div className={`flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded bg-white shadow-sm ring-1 ring-black/5 ${getCardColor(card.suit)}`}>
                    <span className="text-[12px] font-bold font-roobert leading-none tracking-tighter">{getRankName(card.rank)}</span>
                    <span className="text-[12px] leading-none mt-[2px]">{card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div className="w-1 shrink-0" />
          </div>
        </section>

        {/* Controls Area */}
        <section className="flex flex-col gap-3">
          {/* Bet Amount Panel */}
          <div className="rounded-card border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-roobert text-[12px] uppercase tracking-[0.2em] text-white/50">
                Сумма ставки
              </span>
              <span className="font-roobert text-[12px] text-frost-white">
                {isPlaying ? `${currentBet.toFixed(2)} zł` : `${activeBalance.toFixed(2)} zł`}
              </span>
            </div>
            
            <div className={`flex items-center justify-between rounded-pill border transition-colors ${isPlaying ? 'border-white/5 bg-white/[0.02] opacity-50' : 'border-white/15 bg-white/[0.04] focus-within:border-white/30'}`}>
              <div className="flex items-center pl-4 w-1/2">
                <span className="text-white/40 font-roobert mr-1">zł</span>
                <input
                  type="number"
                  value={isPlaying ? currentBet : betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  disabled={!isStateLoaded || isPlaying || loading}
                  className="w-full bg-transparent outline-none font-roobert text-[16px] text-frost-white tabular-nums placeholder:text-white/20"
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-center h-11">
                <div className="w-[1px] h-6 bg-white/10 mx-1" />
                <button
                  type="button"
                  disabled={!isStateLoaded || isPlaying || loading}
                  onClick={() => setBetAmount((prev) => (Math.max(1, parseFloat(prev || '0') / 2)).toFixed(2))}
                  className="h-full px-4 font-roobert text-[12px] font-medium text-white/70 hover:text-white transition-colors"
                >
                  ½
                </button>
                <div className="w-[1px] h-6 bg-white/10" />
                <button
                  type="button"
                  disabled={!isStateLoaded || isPlaying || loading}
                  onClick={() => setBetAmount((prev) => (parseFloat(prev || '0') * 2).toFixed(2))}
                  className="h-full px-4 font-roobert text-[12px] font-medium text-white/70 hover:text-white transition-colors pr-5"
                >
                  2×
                </button>
              </div>
            </div>

            {/* Start / Cashout Button */}
            {!isPlaying ? (
              <button
                onClick={handleStart}
                disabled={!isStateLoaded || loading}
                className="w-full shrink-0 min-h-[48px] h-12 rounded-pill bg-[#4f85e8] text-white font-roobert text-[14px] font-medium tracking-wide hover:bg-[#5c90f2] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Ставка
              </button>
            ) : (
              <button
                onClick={handleCashout}
                disabled={loading}
                className="w-full shrink-0 min-h-[48px] h-12 rounded-pill bg-emerald-500 text-black font-roobert text-[14px] font-semibold tracking-wide hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Забрать {(currentBet * state.currentMultiplier).toFixed(2)} zł
              </button>
            )}

            {/* Skip Card */}
            <button
              onClick={handleSwap}
              disabled={!isStateLoaded || isPlaying || loading}
              className="w-full h-10 rounded-pill bg-white/[0.05] border border-white/5 text-white/70 font-roobert text-[12px] tracking-wide hover:bg-white/[0.1] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Пропустить карту
              <ChevronsRight size={14} />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleGuess('higher')}
              disabled={!isStateLoaded || !isPlaying || loading}
              className="relative overflow-hidden h-14 rounded-xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center hover:bg-white/[0.08] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 group"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-[#8596ff]/30 group-hover:bg-[#8596ff]/50 transition-colors" />
              <div className="flex items-center gap-2 text-frost-white font-roobert text-[13px]">
                Выше или равная
                <ChevronUp size={16} className="text-[#8596ff]" />
              </div>
              <div className="text-[11px] text-[#8596ff] font-roobert mt-0.5 tracking-wider">
                {higherProb.toFixed(2)}%
              </div>
            </button>
            
            <button
              onClick={() => handleGuess('lower')}
              disabled={!isStateLoaded || !isPlaying || loading}
              className="relative overflow-hidden h-14 rounded-xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center hover:bg-white/[0.08] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 group"
            >
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#ff8a76]/30 group-hover:bg-[#ff8a76]/50 transition-colors" />
              <div className="flex items-center gap-2 text-frost-white font-roobert text-[13px]">
                Ниже или равная
                <ChevronDown size={16} className="text-[#ff8a76]" />
              </div>
              <div className="text-[11px] text-[#ff8a76] font-roobert mt-0.5 tracking-wider">
                {lowerProb.toFixed(2)}%
              </div>
            </button>
          </div>
        </section>

        {/* Live History Ticker */}
        <HiloHistory entries={history} currency={tBal ? '🏆' : 'zł'} />
      </div>
      
      {/* Hide scrollbar styles injected */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </main>
  );
}
