'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, HandCoins, ChevronUp, ChevronDown, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuthStore } from '@/store/auth-store';
import { useBalance } from '@/hooks/use-balance';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { apiClient } from '@/lib/api/client';
import { reportApiError } from '@/lib/api/errors';
import { toast } from '@/store/toast-store';
import { soundManager } from '@/lib/sound/sound-manager';

import { GameTopBar } from '@/components/game/game-top-bar';
import { CardData, PlayingCard } from '@/components/game/hilo/playing-card';
import { HiloHistory, type HiloHistoryEntry } from '@/components/game/hilo/hilo-history';
import { getCardColor, getRankName } from '@/components/game/hilo/playing-card';
import { useT } from '@/i18n/use-t';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

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
  const { t, localeTag } = useT();
  const user = useAuthStore((s) => s.user);
  const { fetchBalance } = useBalance();
  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    currencyLabel,
  } = useActiveBalance('hilo');

  const [state, setState] = useState<HiloState | null>(null);
  const [betAmount, setBetAmount] = useState<string>('10');
  const [loading, setLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [history, setHistory] = useState<HiloHistoryEntry[]>([]);
  
  const refreshHistory = async () => {
    try {
      const res = await fetch('/api/games/hilo/history?limit=20', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error('Failed to fetch hilo history', err);
    }
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
      const res: any = await apiClient.post('/api/games/hilo/swap', {});
      if (res.state) setState(res.state);
      soundManager.play('game.click');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to skip card');
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
    if (!isBalanceReady) {
      toast.warn('Баланс ещё загружается');
      return;
    }
    if (amount > activeBalance) {
      toast.warn(
        t('common.insufficientWithBalance', {
          amount: activeBalance.toLocaleString(localeTag, { maximumFractionDigits: 2 }),
          currency: currencyLabel,
        })
      );
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
    if (!isPlaying) return;
    if (state.history.length <= 1) {
      toast.warn('Сначала выиграйте хотя бы один раунд');
      return;
    }
    try {
      setLoading(true);
      const res: any = await apiClient.post('/api/games/hilo/cashout', {});
      if (res.state) {
        setState(res.state);
        soundManager.play('game.cashout');
        fetchBalance();
        refreshHistory();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to cashout');
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

  // Calculations
  const isStateLoaded = state !== null;
  const isPlaying = state?.status === 'playing';
  const isBusted = state?.status === 'busted';
  const isCashed = state?.status === 'cashed_out';

  const parsedBet = parseFloat(betAmount);
  const isBetValid = Number.isFinite(parsedBet) && parsedBet > 0;
  const canAfford = isBalanceReady && isBetValid && parsedBet <= activeBalance;
  // Only the fresh-round button depends on funds; "Новая игра" just resets.
  const isStartingRound = !isPlaying && !isBusted && !isCashed;
  const isShortOnFunds = isStartingRound && isBalanceReady && isBetValid && !canAfford;

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
        <section className="relative rounded-[20px] border border-white/12 bg-white/[0.03] p-4 flex flex-col items-center gap-6 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          
          {/* Status Message */}
          {(isBusted || isCashed) && (
            <div className={`w-full text-center py-2 rounded-lg bg-black/30 backdrop-blur-md border ${isBusted ? 'border-[#ff4949]/30 text-[#ff4949]' : 'border-emerald-500/30 text-emerald-400'}`}>
              <span className="font-roobert font-medium text-sm tracking-wide uppercase">
                {isBusted
                  ? t('hilo.lost')
                  : t('hilo.wonPlus', {
                      amount: (currentBet * state!.currentMultiplier).toFixed(2),
                    })}
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
          <div className="relative flex items-center justify-center w-full h-60">
            <AnimatePresence mode="popLayout">
              {/* Previous Card (Faded on Left) */}
              {prevCard && (
                <PlayingCard 
                  key={`prev-${prevCard.rank}-${prevCard.suit}-${state?.history?.length}`}
                  card={prevCard} 
                  faded 
                  className="w-24 h-36 absolute left-3 sm:left-10" 
                  direction="right-to-left"
                />
              )}
              
              {/* Current Card (Center) */}
              <PlayingCard 
                key={`current-${state?.currentCard?.rank}-${state?.currentCard?.suit}-${state?.history?.length || 0}`}
                card={state?.currentCard || null} 
                animateKey={`current-${state?.currentCard?.rank}-${state?.currentCard?.suit}-${state?.history?.length || 0}`}
                className="w-40 h-56 absolute z-10" 
                direction="right-to-left"
              />
              
              {/* Next Card Deck Placeholder (Right) */}
              <div className="w-24 h-36 absolute right-4 sm:right-12 z-0">
                {/* Stack effect layers */}
                <div className="absolute top-2 left-2 w-full h-full rounded-xl bg-[#0f1016]/80 border border-white/5" />
                <div className="absolute top-1 left-1 w-full h-full rounded-xl bg-[#151720]/90 border border-white/10" />
                {/* Top deck card */}
                <div className="absolute inset-0 rounded-[16px] border border-white/10 bg-gradient-to-br from-[#1c1e26] to-[#0c0d11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex items-center justify-center">
                  <span className="font-roobert text-[10px] uppercase tracking-[0.2em] text-white/30">
                    {t('hilo.deck')}
                  </span>
                </div>
              </div>
            </AnimatePresence>
          </div>

          {/* Profit Indicators */}
          <div className="grid grid-cols-2 gap-3 w-full relative z-10 mt-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center transition-colors">
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-roobert mb-1">
                {t('hilo.profitHigher')} ({higherMult > 0 ? `${higherMult.toFixed(2)}×` : '—'})
              </div>
              <div className="text-sm font-roobert text-frost-white font-medium">
                {higherMult > 0 ? profitHigher.toFixed(2) + ' zł' : '--'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center transition-colors">
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-roobert mb-1">
                {t('hilo.profitLower')} ({lowerMult > 0 ? `${lowerMult.toFixed(2)}×` : '—'})
              </div>
              <div className="text-sm font-roobert text-frost-white font-medium">
                {lowerMult > 0 ? profitLower.toFixed(2) + ' zł' : '--'}
              </div>
            </div>
          </div>

          {/* History Strip */}
          <div className="w-full flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase tracking-wider text-white/50 font-roobert">
                История раунда {state?.history && state.history.length > 0 ? `(${state.history.length})` : ''}
              </span>
            </div>
            <div
              ref={scrollRef}
              className="flex gap-2 w-full overflow-x-auto items-center py-2 relative z-10 min-h-[4.5rem] px-2 rounded-xl bg-black/30 border border-white/5 no-scrollbar scroll-smooth"
            >
              {(!state?.history || state.history.length === 0) ? (
                <div className="w-full text-center text-[11px] text-white/30 font-roobert py-2">
                  Сыгранные карты раунда появятся здесь
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {state.history.map((card, idx) => (
                    <motion.div
                      key={`${idx}-${card.rank}-${card.suit}`}
                      initial={{ opacity: 0, x: -20, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                      className="shrink-0"
                    >
                      <div className={`flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-white shadow-md ring-1 ring-black/10 ${getCardColor(card.suit)}`}>
                        <span className="text-[13px] font-bold font-roobert leading-none tracking-tighter">{getRankName(card.rank)}</span>
                        <span className="text-[14px] leading-none mt-0.5">{card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              <div className="w-1 shrink-0" />
            </div>
          </div>
        </section>

        {/* Controls Area */}
        <section className="flex flex-col gap-3">
          <BetPanelShell>
            <div className="grid grid-cols-2 items-stretch">
              <div className="px-4 py-3 border-r border-white/10">
                <StakeField
                  amount={isPlaying ? currentBet : parsedBet || 1}
                  onAmountChange={(next) => setBetAmount(String(next))}
                  minBet={1}
                  maxBet={Math.max(1, Math.floor(activeBalance) || 1)}
                  disabled={!isStateLoaded || isPlaying || loading}
                  label={t('common.bet')}
                  decreaseLabel={t('common.decreaseBet')}
                  increaseLabel={t('common.increaseBet')}
                />
              </div>
              <div className="px-4 py-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                  {isPlaying ? t('crash.multiplier') : t('nav.wallet')}
                </span>
                <div
                  className={`mt-2 font-roobert text-[22px] font-light tabular-nums ${
                    isShortOnFunds ? 'text-[#ff8a76]' : 'text-frost-white'
                  }`}
                >
                  {isPlaying
                    ? `x${(state?.currentMultiplier ?? 1).toFixed(2)}`
                    : !isBalanceReady
                      ? t('common.loading')
                      : `${activeBalance.toFixed(2)}`}
                </div>
              </div>
            </div>

            <BetPanelCtaRow>
              {!isPlaying ? (
                <GamePrimaryButton
                  onClick={isBusted || isCashed ? handleSwap : handleStart}
                  disabled={
                    !isStateLoaded ||
                    loading ||
                    (isStartingRound && (!isBalanceReady || !canAfford))
                  }
                  tone={
                    isBusted || isCashed || (isBalanceReady && canAfford)
                      ? 'solid'
                      : 'muted'
                  }
                >
                  {isBusted || isCashed
                    ? t('common.newGame')
                    : !isBalanceReady
                      ? t('common.loadingBalance')
                      : isShortOnFunds
                        ? t('common.insufficientFunds')
                        : t('common.bet')}
                </GamePrimaryButton>
              ) : (
                <GamePrimaryButton
                  onClick={handleCashout}
                  disabled={loading}
                  tone="solid"
                >
                  {t('common.cashOutWithAmount', {
                    amount: (currentBet * (state?.currentMultiplier ?? 1)).toFixed(2),
                  })}
                </GamePrimaryButton>
              )}
            </BetPanelCtaRow>
          </BetPanelShell>

          {!isPlaying && !isBusted && !isCashed && (
            <GamePrimaryButton
              onClick={handleSwap}
              disabled={!isStateLoaded || loading}
              tone="muted"
            >
              {t('common.skipCard')}
              <ChevronsRight size={14} />
            </GamePrimaryButton>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleGuess('higher')}
              disabled={!isStateLoaded || !isPlaying || loading}
              className="relative overflow-hidden h-14 rounded-xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center hover:bg-white/[0.08] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 group"
            >
              <div className="absolute top-0 left-0 w-full h-[2px] bg-[#8596ff]/30 group-hover:bg-[#8596ff]/50 transition-colors" />
              <div className="flex items-center gap-2 text-frost-white font-roobert text-[13px]">
                {t('hilo.higher')}
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
                {t('hilo.lower')}
                <ChevronDown size={16} className="text-[#ff8a76]" />
              </div>
              <div className="text-[11px] text-[#ff8a76] font-roobert mt-0.5 tracking-wider">
                {lowerProb.toFixed(2)}%
              </div>
            </button>
          </div>
        </section>

        {/* Live History Ticker */}
        <HiloHistory entries={history} currency={currencyLabel} />
      </div>
      
      {/* Hide scrollbar styles injected */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </main>
  );
}
