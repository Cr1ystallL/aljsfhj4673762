'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { GameTopBar } from '@/components/game/game-top-bar';
import { Trophy, Users, Clock, Flame, RotateCcw, Sparkles } from 'lucide-react';
import { MacvpotRoulette } from '@/components/game/macvpot/macvpot-roulette';
import { MacvpotTotemWinner } from '@/components/game/macvpot/macvpot-totem-winner';
import { MacvpotHistory } from '@/components/game/macvpot/macvpot-history';
import { toast } from '@/store/toast-store';
import { useBalance } from '@/hooks/use-balance';
import { useAuthStore } from '@/store/auth-store';
import { soundManager } from '@/lib/sound/sound-manager';

export type MacvpotPhase = 'betting' | 'delay' | 'spinning' | 'completed';

export interface MacvpotParticipant {
  betId: string;
  userId: string;
  amount: number;
  ticketStart: number;
  ticketEnd: number;
  chance: number;
  placedAt: number;
  user: {
    firstName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
}

export interface MacvpotHistoryRow {
  roundId: string;
  totalPot: number;
  playerCount: number;
  winningTicket: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  winner: {
    userId: string;
    name: string;
    photoUrl: string | null;
    betAmount: number;
    chance: number;
    payout: number;
  } | null;
  endedAt: number;
}

export interface MacvpotState {
  roundId: string;
  phase: MacvpotPhase;
  totalPot: number;
  playerCount: number;
  bets: MacvpotParticipant[];
  winningTicket: number | null;
  winner: MacvpotHistoryRow['winner'] | null;
  phaseEndsAt: number | null;
  serverSeedHash: string;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: number;
  spinStartedAt?: number | null;
  spinDurationMs: number;
  history: MacvpotHistoryRow[];
  timestamp: number;
}

export default function MacvpotPage() {
  const { user } = useAuthStore();
  const { balance, fetchBalance } = useBalance();

  const [state, setState] = useState<MacvpotState | null>(null);
  const [betAmount, setBetAmount] = useState<string>('100');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [showWinnerBanner, setShowWinnerBanner] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch REST state snapshot
  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/games/macvpot/state', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState((prev) => {
            // Keep winner banner when completed
            if (data.state.phase === 'completed' && data.state.winner) {
              setShowWinnerBanner(true);
            } else if (data.state.phase === 'betting' && prev?.phase === 'completed') {
              setShowWinnerBanner(false);
            }
            return data.state;
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    void fetchBalance();
    void loadState();

    // Fallback sync polling every 2.5s
    const pollInterval = setInterval(() => {
      void loadState();
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [fetchBalance, loadState]);

  const wsUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    let base = baseRaw.replace(/\/$/, '');
    if (!base.endsWith('/api')) {
      base = base.replace(/\/ws$/, '');
    }
    return base.endsWith('/api/ws') ? base : `${base.replace(/\/api$/, '')}/api/ws`;
  }, []);

