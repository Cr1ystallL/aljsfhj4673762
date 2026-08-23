'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  MessageSquare,
  Volume2,
  VolumeX,
  HelpCircle,
  Users,
  Shield,
  Zap,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { PlayingCard, CardData, Suit, Rank } from '@/components/game/hilo/playing-card';
import { BlackjackTableChat, ChatMessage } from './blackjack-table-chat';
import { calculateHandValue } from '@/hooks/useBlackjackGame';

export interface BJCard {
  suit: Suit;
  rank: string;
  hidden?: boolean;
}

export interface BJPlayer {
  userId: string;
  name: string;
  avatar?: string;
  seatId: number;
  hand: BJCard[];
  bet: number;
  status: 'waiting' | 'playing' | 'stand' | 'bust' | 'blackjack' | 'surrender' | 'doubled';
}

export type BJPhase = 'waiting' | 'countdown' | 'dealing' | 'player_turn' | 'dealer_turn' | 'settling' | 'finished';

export interface BJState {
  roomId: string;
  phase: BJPhase;
  countdown: number;
  dealerHand: BJCard[];
  players: BJPlayer[];
  currentTurnSeatId: number | null;
  roundId: string;
}

const CHIP_VALUES = [1, 5, 10, 25, 100, 250, 500];

function convertCard(c: BJCard): CardData {
  let rankNum = 10;
  if (c.rank === 'A') rankNum = 1;
  else if (c.rank === 'K') rankNum = 13;
  else if (c.rank === 'Q') rankNum = 12;
  else if (c.rank === 'J') rankNum = 11;
  else rankNum = parseInt(c.rank, 10) || 10;

  return {
    suit: c.suit,
    rank: rankNum,
  };
}

