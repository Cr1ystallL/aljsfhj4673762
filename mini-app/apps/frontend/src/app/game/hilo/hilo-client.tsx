'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, HandCoins, Diamond, Heart, Club, Spade } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-context';
import { api } from '@/lib/api';
import { GameLayout } from '@/components/game/game-layout';

type Card = { suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: number };
type HiloStatus = 'idle' | 'playing' | 'cashed_out' | 'busted';

interface HiloState {
  status: HiloStatus;
  betAmount: number;
  currentMultiplier: number;
  currentCard: Card | null;
  history: Card[];
  nextMultipliers: { red: number; black: number; higher: number; lower: number } | null;
}

function getCardColor(suit: string) {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-slate-800';
}

function getRankName(rank: number) {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return rank.toString();
}

function SuitIcon({ suit, className }: { suit: string, className?: string }) {
  if (suit === 'hearts') return <Heart className={className} fill="currentColor" />;
  if (suit === 'diamonds') return <Diamond className={className} fill="currentColor" />;
  if (suit === 'clubs') return <Club className={className} fill="currentColor" />;
  return <Spade className={className} fill="currentColor" />;
}

export function HiloClient() {
  const router = useRouter();
  const { user, mutateBalance } = useAuth();
  
  const [state, setState] = useState<HiloState | null>(null);
  const [betAmount, setBetAmount] = useState<string>('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch initial state
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.get('/api/games/hilo/state')
      .then((res) => {
        if (res.data?.state) setState(res.data.state);
      })
      .catch((err) => console.error('Failed to fetch hilo state', err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSwap = async () => {
    if (state?.status === 'playing') return;
    try {
      setLoading(true);
      setError('');
      const res = await api.post('/api/games/hilo/swap');
      if (res.data?.state) setState(res.data.state);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to swap');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount < 1) {
      setError('Invalid bet amount');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.post('/api/games/hilo/start', { amount });
      if (res.data?.state) {
        setState(res.data.state);
        mutateBalance();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start');
    } finally {
      setLoading(false);
    }
  };

  const handleGuess = async (choice: 'red' | 'black' | 'higher' | 'lower') => {
    if (state?.status !== 'playing') return;
    try {
      setLoading(true);
      setError('');
      const res = await api.post('/api/games/hilo/guess', { choice });
      if (res.data?.state) {
        setState(res.data.state);
        if (res.data.state.status === 'busted') {
          // You could show a bust animation here
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to guess');
    } finally {
      setLoading(false);
    }
  };

  const handleCashout = async () => {
    if (state?.status !== 'playing') return;
    try {
      setLoading(true);
      setError('');
      const res = await api.post('/api/games/hilo/cashout');
      if (res.data?.state) {
        setState(res.data.state);
        mutateBalance();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cashout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameLayout game="hilo">
      <div className="flex flex-col gap-4">
        {/* Play Area */}
        <div className="relative min-h-[300px] rounded-xl border border-white/10 bg-gradient-to-b from-green-900/40 to-green-950/40 p-6 flex flex-col items-center justify-center">
          
          {error && (
            <div className="absolute top-4 left-4 right-4 rounded bg-red-500/20 border border-red-500/50 p-2 text-center text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Current Card */}
          {state?.currentCard ? (
            <div className={`relative flex h-48 w-32 flex-col justify-between rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/10 transition-all ${getCardColor(state.currentCard.suit)} ${state.status === 'busted' ? 'opacity-50 grayscale' : ''}`}>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">{getRankName(state.currentCard.rank)}</span>
                <SuitIcon suit={state.currentCard.suit} className="w-5 h-5" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <SuitIcon suit={state.currentCard.suit} className="w-20 h-20" />
              </div>
              <div className="flex items-center justify-end gap-1 rotate-180">
                <span className="text-2xl font-bold">{getRankName(state.currentCard.rank)}</span>
                <SuitIcon suit={state.currentCard.suit} className="w-5 h-5" />
              </div>
            </div>
          ) : (
            <div className="flex h-48 w-32 items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5">
              <span className="text-white/40">No Card</span>
            </div>
          )}

          {/* Status Text */}
          <div className="mt-6 h-8 flex items-center justify-center">
            {state?.status === 'busted' && (
              <span className="text-red-400 font-semibold text-lg">Вы проиграли</span>
            )}
            {state?.status === 'cashed_out' && (
              <span className="text-emerald-400 font-semibold text-lg">Выиграно {+(state.betAmount * state.currentMultiplier).toFixed(2)} zl</span>
            )}
            {state?.status === 'playing' && (
              <span className="text-white/80">Текущий множитель: <strong className="text-white">{state.currentMultiplier}x</strong></span>
            )}
          </div>

          {/* History */}
          <div className="mt-4 flex gap-2 h-16 w-full max-w-sm overflow-x-auto p-2 justify-center">
            {state?.history.map((card, idx) => (
              <div key={idx} className={`flex h-12 w-8 shrink-0 flex-col items-center justify-center rounded bg-white shadow ${getCardColor(card.suit)}`}>
                <span className="text-xs font-bold">{getRankName(card.rank)}</span>
                <SuitIcon suit={card.suit} className="w-3 h-3" />
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
          
          {(!state || state.status === 'idle' || state.status === 'cashed_out' || state.status === 'busted') ? (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-white/50 uppercase">Ставка (zl)</label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-lg bg-black/40 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleSwap}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} />
                Swap
              </button>
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-2 font-semibold text-black hover:bg-emerald-400 transition-colors disabled:opacity-50"
              >
                BET
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  onClick={() => handleGuess('red')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-lg bg-red-500/20 border border-red-500/30 p-3 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                >
                  <span className="text-sm font-medium text-red-200">RED</span>
                  <span className="text-xs text-red-300/70">{state.nextMultipliers?.red.toFixed(2) || '1.92'}x</span>
                </button>
                <button
                  onClick={() => handleGuess('black')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-lg bg-slate-800 border border-slate-600 p-3 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <span className="text-sm font-medium text-white">BLACK</span>
                  <span className="text-xs text-white/50">{state.nextMultipliers?.black.toFixed(2) || '1.92'}x</span>
                </button>
                <button
                  onClick={() => handleGuess('higher')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30 p-3 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                >
                  <span className="text-sm font-medium text-blue-200">HIGHER</span>
                  <span className="text-xs text-blue-300/70">{state.nextMultipliers?.higher.toFixed(2) || '1.92'}x</span>
                </button>
                <button
                  onClick={() => handleGuess('lower')}
                  disabled={loading}
                  className="flex flex-col items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30 p-3 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
                >
                  <span className="text-sm font-medium text-amber-200">LOWER</span>
                  <span className="text-xs text-amber-300/70">{state.nextMultipliers?.lower.toFixed(2) || '1.92'}x</span>
                </button>
              </div>

              {state.currentMultiplier > 1.0 && (
                <button
                  onClick={handleCashout}
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 font-semibold text-black hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  <HandCoins size={20} />
                  Забрать {+(state.betAmount * state.currentMultiplier).toFixed(2)} zl
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
