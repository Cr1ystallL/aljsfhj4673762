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
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { PlayingCard, CardData, Suit } from '@/components/game/hilo/playing-card';
import { BlackjackTableChat, ChatMessage } from './blackjack-table-chat';
import { calculateHandValue } from '@/hooks/useBlackjackGame';
import { cn } from '@/lib/utils';

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

const SEATS_CONFIG = [
  { id: 1, label: 'Игрок 1', color: '#9b111e', arcOffset: 'translate-y-0' },
  { id: 2, label: 'Игрок 2', color: '#f37920', arcOffset: 'translate-y-3 sm:translate-y-6' },
  { id: 3, label: 'Игрок 3', color: '#22b14c', arcOffset: 'translate-y-6 sm:translate-y-12' },
  { id: 4, label: 'Игрок 4', color: '#00a2e8', arcOffset: 'translate-y-3 sm:translate-y-6' },
  { id: 5, label: 'Игрок 5', color: '#4f46e5', arcOffset: 'translate-y-0' },
];

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
  const user = useAuthStore((s) => s.user);
  const sessionId = useAuthStore((s) => s.sessionId);
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
        const currentSessionId = sessionId || useAuthStore.getState().sessionId;

        if (currentSessionId) {
          ws?.send(
            JSON.stringify({
              type: 'auth',
              payload: { sessionId: currentSessionId },
              timestamp: Date.now(),
            })
          );
        }

        ws?.send(
          JSON.stringify({
            type: 'game:join',
            payload: { roomId },
            timestamp: Date.now(),
          })
        );

        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', payload: {}, timestamp: Date.now() }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'auth_success') {
            ws?.send(
              JSON.stringify({
                type: 'game:join',
                payload: { roomId },
                timestamp: Date.now(),
              })
            );
          }

          if (data.type === 'bj:state' && data.payload) {
            setState(data.payload);
            setIsActionPending(false);
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
  }, [roomId, sessionId, fetchBalance, isChatOpen]);

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

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    sendWs('blackjack:chat', { roomId, text: text.trim() });
  };

  // Dealer score
  const dealerCardsData = useMemo(() => {
    return state.dealerHand.filter((c) => !c.hidden).map(convertCard);
  }, [state.dealerHand]);

  const dealerScore = useMemo(() => {
    if (dealerCardsData.length === 0) return 0;
    return calculateHandValue(dealerCardsData).total;
  }, [dealerCardsData]);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#05070a] text-frost-white select-none overflow-x-hidden">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#0c0e14]/90 px-3 py-2 sm:px-5 sm:py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              Blackjack Live
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </h1>
            <p className="text-[10px] sm:text-[11px] text-white/40">Стол #1 · 5 мест</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Balance */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 sm:px-3 sm:py-1.5 text-right">
            <span className="text-[9px] sm:text-[10px] uppercase text-white/40 block leading-none mb-0.5">Баланс</span>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-400">{Number(balance || 0).toFixed(2)} zł</span>
          </div>

          {/* Sound */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => {
              setIsChatOpen(true);
              setUnreadChatCount(0);
            }}
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            <MessageSquare size={15} />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Rules */}
          <button
            onClick={() => setShowRules(true)}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/5 text-white/70 hover:bg-white/10"
          >
            <HelpCircle size={15} />
          </button>
        </div>
      </header>

      {/* Main Table Layout */}
      <main className="relative flex flex-1 flex-col items-center justify-between p-2 sm:p-4 max-w-5xl w-full mx-auto">
        {/* =========================================================================
            TABLE FELT: Big horizontal rectangle with rounded corners & beige border
           ========================================================================= */}
        <div className="relative w-full rounded-[28px] sm:rounded-[44px] border-[3px] sm:border-[4px] border-[#c09e79] bg-[#073d1c] p-3 sm:p-6 shadow-[0_16px_50px_rgba(0,0,0,0.85),inset_0_0_80px_rgba(0,0,0,0.45)] flex flex-col justify-between min-h-[440px] sm:min-h-[500px] flex-1 overflow-hidden">
          
          {/* Felt Texture Pattern */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none rounded-[28px] sm:rounded-[44px]" />

          {/* Table Deck Zone (Top Right) */}
          <div className="absolute top-3 sm:top-5 right-3 sm:right-6 z-20">
            <div className="relative w-20 sm:w-28 h-14 sm:h-18 rounded-xl sm:rounded-2xl border-2 sm:border-[2.5px] border-black bg-black/20 flex flex-col items-center justify-center p-1 shadow-md">
              {/* Stacked Face-Down Cards (Rubashka k verkhu) */}
              <div className="relative w-12 sm:w-14 h-8 sm:h-10 flex items-center justify-center mb-0.5">
                {/* Layer 3 */}
                <div className="absolute top-1 left-2.5 w-9 sm:w-11 h-6 sm:h-7 rounded-sm sm:rounded border border-black bg-gradient-to-br from-red-950 via-slate-900 to-red-950 shadow-sm" />
                {/* Layer 2 */}
                <div className="absolute top-0.5 left-1.5 w-9 sm:w-11 h-6 sm:h-7 rounded-sm sm:rounded border border-black bg-gradient-to-br from-red-900 via-slate-800 to-red-900 shadow-sm" />
                {/* Layer 1 (Top card back) */}
                <div className="absolute top-0 left-0.5 w-9 sm:w-11 h-6 sm:h-7 rounded-sm sm:rounded border-2 border-black bg-gradient-to-br from-[#800c14] to-[#40060a] flex items-center justify-center shadow-md">
                  <div className="w-6 h-4 border border-white/20 rounded-xs bg-[radial-gradient(#ffffff_0.5px,transparent_0.5px)] [background-size:3px_3px] opacity-40" />
                </div>
              </div>
              <span className="font-extrabold text-[9px] sm:text-[11px] text-black uppercase tracking-wider drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]">
                Колода
              </span>
            </div>
          </div>

          {/* =========================================================================
              1. TOP CENTER: Large black dealer circle, text "Диллер", 3 card slots
             ========================================================================= */}
          <div className="relative z-10 flex flex-col items-center pt-1 sm:pt-2">
            {/* Large Black Dealer Circle */}
            <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black border-2 sm:border-[3px] border-black text-white shadow-xl">
              <span className="text-sm sm:text-xl font-extrabold tracking-widest text-white/90">D</span>
              {dealerScore > 0 && (
                <span className="absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/90 px-2 py-0.5 text-[9px] sm:text-xs font-bold text-white border border-white/20 shadow-md whitespace-nowrap z-20">
                  {dealerScore}
                </span>
              )}
            </div>

            {/* Label "Диллер" */}
            <span className="font-extrabold text-xs sm:text-sm text-black uppercase tracking-wider mt-1.5 mb-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]">
              Диллер
            </span>

            {/* Dealer 3 Card Slots / Dynamic Card Row (Dealer takes cards up to 17) */}
            <div className="relative flex items-center justify-center min-h-[64px] sm:min-h-[82px] gap-1.5 sm:gap-2 mt-0.5">
              {state.dealerHand.length === 0 ? (
                // 3 Default Card Slots
                <>
                  <div className="h-14 w-9 sm:h-20 sm:w-13 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-black/15 shadow-inner" />
                  <div className="h-14 w-9 sm:h-20 sm:w-13 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-black/15 shadow-inner" />
                  <div className="h-14 w-9 sm:h-20 sm:w-13 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-black/15 shadow-inner" />
                </>
              ) : (
                // Render dealt cards (can be 1, 2, 3, 4, 5+ cards)
                <div className="flex items-center justify-center">
                  {state.dealerHand.map((c, idx) => (
                    <motion.div
                      key={`dealer_${idx}_${c.rank}_${c.suit}`}
                      initial={{ opacity: 0, y: -20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: idx * 0.15 }}
                      className="relative"
                      style={{
                        marginLeft: idx > 0 ? (state.dealerHand.length > 3 ? '-14px' : '6px') : '0px',
                        zIndex: idx + 1,
                      }}
                    >
                      {c.hidden ? (
                        <div className="h-14 w-9 sm:h-20 sm:w-13 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-gradient-to-br from-red-950 via-slate-900 to-red-950 flex items-center justify-center shadow-xl">
                          <Shield size={14} className="text-amber-400/70" />
                        </div>
                      ) : (
                        <PlayingCard card={convertCard(c)} className="h-14 w-9 sm:h-20 sm:w-13 shadow-2xl border-2 border-black rounded-md sm:rounded-lg" />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              2. CENTER NOTIFICATIONS & ROUND PHASE BADGES
             ========================================================================= */}
          <div className="relative z-10 my-auto py-1 text-center flex flex-col items-center justify-center gap-1">
            {state.phase === 'countdown' && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-amber-400 text-black px-3.5 py-1 shadow-lg font-extrabold"
              >
                <Zap size={13} className="text-black animate-bounce" />
                <span className="text-[11px] sm:text-xs">
                  Ставки: <span className="underline">{state.countdown}с</span>
                </span>
              </motion.div>
            )}

            {state.phase === 'dealing' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-emerald-300 text-black px-3 py-0.5 text-[11px] font-extrabold shadow-lg">
                <Sparkles size={13} className="text-black animate-spin" />
                Раздача карт...
              </div>
            )}

            {state.phase === 'player_turn' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-cyan-300 text-black px-3 py-0.5 text-[11px] font-extrabold shadow-lg">
                <span className="h-2 w-2 rounded-full bg-black animate-ping" />
                Ход: Место #{state.currentTurnSeatId}
              </div>
            )}

            {state.phase === 'dealer_turn' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-purple-300 text-black px-3 py-0.5 text-[11px] font-extrabold shadow-lg">
                Ход дилера...
              </div>
            )}

            {state.phase === 'settling' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-emerald-400 text-black px-3 py-0.5 text-[11px] font-extrabold shadow-lg">
                Итоги раунда & выплаты!
              </div>
            )}
          </div>

          {/* =========================================================================
              3. 5 PLAYER SPOTS (ARC AT BOTTOM):
                 - 2 Card Slots on top
                 - Text "Игрок N" in the middle
                 - Large avatar circle with custom color
                 - Betting chip & status around/under avatar
             ========================================================================= */}
          <div className="relative z-10 grid grid-cols-5 gap-1 sm:gap-2.5 w-full items-end pb-1 sm:pb-2">
            {SEATS_CONFIG.map((seat) => {
              const seatId = seat.id;
              const player = state.players.find((p) => p.seatId === seatId);
              const isTurn = state.phase === 'player_turn' && state.currentTurnSeatId === seatId;
              const isMe = user?.id && player?.userId === user.id;

              const playerCardsData = player?.hand.map(convertCard) || [];
              const playerHandScore = playerCardsData.length > 0 ? calculateHandValue(playerCardsData).total : 0;

              return (
                <div
                  key={seatId}
                  className={cn(
                    'flex flex-col items-center min-w-0 transition-transform duration-300',
                    seat.arcOffset
                  )}
                >
                  {/* (A) 2 CARD SLOTS (OR ACTIVE HAND CARDS) */}
                  <div className="relative flex min-h-[58px] sm:min-h-[76px] w-full items-center justify-center mb-1">
                    {player && player.hand.length > 0 ? (
                      <div className="relative flex justify-center items-center">
                        {player.hand.map((c, cardIdx) => (
                          <div
                            key={`card_${seatId}_${cardIdx}`}
                            className="relative"
                            style={{
                              marginLeft: cardIdx > 0 ? '-14px' : '0px',
                              zIndex: cardIdx + 1,
                            }}
                          >
                            <PlayingCard
                              card={convertCard(c)}
                              className="h-13 w-8 sm:h-18 sm:w-12 shadow-2xl border-2 border-black rounded-md sm:rounded-lg"
                            />
                          </div>
                        ))}
                        {/* Score Indicator */}
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black px-1.5 py-0.2 text-[8px] sm:text-[10px] font-bold text-white border border-white/30 shadow-md whitespace-nowrap">
                          {playerHandScore}
                        </span>
                      </div>
                    ) : (
                      // 2 Empty Card Slots with Black Border
                      <div className="flex items-center gap-1">
                        <div className="h-12 w-7 sm:h-16 sm:w-10 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-black/15 shadow-inner" />
                        <div className="h-12 w-7 sm:h-16 sm:w-10 rounded-md sm:rounded-lg border-2 sm:border-[2.5px] border-black bg-black/15 shadow-inner" />
                      </div>
                    )}
                  </div>

                  {/* (B) PLAYER LABEL (Игрок N / Имя игрока) */}
                  <span className="font-extrabold text-[9px] sm:text-[11px] text-black uppercase tracking-wide mb-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)] truncate max-w-[70px] sm:max-w-[100px] text-center">
                    {player ? (isMe ? 'Вы' : player.name) : seat.label}
                  </span>

                  {/* (C) LARGE AVATAR CIRCLE WITH SEAT COLOR & BET ELEMENT UNDER */}
                  <div className="relative flex flex-col items-center">
                    {/* Status Pill floating above Avatar */}
                    {player && player.status !== 'waiting' && player.status !== 'playing' && (
                      <span
                        className={cn(
                          'absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.2 text-[7px] sm:text-[9px] font-extrabold border border-black shadow-md z-30',
                          player.status === 'blackjack'
                            ? 'bg-amber-400 text-black animate-bounce'
                            : player.status === 'bust'
                            ? 'bg-red-600 text-white'
                            : player.status === 'stand'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-black'
                        )}
                      >
                        {player.status === 'blackjack'
                          ? 'BJ!'
                          : player.status === 'bust'
                          ? 'Перебор'
                          : player.status === 'stand'
                          ? 'Хватит'
                          : player.status}
                      </span>
                    )}

                    {/* The Avatar Circle */}
                    <div
                      style={{ backgroundColor: seat.color }}
                      className={cn(
                        'relative flex h-11 w-11 sm:h-16 sm:w-16 items-center justify-center rounded-full border-2 sm:border-[3px] border-black text-white font-black text-xs sm:text-base shadow-lg transition-all overflow-hidden',
                        isTurn && 'ring-4 ring-yellow-300 ring-offset-2 ring-offset-black scale-105 shadow-[0_0_20px_rgba(253,224,71,0.8)]'
                      )}
                    >
                      {player ? (
                        player.avatar ? (
                          <img src={player.avatar} alt={player.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="drop-shadow-md">{player.name.slice(0, 1).toUpperCase()}</span>
                        )
                      ) : (
                        // Empty seat button
                        <button
                          disabled={state.phase !== 'waiting' && state.phase !== 'countdown'}
                          onClick={() => handleJoinSeat(seatId)}
                          className="h-full w-full flex items-center justify-center text-white/80 hover:text-white hover:scale-110 active:scale-90 transition-transform font-bold text-sm sm:text-xl"
                          title="Занять место"
                        >
                          +
                        </button>
                      )}
                    </div>

                    {/* (D) BET CHIP ELEMENT DIRECTLY UNDER AVATAR */}
                    {player && (player.bet > 0 || player.status === 'playing') && (
                      <div className="absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2 z-20">
                        <span className="rounded-full bg-[#ffac2e] text-black font-extrabold text-[8px] sm:text-[10px] px-1.5 py-0.2 border-2 border-black shadow-md whitespace-nowrap block">
                          {Number(player.bet || 0).toFixed(0)} zł
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* =========================================================================
            4. BOTTOM CONTROLS / BETTING HUD
           ========================================================================= */}
        <div className="relative z-20 w-full mt-2 sm:mt-3">
          {/* Turn Action Controls */}
          {isMyTurn ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex items-center gap-2 bg-[#0c0e14]/95 p-2.5 sm:p-3 rounded-2xl border border-amber-500/40 shadow-2xl backdrop-blur-xl"
            >
              <button
                onClick={() => handleAction('hit')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-emerald-500 font-extrabold text-black text-xs sm:text-sm uppercase tracking-wider hover:bg-emerald-400 active:scale-95 transition-transform"
              >
                Еще (Hit)
              </button>
              <button
                onClick={() => handleAction('stand')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-red-600 font-extrabold text-white text-xs sm:text-sm uppercase tracking-wider hover:bg-red-500 active:scale-95 transition-transform"
              >
                Хватит (Stand)
              </button>
              {myPlayer && myPlayer.hand.length === 2 && balance >= myPlayer.bet && (
                <button
                  onClick={() => handleAction('double')}
                  disabled={isActionPending}
                  className="py-3 px-4 rounded-xl bg-amber-400 font-extrabold text-black text-xs sm:text-sm uppercase tracking-wider hover:bg-amber-300 active:scale-95 transition-transform"
                >
                  2× Удвоить
                </button>
              )}
            </motion.div>
          ) : myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') ? (
            /* Seated Player Betting Controls */
            <div className="flex flex-col gap-1.5 sm:gap-2 rounded-2xl border border-white/10 bg-[#0c0e14]/95 p-2.5 sm:p-3 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-semibold text-white/70">
                  Ваша ставка (Место #{myPlayer.seatId}):
                </span>
                <button
                  onClick={handleLeaveSeat}
                  className="text-[10px] sm:text-[11px] text-red-400 hover:underline font-medium"
                >
                  Встать из-за стола
                </button>
              </div>

              {/* Chips row */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto py-0.5 scrollbar-none">
                {CHIP_VALUES.map((val) => (
                  <button
                    key={val}
                    onClick={() => handleUpdateBet(val)}
                    className={cn(
                      'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-[11px] sm:text-xs font-bold border-2 transition-all',
                      selectedBet === val
                        ? 'border-amber-400 bg-amber-500/30 text-amber-300 scale-105 shadow-lg'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          ) : !myPlayer ? (
            /* Spectator Banner */
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c0e14]/90 p-2.5 sm:p-3 shadow-lg">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-white/40" />
                <span className="text-[11px] sm:text-xs text-white/60">
                  Режим зрителя. Нажмите «+» на свободном месте, чтобы сесть за стол.
                </span>
              </div>
              <button
                onClick={() => setIsChatOpen(true)}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white hover:bg-white/20"
              >
                Чат
              </button>
            </div>
          ) : null}
        </div>
      </main>

      {/* Table Chat Slide-up Sheet */}
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
                <p>• Дилер обязан добирать карты до 16 очков и останавливаться на 17 (Dealer stands on 17).</p>
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