export function BlackjackMultiplayer() {
  const router = useRouter();
  const { user } = useAuthStore();
  const balance = useBalanceStore((s) => s.balance);
  const fetchBalance = useBalanceStore((s) => s.fetchBalance);

  const [roomId] = useState('bj_table_1');
  const [state, setState] = useState<BJState>({
    roomId: 'bj_table_1',
    phase: 'waiting',
    countdown: 12,
    dealerHand: [],
    players: [],
    currentTurnSeatId: null,
    roundId: '',
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRules, setShowRules] = useState(false);

  // User's selected bet for their seat
  const [selectedBet, setSelectedBet] = useState(10);
  const [isActionPending, setIsActionPending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Determine user's seat
  const myPlayer = useMemo(() => {
    if (!user?.id) return null;
    return state.players.find((p) => p.userId === user.id) || null;
  }, [state.players, user?.id]);

  const isMyTurn = useMemo(() => {
    if (!myPlayer || state.phase !== 'player_turn') return false;
    return state.currentTurnSeatId === myPlayer.seatId;
  }, [myPlayer, state.currentTurnSeatId, state.phase]);

  // WebSocket connection & messaging
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Authenticate
        const sessionId = document.cookie
          .split('; ')
          .find((row) => row.startsWith('macvbet_session='))
          ?.split('=')[1];

        if (sessionId) {
          ws?.send(
            JSON.stringify({
              type: 'auth',
              payload: { sessionId },
              timestamp: Date.now(),
            })
          );
        }

        // Join room
        ws?.send(
          JSON.stringify({
            type: 'game:join',
            payload: { roomId },
            timestamp: Date.now(),
          })
        );

        // Ping loop
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', payload: {}, timestamp: Date.now() }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'bj:state' && data.payload) {
            setState(data.payload);
            setIsActionPending(false);
            // Refresh balance on settling
            if (data.payload.phase === 'settling') {
              void fetchBalance();
            }
          }

          if (data.type === 'blackjack:chat:history' && data.payload?.messages) {
            setChatMessages(data.payload.messages);
          }

          if (data.type === 'blackjack:chat:message' && data.payload) {
            setChatMessages((prev) => [...prev, data.payload]);
            if (!isChatOpen) {
              setUnreadChatCount((c) => c + 1);
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      ws?.close();
    };
  }, [roomId, fetchBalance, isChatOpen]);

  // Actions
  const sendWs = useCallback((type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type,
          payload,
          timestamp: Date.now(),
        })
      );
    }
  }, []);

  const handleJoinSeat = (seatId: number) => {
    if (balance < selectedBet) {
      alert('Недостаточно средств на балансе!');
      return;
    }
    sendWs('blackjack:join_seat', { roomId, seatId, bet: selectedBet });
  };

  const handleLeaveSeat = () => {
    sendWs('blackjack:leave_seat', { roomId });
  };

  const handleUpdateBet = (bet: number) => {
    setSelectedBet(bet);
    if (myPlayer) {
      sendWs('blackjack:bet', { roomId, bet });
    }
  };

  const handleAction = (action: 'hit' | 'stand' | 'double') => {
    if (!isMyTurn || isActionPending) return;
    setIsActionPending(true);
    sendWs('blackjack:action', { roomId, action });
  };

  const handleSendMessage = (text: string, emoji?: string) => {
    sendWs('blackjack:chat', { roomId, text, emoji });
  };

  // Convert cards for value calculate
  const dealerCardsData = useMemo(() => {
    return state.dealerHand.filter((c) => !c.hidden).map(convertCard);
  }, [state.dealerHand]);

  const dealerScore = useMemo(() => {
    if (dealerCardsData.length === 0) return 0;
    return calculateHandValue(dealerCardsData).total;
  }, [dealerCardsData]);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#07090e] text-frost-white select-none overflow-x-hidden">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0c0e14]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
              Blackjack Live
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </h1>
            <p className="text-[11px] text-white/40">Стол #1 · 5 мест</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Balance */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-right">
            <span className="text-[10px] uppercase text-white/40 block leading-none mb-0.5">Баланс</span>
            <span className="text-xs font-bold text-emerald-400">{Number(balance || 0).toFixed(2)} zł</span>
          </div>

          {/* Sound */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => {
              setIsChatOpen(true);
              setUnreadChatCount(0);
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            <MessageSquare size={16} />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Rules */}
          <button
            onClick={() => setShowRules(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </header>

      {/* Main Table Felt */}
      <main className="relative flex flex-1 flex-col items-center justify-between p-4 overflow-hidden">
        {/* Table Felt Background Graphic */}
        <div className="absolute inset-x-2 top-2 bottom-32 rounded-3xl border-2 border-emerald-500/20 bg-gradient-to-b from-[#0b3323] via-[#092218] to-[#06140e] shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] pointer-events-none">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="absolute inset-x-12 top-24 bottom-12 rounded-full border border-dashed border-emerald-400/20 pointer-events-none" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-20">
            <span className="text-xl font-bold tracking-[0.3em] uppercase text-emerald-300">MACVBET BLACKJACK</span>
            <p className="text-[10px] tracking-widest text-emerald-400">BLACKJACK PAYS 3 TO 2 · DEALER MUST DRAW TO 16</p>
          </div>
        </div>

        {/* 1. DEALER AREA */}
        <div className="relative z-10 mt-4 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-emerald-500/40 text-emerald-400 text-xs font-bold shadow-lg">
              D
            </div>
            <span className="text-xs font-bold tracking-wider text-emerald-200 uppercase">Дилер</span>
            {dealerScore > 0 && (
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white border border-white/10 shadow-md">
                {dealerScore}
              </span>
            )}
          </div>

          {/* Dealer Cards */}
          <div className="flex items-center justify-center min-h-[96px] gap-2">
            {state.dealerHand.length === 0 ? (
              <div className="h-24 w-16 rounded-xl border border-dashed border-emerald-500/30 flex items-center justify-center">
                <span className="text-[10px] text-emerald-500/40 font-bold uppercase">Шуз</span>
              </div>
            ) : (
              state.dealerHand.map((c, idx) => (
                <motion.div
                  key={`dealer_${idx}_${c.rank}_${c.suit}`}
                  initial={{ opacity: 0, y: -40, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.15 }}
                >
                  {c.hidden ? (
                    <div className="h-24 w-16 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-900 to-amber-950 flex items-center justify-center shadow-xl">
                      <Shield size={20} className="text-amber-400/60" />
                    </div>
                  ) : (
                    <PlayingCard card={convertCard(c)} className="h-24 w-16 shadow-2xl" />
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* 2. PHASE BANNER / STATUS */}
        <div className="relative z-10 my-4 text-center">
          {state.phase === 'countdown' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/20 px-4 py-1.5 shadow-lg backdrop-blur-md"
            >
              <Zap size={14} className="text-amber-400 animate-bounce" />
              <span className="text-xs font-bold text-amber-300">
                Делайте ставки: <span className="text-white text-sm">{state.countdown}с</span>
              </span>
            </motion.div>
          )}

          {state.phase === 'dealing' && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-300 shadow-lg">
              <Sparkles size={14} className="text-emerald-400 animate-spin" />
              Раздача карт...
            </div>
          )}

          {state.phase === 'player_turn' && (
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/20 px-4 py-1.5 text-xs font-bold text-cyan-300 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              Ход игрока за Местом {state.currentTurnSeatId}
            </div>
          )}

          {state.phase === 'dealer_turn' && (
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/20 px-4 py-1.5 text-xs font-bold text-purple-300 shadow-lg">
              Дилер добирает карты...
            </div>
          )}

          {state.phase === 'settling' && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/30 px-4 py-1.5 text-xs font-bold text-emerald-200 shadow-lg">
              Выплаты и итоги раунда!
            </div>
          )}
        </div>

        {/* 3. 5 PLAYER SEATS ARC */}
        <div className="relative z-10 grid grid-cols-5 gap-2 w-full max-w-2xl px-2 my-auto">
          {[1, 2, 3, 4, 5].map((seatId) => {
            const player = state.players.find((p) => p.seatId === seatId);
            const isTurn = state.phase === 'player_turn' && state.currentTurnSeatId === seatId;
            const isMe = user?.id && player?.userId === user.id;

            const playerCardsData = player?.hand.map(convertCard) || [];
            const playerHandScore = playerCardsData.length > 0 ? calculateHandValue(playerCardsData).total : 0;

            return (
              <div key={seatId} className="flex flex-col items-center">
                {/* Hand Cards */}
                <div className="relative flex min-h-[85px] w-full items-center justify-center mb-1">
                  {player && player.hand.length > 0 && (
                    <div className="relative flex justify-center items-center">
                      {player.hand.map((c, cardIdx) => (
                        <div
                          key={`card_${seatId}_${cardIdx}`}
                          className="relative"
                          style={{
                            marginLeft: cardIdx > 0 ? '-24px' : '0px',
                            zIndex: cardIdx + 1,
                          }}
                        >
                          <PlayingCard card={convertCard(c)} className="h-20 w-14 shadow-2xl" />
                        </div>
                      ))}
                      {/* Score Indicator */}
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white border border-white/20 shadow-md whitespace-nowrap">
                        {playerHandScore}
                      </span>
                    </div>
                  )}
                </div>

                {/* Seat Box */}
                {player ? (
                  <div
                    className={`relative flex flex-col items-center justify-center rounded-2xl p-2 w-full transition-all ${
                      isTurn
                        ? 'ring-2 ring-amber-400 bg-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.5)] scale-105'
                        : isMe
                        ? 'border border-emerald-500/50 bg-emerald-950/40'
                        : 'border border-white/10 bg-black/40'
                    }`}
                  >
                    {/* Status Pill */}
                    {player.status !== 'waiting' && player.status !== 'playing' && (
                      <span
                        className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold shadow-md ${
                          player.status === 'blackjack'
                            ? 'bg-amber-500 text-black'
                            : player.status === 'bust'
                            ? 'bg-red-500 text-white'
                            : player.status === 'stand'
                            ? 'bg-blue-500 text-white'
                            : 'bg-white/20 text-white'
                        }`}
                      >
                        {player.status === 'blackjack'
                          ? 'Blackjack!'
                          : player.status === 'bust'
                          ? 'Перебор'
                          : player.status === 'stand'
                          ? 'Хватит'
                          : player.status}
                      </span>
                    )}

                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white font-bold text-xs mb-1 border border-white/10 overflow-hidden">
                      {player.avatar ? (
                        <img src={player.avatar} alt={player.name} className="h-full w-full object-cover" />
                      ) : (
                        player.name.slice(0, 1).toUpperCase()
                      )}
                    </div>

                    <span className="text-[10px] font-medium text-white truncate max-w-full block">
                      {isMe ? 'Вы' : player.name}
                    </span>

                    <span className="text-[9px] font-bold text-amber-300">
                      {Number(player.bet || 0).toFixed(2)} zł
                    </span>
                  </div>
                ) : (
                  <button
                    disabled={state.phase !== 'waiting' && state.phase !== 'countdown'}
                    onClick={() => handleJoinSeat(seatId)}
                    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-3 w-full hover:border-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                  >
                    <span className="text-xs font-bold text-emerald-400">+</span>
                    <span className="text-[9px] font-semibold text-white/60">Место {seatId}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. BOTTOM CONTROLS & ACTION HUD */}
        <div className="relative z-20 w-full max-w-lg mt-auto pt-2">
          {/* If it's my turn to act */}
          {isMyTurn ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-2 bg-[#0c0e14]/95 p-3 rounded-2xl border border-amber-500/40 shadow-2xl backdrop-blur-xl"
            >
              <button
                onClick={() => handleAction('hit')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-emerald-500 font-bold text-black text-sm uppercase tracking-wider hover:bg-emerald-400 active:scale-95 transition-transform"
              >
                Еще (Hit)
              </button>
              <button
                onClick={() => handleAction('stand')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-red-600 font-bold text-white text-sm uppercase tracking-wider hover:bg-red-500 active:scale-95 transition-transform"
              >
                Хватит (Stand)
              </button>
              {myPlayer && myPlayer.hand.length === 2 && balance >= myPlayer.bet && (
                <button
                  onClick={() => handleAction('double')}
                  disabled={isActionPending}
                  className="py-3 px-4 rounded-xl bg-amber-500 font-bold text-black text-sm uppercase tracking-wider hover:bg-amber-400 active:scale-95 transition-transform"
                >
                  2×
                </button>
              )}
            </motion.div>
          ) : myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') ? (
            /* Seated Player Betting Controls */
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0c0e14]/95 p-3 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/70">
                  Ваша ставка (Место {myPlayer.seatId}):
                </span>
                <button
                  onClick={handleLeaveSeat}
                  className="text-[11px] text-red-400 hover:underline font-medium"
                >
                  Встать из-за стола
                </button>
              </div>

              {/* Chips row */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
                {CHIP_VALUES.map((val) => (
                  <button
                    key={val}
                    onClick={() => handleUpdateBet(val)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 transition-all ${
                      selectedBet === val
                        ? 'border-amber-400 bg-amber-500/30 text-amber-300 scale-110 shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          ) : !myPlayer ? (
            /* Spectator Banner */
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c0e14]/90 p-3 shadow-lg">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-white/40" />
                <span className="text-xs text-white/60">
                  Вы в режиме зрителя. Займите свободное место.
                </span>
              </div>
              <button
                onClick={() => setIsChatOpen(true)}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Чат
              </button>
            </div>
          ) : null}
        </div>
      </main>

      {/* Table Chat Drawer */}
      <BlackjackTableChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        currentUserId={user?.id}
        userSeatId={myPlayer?.seatId}
      />

      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full rounded-2xl border border-white/10 bg-[#0e1118] p-5 shadow-2xl text-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold text-white">Правила Blackjack Live</h3>
                <button onClick={() => setShowRules(false)} className="text-white/50 hover:text-white">
                  ✕
                </button>
              </div>
              <div className="space-y-2 text-white/70">
                <p>• Цель игры — набрать сумму очков ближе к 21, чем у дилера, не превышая 21.</p>
                <p>• Карты 2–10 считаются по номиналу, картинки (J, Q, K) — по 10 очков, Туз — 1 или 11.</p>
                <p>• Blackjack (Туз + 10 с раздачи) оплачивается 3 к 2 (2.5×).</p>
                <p>• Дилер обязан добирать карты до 16 очков и останавливаться на 17+.</p>
                <p>• Доступны действия: Еще (Hit), Хватит (Stand), Удвоить (Double).</p>
              </div>
              <button
                onClick={() => setShowRules(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-bold"
              >
                Понятно
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
