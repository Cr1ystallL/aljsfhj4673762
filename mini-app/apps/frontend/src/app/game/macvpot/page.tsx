'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { GameTopBar } from '@/components/game/game-top-bar';
import { Trophy, Users, Clock, Flame, RotateCcw, AlertCircle } from 'lucide-react';
import { MacvpotRoulette } from '@/components/game/macvpot/macvpot-roulette';
import { MacvpotWinnerModal } from '@/components/game/macvpot/macvpot-winner-modal';
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
  const [showWinnerModal, setShowWinnerModal] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial REST state
  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/games/macvpot/state', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    void fetchBalance();
    void loadState();
  }, [fetchBalance, loadState]);

  // WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Join room
      ws.send(JSON.stringify({ type: 'game:join', payload: { roomId: 'macvpot_main' } }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'macvpot:state') {
          const newState = msg.payload as MacvpotState;
          setState(newState);

          if (newState.phase === 'spinning' && !isSpinning) {
            setIsSpinning(true);
          } else if (newState.phase === 'completed' && newState.winner) {
            setShowWinnerModal(true);
            void fetchBalance();
          } else if (newState.phase === 'betting') {
            setIsSpinning(false);
          }
        } else if (msg.type === 'macvpot:bet_placed') {
          soundManager.play('game.bet_placed');
          void fetchBalance();
        } else if (msg.type === 'macvpot:refund') {
          toast.warn('В раунде остался 1 игрок. Ставка возвращена.');
          void fetchBalance();
        }
      } catch {}
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'game:leave', payload: { roomId: 'macvpot_main' } }));
        ws.close();
      }
    };
  }, [fetchBalance, isSpinning]);

  // Countdown timer handler
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
        toast.success('Ставка сделана!');
        void fetchBalance();
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
        toast.success('Ставка отменена, баланс возвращен');
        void fetchBalance();
      }
    } catch {
      toast.error('Ошибка сети');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#0a0714] text-frost-white relative overflow-x-hidden">
      <div className="mx-auto w-full max-w-[800px] px-3 pt-3 pb-28 flex flex-col gap-4">
        <GameTopBar title="MacvPot" Icon={Trophy} />

        {/* Jackpot Header & Status Card */}
        <div className="w-full rounded-3xl border border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-black/50 to-indigo-950/40 p-5 backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />

          {/* Bank & Players */}
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-300 flex items-center gap-1.5">
              <Flame size={15} className="text-amber-400" />
              Общий Банк
            </span>
            <div className="text-3xl sm:text-4xl font-black text-amber-400 font-roobert tracking-tight">
              {(state?.totalPot || 0).toLocaleString('ru-RU')} <span className="text-xl font-medium">монет</span>
            </div>
            <div className="text-xs text-white/50 flex items-center gap-1.5 mt-0.5">
              <Users size={14} className="text-purple-400" />
              Участников: <span className="font-bold text-white">{state?.playerCount || 0}</span>
            </div>
          </div>

          {/* Phase Countdown Timer */}
          <div className="flex flex-col items-center sm:items-end gap-1 bg-white/[0.03] border border-white/10 px-4 py-2.5 rounded-2xl w-full sm:w-auto">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1">
              <Clock size={13} className="text-purple-400" />
              {state?.phase === 'betting' && 'Сбор ставок'}
              {state?.phase === 'delay' && 'Ожидание спина'}
              {state?.phase === 'spinning' && 'Вращение'}
              {state?.phase === 'completed' && 'Завершен'}
            </span>
            <span className="text-xl font-bold font-mono text-purple-300">
              {state?.phase === 'betting' && `${timeLeft}с`}
              {state?.phase === 'delay' && `${timeLeft}с`}
              {state?.phase === 'spinning' && 'Рулетка...'}
              {state?.phase === 'completed' && 'Победитель!'}
            </span>
          </div>
        </div>

        {/* Horizontal Roulette */}
        <MacvpotRoulette
          bets={state?.bets || []}
          winningTicket={state?.winningTicket || null}
          winnerUserId={state?.winner?.userId || null}
          isSpinning={state?.phase === 'spinning'}
          spinDurationMs={state?.spinDurationMs || 12000}
          onSpinComplete={() => {
            setShowWinnerModal(true);
          }}
        />

        {/* Betting Controls Box */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/50">
              Ваша ставка
            </span>
            {userBet && (
              <span className="text-xs font-semibold text-purple-400">
                Ваша ставка внесена: {userBet.amount} монет ({userBet.chance}%)
              </span>
            )}
          </div>

          {!userBet ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={!isBettingPhase || isSubmitting}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="Ставка"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-semibold focus:border-purple-500 focus:outline-none transition-all disabled:opacity-50"
                />

                <button
                  disabled={!isBettingPhase || isSubmitting}
                  onClick={handlePlaceBet}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-purple-900/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                >
                  Вступить в Jackpot
                </button>
              </div>

              {/* Quick Amount Shortcuts */}
              <div className="grid grid-cols-5 gap-2">
                {[10, 50, 100, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    disabled={!isBettingPhase || isSubmitting}
                    onClick={() => setBetAmount(String(amt))}
                    className="py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-purple-950/30 border border-purple-500/20 p-3 rounded-xl">
              <div className="flex flex-col text-xs">
                <span className="text-white/60">Вы зашли с суммой:</span>
                <span className="text-sm font-bold text-amber-400">{userBet.amount} монет ({userBet.chance}%)</span>
              </div>

              {isBettingPhase && (
                <button
                  disabled={isSubmitting}
                  onClick={handleCancelBet}
                  className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  Отменить ставку
                </button>
              )}
            </div>
          )}
        </div>

        {/* Participants Table */}
        <div className="w-full flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={14} className="text-purple-400" />
              Участники раунда ({state?.bets.length || 0})
            </h3>
            <span className="text-[11px] text-white/40">Шансы обновляются в реальном времени</span>
          </div>

          {state?.bets && state.bets.length > 0 ? (
            <div className="w-full rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="grid grid-cols-12 px-4 py-2.5 border-b border-white/5 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                <div className="col-span-6">Игрок</div>
                <div className="col-span-3 text-right">Ставка</div>
                <div className="col-span-3 text-right">Шанс</div>
              </div>

              <div className="divide-y divide-white/5">
                {state.bets.map((p) => {
                  const name = p.user?.firstName || p.user?.username || 'Игрок';
                  const initial = name.charAt(0).toUpperCase();

                  return (
                    <div
                      key={p.betId}
                      className="grid grid-cols-12 px-4 py-3 items-center text-xs hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="col-span-6 flex items-center gap-2.5 overflow-hidden">
                        <div className="w-7 h-7 rounded-full bg-purple-950 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0">
                          {p.user?.photoUrl ? (
                            <Image
                              src={p.user.photoUrl}
                              alt={name}
                              width={28}
                              height={28}
                              className="object-cover w-full h-full"
                              unoptimized
                            />
                          ) : (
                            <span className="text-white font-bold text-xs">{initial}</span>
                          )}
                        </div>
                        <span className="font-semibold text-white truncate">{name}</span>
                      </div>

                      <div className="col-span-3 text-right font-medium text-amber-400">
                        {p.amount.toLocaleString('ru-RU')} монет
                      </div>

                      <div className="col-span-3 text-right font-bold text-purple-300">
                        {p.chance}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="w-full py-8 text-center text-xs text-white/40 border border-white/5 bg-white/[0.02] rounded-2xl">
              Ставок пока нет. Будьте первым!
            </div>
          )}
        </div>

        {/* History Section */}
        <div className="w-full flex flex-col gap-2 mt-4">
          <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider px-1">
            История MacvPot
          </h3>
          <MacvpotHistory history={state?.history || []} />
        </div>
      </div>

      {/* Winner Celebration Overlay */}
      <MacvpotWinnerModal
        winner={state?.winner || null}
        isOpen={showWinnerModal}
        onClose={() => setShowWinnerModal(false)}
      />
    </main>
  );
}
