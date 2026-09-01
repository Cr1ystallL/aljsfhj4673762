'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { GameTopBar } from '@/components/game/game-top-bar';
import { Trophy, Users, RotateCcw } from 'lucide-react';
import { Pressable } from '@/components/ui/pressable';
import { MacvpotRoulette } from '@/components/game/macvpot/macvpot-roulette';
import { MacvpotTotemWinner } from '@/components/game/macvpot/macvpot-totem-winner';
import { MacvpotHistory } from '@/components/game/macvpot/macvpot-history';
import { toast } from '@/store/toast-store';
import { useBalance } from '@/hooks/use-balance';
import { useAuthStore } from '@/store/auth-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { useT } from '@/i18n/use-t';
import {
  BetPanelCtaRow,
  BetPanelShell,
  GamePrimaryButton,
  StakeField,
} from '@/components/game/kit';

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
  const { t, localeTag } = useT();
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
    soundManager.initialize();
    soundManager.register('cases.tick', { src: '/audio/tick.mp3', category: 'sfx' });
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
          toast.warn(t('macvpot.refund'));
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
  }, [fetchBalance, isSpinning, loadState, t, wsUrl]);

  // Phase Countdown timer (synced with server timestamp to handle clock drift)
  useEffect(() => {
    if (!state?.phaseEndsAt || state.phase !== 'betting') {
      setTimeLeft(0);
      return;
    }

    const serverNow = state.timestamp || Date.now();
    const remainingMsOnServer = state.phaseEndsAt - serverNow;

    if (remainingMsOnServer <= 0) {
      setTimeLeft(0);
      return;
    }

    const clientTargetEndsAt = Date.now() + remainingMsOnServer;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((clientTargetEndsAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);

    return () => clearInterval(interval);
  }, [state?.phaseEndsAt, state?.timestamp, state?.phase]);

  const userBet = state?.bets.find((b) => b.userId === user?.id);
  const isBettingPhase = state?.phase === 'betting';

  // Handle Bet placement
  const handlePlaceBet = async () => {
    const amountNum = parseInt(betAmount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.warn(t('common.enterStake'));
      return;
    }

    if (amountNum > (balance?.amount ?? 0)) {
      toast.warn(t('errors.insufficientBalance'));
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
        toast.error(data.error || t('macvpot.betError'));
      } else {
        toast.success(t('macvpot.betPlaced'));
        void fetchBalance();
        await loadState();
      }
    } catch {
      toast.error(t('macvpot.networkError'));
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
        toast.error(data.error || t('macvpot.cancelError'));
      } else {
        toast.success(t('macvpot.cancelled'));
        void fetchBalance();
        await loadState();
      }
    } catch {
      toast.error(t('macvpot.networkError'));
    } finally {
      setIsSubmitting(false);
    }
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

        <BetPanelShell>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 relative">
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-[0.18em] text-whisper-gray font-roobert">
                {t('macvpot.pot')}
              </span>
              <span className="mt-1 font-roobert text-[22px] font-light tabular-nums text-frost-white tracking-tight">
                {(state?.totalPot || 0).toLocaleString(localeTag)}{' '}
                <span className="text-xs text-white/45 font-normal">zł</span>
              </span>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10">
              {state?.phase === 'spinning' ? (
                <span className="text-[#F4E8C8]/80 text-[11px] uppercase tracking-[0.28em] font-roobert">
                  {t('macvpot.spinning')}
                </span>
              ) : !state?.bets || state.bets.length < 2 ? (
                <span className="text-[11px] text-white/45 text-center tracking-wide max-w-[140px] sm:max-w-[200px] font-roobert">
                  {t('macvpot.minPlayers')}
                </span>
              ) : (
                <span
                  className={
                    timeLeft <= 3
                      ? 'text-frost-white text-[28px] sm:text-[34px] font-roobert font-light tabular-nums tracking-tight'
                      : 'text-frost-white/80 text-[24px] sm:text-[30px] font-roobert font-light tabular-nums tracking-tight'
                  }
                >
                  {timeLeft}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-white/10 text-xs text-white/65 font-roobert">
              <Users size={13} className="text-white/35" />
              <span className="tabular-nums">{state?.playerCount || 0}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert px-4 pt-3">
            <span>{t('macvpot.yourStake')}</span>
            {userBet && (
              <span className="text-[#F4E8C8]/80 normal-case tracking-normal text-xs">
                {t('macvpot.yourBet', { amount: userBet.amount, chance: userBet.chance })}
              </span>
            )}
          </div>

          {!userBet ? (
            <>
              <div className="px-4 py-3">
                <StakeField
                  amount={parseFloat(betAmount) || 10}
                  onAmountChange={(next) => setBetAmount(String(Math.max(10, Math.round(next))))}
                  minBet={10}
                  maxBet={Math.max(10, Math.floor(balance?.amount ?? 10))}
                  disabled={!isBettingPhase || isSubmitting}
                  label={t('common.bet')}
                  decreaseLabel={t('common.decreaseBet')}
                  increaseLabel={t('common.increaseBet')}
                />
              </div>
              <BetPanelCtaRow>
                <GamePrimaryButton
                  onClick={handlePlaceBet}
                  disabled={!isBettingPhase || isSubmitting}
                  tone={isBettingPhase && !isSubmitting ? 'solid' : 'muted'}
                >
                  {t('common.placeBet')}
                </GamePrimaryButton>
              </BetPanelCtaRow>
            </>
          ) : (
            <div className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex flex-col">
                <span className="text-xs text-white/50">{t('macvpot.accepted')}</span>
                <span className="text-base font-roobert font-light tabular-nums text-frost-white">
                  {userBet.amount} zł{' '}
                  <span className="text-xs text-white/55">({userBet.chance}%)</span>
                </span>
              </div>

              {isBettingPhase && (
                <Pressable
                  disabled={isSubmitting}
                  onClick={handleCancelBet}
                  className="px-4 py-2.5 rounded-pill bg-frost-white text-midnight-canvas font-roobert text-[11px] uppercase tracking-[0.16em] inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <RotateCcw size={14} />
                  {t('macvpot.cancel')}
                </Pressable>
              )}
            </div>
          )}
        </BetPanelShell>

        <div className="w-full flex flex-col gap-2.5 mt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert flex items-center gap-1.5">
              <Users size={13} className="text-white/35" />
              {t('macvpot.allBets', { n: state?.bets.length || 0 })}
            </h3>
            <span className="text-[11px] text-white/35 font-roobert">{t('macvpot.chancesLive')}</span>
          </div>

          {state?.bets && state.bets.length > 0 ? (
            <BetPanelShell>
              <div className="grid grid-cols-12 px-4 py-3 border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-whisper-gray font-roobert">
                <div className="col-span-5 sm:col-span-6">{t('macvpot.participant')}</div>
                <div className="col-span-4 sm:col-span-3 text-right">{t('macvpot.stake')}</div>
                <div className="col-span-3 text-right">{t('macvpot.chance')}</div>
              </div>

              {state.bets.map((p) => {
                const name = p.user?.firstName || p.user?.username || t('macvpot.player');
                const initial = name.charAt(0).toUpperCase();

                return (
                  <div
                    key={p.betId}
                    className="grid grid-cols-12 px-4 py-3.5 items-center relative overflow-hidden border-t border-white/5 first:border-t-0"
                  >
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-white/[0.03] pointer-events-none"
                      style={{ width: `${Math.min(100, p.chance)}%` }}
                    />

                    <div className="col-span-5 sm:col-span-6 flex items-center gap-3 z-10">
                      <div className="w-8 h-8 rounded-full bg-[#121214] border border-white/12 flex items-center justify-center overflow-hidden shrink-0">
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
                          <span className="text-white/70 font-roobert text-xs">{initial}</span>
                        )}
                      </div>
                      <span className="font-roobert text-xs sm:text-sm text-frost-white truncate max-w-[110px] sm:max-w-[200px]">
                        {name}
                      </span>
                    </div>

                    <div className="col-span-4 sm:col-span-3 text-right font-roobert tabular-nums text-frost-white text-xs sm:text-sm z-10">
                      {p.amount.toLocaleString(localeTag)}{' '}
                      <span className="text-[10px] font-normal text-white/45">zł</span>
                    </div>

                    <div className="col-span-3 text-right z-10">
                      <span className="font-roobert tabular-nums text-xs sm:text-sm text-frost-white/90 bg-white/[0.05] px-2.5 py-1 rounded-pill border border-white/10">
                        {p.chance}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </BetPanelShell>
          ) : (
            <BetPanelShell>
              <div className="w-full py-10 text-center text-xs text-white/40 flex flex-col items-center gap-2">
                <Trophy size={22} className="text-white/20" />
                <span>{t('macvpot.noBets')}</span>
              </div>
            </BetPanelShell>
          )}
        </div>
      </div>
    </main>
  );
}