  // WebSocket Live Connection
  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const sessionId = useAuthStore.getState().sessionId;
      if (sessionId) {
        ws.send(JSON.stringify({ type: 'auth', payload: { sessionId }, timestamp: Date.now() }));
      } else {
        ws.send(JSON.stringify({ type: 'game:join', payload: { roomId: 'macvpot_main' } }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'auth_success') {
          ws.send(JSON.stringify({ type: 'game:join', payload: { roomId: 'macvpot_main' } }));
        } else if (msg.type === 'macvpot:state') {
          const newState = msg.payload as MacvpotState;
          setState(newState);

          if (newState.phase === 'spinning' && !isSpinning) {
            setIsSpinning(true);
          } else if (newState.phase === 'completed' && newState.winner) {
            setShowWinnerBanner(true);
            void fetchBalance();
          } else if (newState.phase === 'betting') {
            setIsSpinning(false);
            setShowWinnerBanner(false);
          }
        } else if (msg.type === 'macvpot:bet_placed') {
          soundManager.play('game.bet_placed');
          void fetchBalance();
          void loadState();
        } else if (msg.type === 'macvpot:refund') {
          toast.warn('В раунде остался 1 игрок. Ставка возвращена.');
          void fetchBalance();
          void loadState();
        }
      } catch {}
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'game:leave', payload: { roomId: 'macvpot_main' } }));
        ws.close();
      }
    };
  }, [fetchBalance, isSpinning, loadState, wsUrl]);

  // Phase Countdown timer
  useEffect(() => {
    if (!state?.phaseEndsAt) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((state.phaseEndsAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 200);

    return () => clearInterval(interval);
  }, [state?.phaseEndsAt]);

  const userBet = state?.bets.find((b) => b.userId === user?.userId);
  const isBettingPhase = state?.phase === 'betting';

  // Handle Bet placement
  const handlePlaceBet = async () => {
    const amountNum = parseInt(betAmount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.warn('Введите корректную сумму ставки');
      return;
    }

    if (amountNum > balance) {
      toast.warn('Недостаточно средств на балансе');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/games/macvpot/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: amountNum }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Ошибка при размещении ставки');
      } else {
        toast.success('Ставка принята!');
        void fetchBalance();
        await loadState();
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Bet cancellation
  const handleCancelBet = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/games/macvpot/cancel-bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Ошибка отмены ставки');
      } else {
        toast.success('Ставка отменена!');
        void fetchBalance();
        await loadState();
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preset bet helpers (1/2 and 2X)
  const handleHalf = () => {
    const current = parseInt(betAmount, 10) || 0;
    setBetAmount(String(Math.max(10, Math.floor(current / 2))));
  };

  const handleDouble = () => {
    const current = parseInt(betAmount, 10) || 0;
    setBetAmount(String(Math.max(10, current * 2)));
  };

  return (
    <main className="min-h-screen w-full bg-black text-frost-white relative overflow-x-hidden selection:bg-amber-400 selection:text-black">
      {/* MINECRAFT TOTEM OF UNDYING WINNER ACTIVATION ANIMATION */}
      <MacvpotTotemWinner
        winner={state?.winner || null}
        isOpen={showWinnerBanner}
        onClose={() => setShowWinnerBanner(false)}
      />

      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4">
        {/* 1. TOP BAR */}
        <GameTopBar title="MacvPot" Icon={Trophy} />

        {/* 2. ИСТОРИЯ ПРОШЛЫХ РАУНДОВ */}
        <MacvpotHistory history={state?.history || []} />

        {/* 3. РУЛЕТКА */}
        <MacvpotRoulette
          roundId={state?.roundId || 'init'}
          bets={state?.bets || []}
          winningTicket={state?.winningTicket || null}
          winnerUserId={state?.winner?.userId || null}
          isSpinning={state?.phase === 'spinning'}
          spinDurationMs={state?.spinDurationMs || 12000}
          onSpinComplete={() => {
            setShowWinnerBanner(true);
          }}
        />

        {/* 4. ЭЛЕМЕНТ ДЛЯ НАСТРОЙКИ СТАВКИ (LIQUID GLASS STYLE) */}
        <div className="w-full rounded-3xl border border-white/10 bg-[#0d0d12]/90 p-5 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] flex flex-col gap-4 relative overflow-hidden">
          {/* Top Info Bar inside Betting Element */}
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3 relative">
            {/* Left: Total Pot */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                <Flame size={16} className="animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Общий Банк
                </span>
                <span className="text-lg sm:text-xl font-black text-amber-400 font-roobert tracking-tight">
                  {(state?.totalPot || 0).toLocaleString('ru-RU')} <span className="text-xs text-white/50 font-normal">zł</span>
                </span>
              </div>
            </div>

            {/* Center: Timer Numbers (No Borders, Clean Typography, 3-Red, 2-Yellow, 1-Green) */}
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
              {state?.phase === 'spinning' ? (
                <span className="text-amber-400 text-sm font-black uppercase tracking-widest animate-pulse">
                  Вращение...
                </span>
              ) : !state?.bets || state.bets.length === 0 ? (
                <span className="text-xs font-semibold text-white/40 text-center tracking-wide">
                  Ожидание первого игрока...
                </span>
              ) : (
                <span
                  className={
                    timeLeft === 3
                      ? 'text-red-500 text-3xl font-black font-mono scale-125 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] transition-all'
                      : timeLeft === 2
                      ? 'text-amber-400 text-3xl font-black font-mono scale-125 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)] transition-all'
                      : timeLeft === 1
                      ? 'text-emerald-400 text-3xl font-black font-mono scale-125 drop-shadow-[0_0_15px_rgba(16,185,129,0.8)] transition-all'
                      : 'text-white text-2xl font-black font-mono tracking-wider'
                  }
                >
                  {timeLeft}s
                </span>
              )}
            </div>

            {/* Right: Players Count */}
            <div className="flex items-center gap-1.5 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white/70 font-bold">
              <Users size={14} className="text-white/40" />
              <span>{state?.playerCount || 0}</span>
            </div>
          </div>

          {/* Bet Input & Controls */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-bold text-white/50 uppercase tracking-wider px-1">
              <span>Сумма вашей ставки</span>
              {userBet && (
                <span className="text-amber-400 font-semibold">
                  Ваша ставка: {userBet.amount} zł ({userBet.chance}%)
                </span>
              )}
            </div>

            {!userBet ? (
              <div className="flex flex-col gap-3">
                {/* Input Row: 1/2 on left, Input in center (with zł suffix), 2X on right */}
                <div className="flex items-center gap-2">
                  {/* Left: 1/2 button */}
                  <button
                    disabled={!isBettingPhase || isSubmitting}
                    onClick={handleHalf}
                    className="px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 text-xs font-bold text-white/80 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                  >
                    1/2
                  </button>

                  {/* Center: Input field with zł suffix */}
                  <div className="relative w-full">
                    <input
                      type="number"
                      disabled={!isBettingPhase || isSubmitting}
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="Сумма"
                      className="w-full bg-black/60 border border-white/15 rounded-2xl pl-4 pr-10 py-3.5 text-white font-bold text-base focus:border-amber-400/50 focus:bg-black focus:outline-none transition-all disabled:opacity-50 text-center"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/40 pointer-events-none">
                      zł
                    </span>
                  </div>

                  {/* Right: 2X button */}
                  <button
                    disabled={!isBettingPhase || isSubmitting}
                    onClick={handleDouble}
                    className="px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/10 text-xs font-bold text-white/80 active:scale-95 transition-all disabled:opacity-40 shrink-0"
                  >
                    2X
                  </button>
                </div>

                {/* Bottom: Full-width Place Bet Button (Liquid Glass Dark Gray Style) */}
                <button
                  disabled={!isBettingPhase || isSubmitting}
                  onClick={handlePlaceBet}
                  className="w-full py-4 rounded-2xl bg-gradient-to-b from-white/10 via-white/[0.05] to-black/60 border border-white/20 hover:border-white/40 text-white font-extrabold text-base tracking-wide shadow-[0_4px_20px_rgba(255,255,255,0.06),inset_0_1px_1px_rgba(255,255,255,0.25)] hover:shadow-[0_6px_25px_rgba(255,255,255,0.12),inset_0_1px_2px_rgba(255,255,255,0.4)] hover:bg-white/[0.12] active:scale-[0.98] transition-all backdrop-blur-xl disabled:opacity-40 disabled:pointer-events-none mt-1 flex items-center justify-center gap-2 group"
                >
                  <Sparkles size={16} className="text-white/60 group-hover:text-amber-400 transition-colors" />
                  <span>Поставить</span>
                </button>
              </div>
            ) : (
              /* User Bet Active Card */
              <div className="w-full flex items-center justify-between bg-white/[0.03] border border-white/10 p-3.5 rounded-2xl">
                <div className="flex flex-col">
                  <span className="text-xs text-white/60">Ваша ставка принята</span>
                  <span className="text-base font-black text-amber-400">
                    {userBet.amount} zł <span className="text-xs font-bold text-white/70">({userBet.chance}%)</span>
                  </span>
                </div>

                {isBettingPhase && (
                  <button
                    disabled={isSubmitting}
                    onClick={handleCancelBet}
                    className="px-4 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-red-950/50"
                  >
                    <RotateCcw size={14} />
                    Отменить
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. СПИСОК ВСЕХ СТАВОК (КТО ПОСТАВИЛ, СКОЛЬКО, КАКИЕ ШАНСЫ) */}
        <div className="w-full flex flex-col gap-2.5 mt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
              <Users size={14} className="text-white/40" />
              Все ставки раунда ({state?.bets.length || 0})
            </h3>
            <span className="text-[11px] text-white/40 font-medium">Шансы считаются в реальном времени</span>
          </div>

          {state?.bets && state.bets.length > 0 ? (
            <div className="w-full rounded-3xl border border-white/10 bg-[#0d0d12]/90 overflow-hidden backdrop-blur-xl shadow-xl flex flex-col divide-y divide-white/5">
              {/* Header */}
              <div className="grid grid-cols-12 px-4 py-3 bg-black/40 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <div className="col-span-5 sm:col-span-6">Участник</div>
                <div className="col-span-4 sm:col-span-3 text-right">Ставка</div>
                <div className="col-span-3 text-right">Шанс</div>
              </div>

              {/* Rows */}
              {state.bets.map((p) => {
                const name = p.user?.firstName || p.user?.username || 'Игрок';
                const initial = name.charAt(0).toUpperCase();

                return (
                  <div
                    key={p.betId}
                    className="grid grid-cols-12 px-4 py-3.5 items-center hover:bg-white/[0.02] transition-colors relative overflow-hidden group"
                  >
                    {/* Chance Progress Underlay Bar */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-white/[0.04] pointer-events-none transition-all duration-500"
                      style={{ width: `${Math.min(100, p.chance)}%` }}
                    />

                    {/* Avatar & Name */}
                    <div className="col-span-5 sm:col-span-6 flex items-center gap-3 z-10">
                      <div className="w-8 h-8 rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                        {p.user?.photoUrl ? (
                          <Image
                            src={p.user.photoUrl}
                            alt={name}
                            width={32}
                            height={32}
                            className="object-cover w-full h-full"
                            unoptimized
                          />
                        ) : (
                          <span className="text-white font-bold text-xs">{initial}</span>
                        )}
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[110px] sm:max-w-[200px]">
                        {name}
                      </span>
                    </div>

                    {/* Bet Amount */}
                    <div className="col-span-4 sm:col-span-3 text-right font-black text-amber-400 text-xs sm:text-sm z-10">
                      {p.amount.toLocaleString('ru-RU')} <span className="text-[10px] font-normal text-white/50">zł</span>
                    </div>

                    {/* Chance % */}
                    <div className="col-span-3 text-right z-10">
                      <span className="font-extrabold text-xs sm:text-sm text-white/90 bg-white/[0.06] px-2.5 py-1 rounded-xl border border-white/10 shadow-inner">
                        {p.chance}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full py-10 text-center text-xs text-white/40 border border-white/5 bg-[#0d0d12]/90 rounded-3xl flex flex-col items-center gap-2">
              <Trophy size={28} className="text-white/20" />
              <span>Ставок в этом раунде пока нет. Сделайте первую ставку!</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
