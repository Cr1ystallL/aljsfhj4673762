'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2,
  HelpCircle,
  MessageSquare,
  Users,
  Shield,
  Zap,
  Sparkles,
  Minus,
  Plus,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { PlayingCard, CardData, Suit } from '@/components/game/hilo/playing-card';
import { BlackjackTableChat, ChatMessage } from './blackjack-table-chat';
import { calculateHandValue } from '@/hooks/useBlackjackGame';
import { GameTopBar } from '@/components/game/game-top-bar';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import { toast } from '@/store/toast-store';

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

const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 250, 500];

const SEATS_CONFIG = [
  { id: 1, label: 'Игрок 1', arcOffset: 'translate-y-0' },
  { id: 2, label: 'Игрок 2', arcOffset: 'translate-y-1 sm:translate-y-2' },
  { id: 3, label: 'Игрок 3', arcOffset: 'translate-y-2 sm:translate-y-4' },
  { id: 4, label: 'Игрок 4', arcOffset: 'translate-y-1 sm:translate-y-2' },
  { id: 5, label: 'Игрок 5', arcOffset: 'translate-y-0' },
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
  const token = useAuthStore((s) => s.token);

  const {
    amount: activeBalance,
    isReady: isBalanceReady,
    currencyLabel,
    fetchBalance,
  } = useActiveBalance('blackjack');

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
        const effectiveAuth = sessionId || token || user?.id || 'guest_user';

        ws?.send(
          JSON.stringify({
            type: 'auth',
            payload: { sessionId: effectiveAuth },
            timestamp: Date.now(),
          })
        );

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
  }, [roomId, sessionId, token, user?.id, fetchBalance, isChatOpen]);

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
    if (isBalanceReady && activeBalance < selectedBet) {
      toast.error('Недостаточно средств на балансе!');
      return;
    }
    sendWs('blackjack:join_seat', { roomId, seatId, bet: selectedBet });
    soundManager.play('game.click');
  };

  const handleLeaveSeat = () => {
    sendWs('blackjack:leave_seat', { roomId });
    soundManager.play('game.click');
  };

  const handleUpdateBet = (bet: number) => {
    const validBet = Math.max(1, Math.min(bet, activeBalance > 0 ? activeBalance : 10000));
    setSelectedBet(validBet);
    if (myPlayer) {
      sendWs('blackjack:bet', { roomId, bet: validBet });
      soundManager.play('game.click');
    }
  };

  const handleAction = (action: 'hit' | 'stand' | 'double') => {
    if (!isMyTurn || isActionPending) return;
    setIsActionPending(true);
    sendWs('blackjack:action', { roomId, action });
    soundManager.play('game.click');
  };

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendWs('blackjack:chat', { roomId, text: trimmed });
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
    <main className="relative min-h-screen w-full bg-[#000000] text-frost-white flex flex-col justify-between select-none overflow-x-hidden">
      {/* Top Bar Header */}
      <div className="w-full max-w-[1360px] mx-auto px-3 pt-3">
        <GameTopBar
          title="Blackjack"
          Icon={Gamepad2}
          balance={activeBalance}
          currency={currencyLabel}
          onHowToPlay={() => setShowRules(true)}
        />
      </div>

      {/* Main Table Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-2 sm:p-4 w-full max-w-[1360px] mx-auto">
        
        {/* =========================================================================
            THE GAME TABLE: Dark Velvet Green Felt, Solid Brown Rim, Wide on PC
           ========================================================================= */}
        <section className="relative w-full rounded-[36px] sm:rounded-[54px] border-[5px] sm:border-[7px] border-[#5c3a21] bg-[#032511] p-3 sm:p-5 pb-6 sm:pb-8 shadow-[0_24px_70px_rgba(0,0,0,0.95),inset_0_0_100px_rgba(0,0,0,0.6)] flex flex-col justify-between min-h-[460px] sm:min-h-[540px] flex-1 overflow-hidden">
          
          {/* Subtle Radial Felt Texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(5, 59, 27, 0.6) 0%, rgba(3, 37, 17, 0.95) 75%, rgba(2, 26, 12, 1) 100%)',
            }}
          />

          {/* Center SVG Crown Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <img
              src="/ButtonLogo.svg"
              alt="MacvBet"
              className="w-32 h-32 sm:w-48 sm:h-48 object-contain opacity-20 filter brightness-0 select-none"
            />
          </div>

          {/* =========================================================================
              TOP RIGHT: Deck Spread Out Horizontally Without Border
             ========================================================================= */}
          <div className="absolute top-4 sm:top-6 right-4 sm:right-8 z-20 flex flex-col items-center">
            <div className="flex items-center -space-x-8 sm:-space-x-12">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className="w-10 h-14 sm:w-14 sm:h-20 rounded-md sm:rounded-lg border-2 border-black bg-gradient-to-br from-[#800c14] to-[#3a060a] shadow-lg flex items-center justify-center transition-transform hover:-translate-y-1"
                  style={{ transform: `rotate(${idx * 2 - 5}deg)` }}
                >
                  <div className="w-6 h-10 sm:w-9 sm:h-14 border border-white/20 rounded-xs bg-[radial-gradient(#ffffff_0.5px,transparent_0.5px)] [background-size:3px_3px] opacity-35" />
                </div>
              ))}
            </div>
            <span className="font-extrabold text-[10px] sm:text-xs text-black/80 uppercase tracking-widest mt-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]">
              Колода
            </span>
          </div>

          {/* =========================================================================
              1. TOP CENTER: Large Black Dealer Circle, Text "Диллер", Animated Dealt Cards
             ========================================================================= */}
          <div className="relative z-10 flex flex-col items-center pt-1 sm:pt-2">
            {/* Dealer Avatar */}
            <div className="relative flex h-14 w-14 sm:h-18 sm:w-18 items-center justify-center rounded-full bg-black border-[3px] border-black text-white shadow-2xl">
              <span className="text-sm sm:text-lg font-black tracking-widest text-white/90">D</span>
              {dealerScore > 0 && (
                <span className="absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/95 px-2 py-0.5 text-[9px] sm:text-xs font-black text-white border border-white/20 shadow-md whitespace-nowrap z-20">
                  {dealerScore}
                </span>
              )}
            </div>

            {/* Label "Диллер" */}
            <span className="font-extrabold text-xs sm:text-sm text-black uppercase tracking-wider mt-1.5 mb-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]">
              Диллер
            </span>

            {/* Dealer Hand Cards (Normal Size, animated dealing & flip) */}
            <div className="relative flex items-center justify-center min-h-[84px] sm:min-h-[104px] mt-0.5">
              {state.dealerHand.length > 0 && (
                <div className="flex items-center justify-center">
                  {state.dealerHand.map((c, idx) => (
                    <motion.div
                      key={`dealer_${idx}_${c.rank}_${c.suit}_${c.hidden ? 'h' : 'v'}`}
                      initial={
                        c.hidden
                          ? { opacity: 0, x: 160, y: -160, scale: 0.3, rotate: 20 }
                          : { rotateY: 90, scale: 0.9 }
                      }
                      animate={{ opacity: 1, x: 0, y: 0, rotateY: 0, scale: 1, rotate: 0 }}
                      transition={{
                        type: 'spring',
                        damping: 20,
                        stiffness: 220,
                        delay: idx * 0.12,
                      }}
                      className="relative"
                      style={{
                        marginLeft: idx > 0 ? (state.dealerHand.length > 3 ? '-24px' : '-12px') : '0px',
                        zIndex: idx + 1,
                      }}
                    >
                      {c.hidden ? (
                        <div className="w-[58px] h-[82px] sm:w-[72px] sm:h-[102px] rounded-lg sm:rounded-xl border-2 border-black bg-gradient-to-br from-[#800c14] to-[#3a060a] flex items-center justify-center shadow-2xl">
                          <Shield size={20} className="text-amber-400/70" />
                        </div>
                      ) : (
                        <PlayingCard
                          card={convertCard(c)}
                          className="w-[58px] h-[82px] sm:w-[72px] sm:h-[102px] shadow-2xl border-2 border-black rounded-lg sm:rounded-xl"
                        />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              2. CENTER: Dynamic Phase Badges & Announcements
             ========================================================================= */}
          <div className="relative z-10 my-auto py-1 text-center flex flex-col items-center justify-center gap-1">
            {state.phase === 'countdown' && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-amber-400 text-black px-4 py-1 shadow-lg font-black"
              >
                <Zap size={14} className="text-black animate-bounce" />
                <span className="text-xs sm:text-sm">
                  Ставки: <span className="underline">{state.countdown}с</span>
                </span>
              </motion.div>
            )}

            {state.phase === 'dealing' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-emerald-300 text-black px-3.5 py-0.5 text-xs font-black shadow-lg">
                <Sparkles size={14} className="text-black animate-spin" />
                Раздача карт...
              </div>
            )}

            {state.phase === 'player_turn' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-cyan-300 text-black px-3.5 py-0.5 text-xs font-black shadow-lg">
                <span className="h-2.5 w-2.5 rounded-full bg-black animate-ping" />
                Ход: Место #{state.currentTurnSeatId}
              </div>
            )}

            {state.phase === 'dealer_turn' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-purple-300 text-black px-3.5 py-0.5 text-xs font-black shadow-lg">
                Ход дилера...
              </div>
            )}

            {state.phase === 'settling' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-emerald-400 text-black px-3.5 py-0.5 text-xs font-black shadow-lg">
                Итоги раунда & выплаты!
              </div>
            )}
          </div>

          {/* =========================================================================
              3. 5 PLAYER SPOTS (LIFTED SAFELY WITHIN FELT BOUNDARIES):
                 - Hand cards with deal flight animation
                 - Label "Игрок N"
                 - Dark Neutral Avatar Circles
                 - Bet element and chip around & under avatar
             ========================================================================= */}
          <div className="relative z-10 grid grid-cols-5 gap-1.5 sm:gap-4 w-full items-end pb-1 sm:pb-2">
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
                  {/* (A) DEALT HAND CARDS (with deal animation from deck) */}
                  <div className="relative flex min-h-[82px] sm:min-h-[102px] w-full items-center justify-center mb-1">
                    {player && player.hand.length > 0 && (
                      <div className="relative flex justify-center items-center">
                        {player.hand.map((c, cardIdx) => (
                          <motion.div
                            key={`card_${seatId}_${cardIdx}_${c.rank}_${c.suit}`}
                            initial={{
                              opacity: 0,
                              x: 180,
                              y: -180,
                              scale: 0.25,
                              rotate: -25,
                            }}
                            animate={{
                              opacity: 1,
                              x: 0,
                              y: 0,
                              scale: 1,
                              rotate: 0,
                            }}
                            transition={{
                              type: 'spring',
                              damping: 20,
                              stiffness: 220,
                              delay: cardIdx * 0.1,
                            }}
                            className="relative"
                            style={{
                              marginLeft: cardIdx > 0 ? '-26px' : '0px',
                              zIndex: cardIdx + 1,
                            }}
                          >
                            <PlayingCard
                              card={convertCard(c)}
                              className="w-[58px] h-[82px] sm:w-[72px] sm:h-[102px] shadow-2xl border-2 border-black rounded-lg sm:rounded-xl"
                            />
                          </motion.div>
                        ))}
                        {/* Score Indicator */}
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black px-2 py-0.5 text-[9px] sm:text-xs font-black text-white border border-white/30 shadow-md whitespace-nowrap">
                          {playerHandScore}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* (B) PLAYER LABEL */}
                  <span className="font-extrabold text-[10px] sm:text-xs text-black uppercase tracking-wide mb-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)] truncate max-w-[80px] sm:max-w-[120px] text-center">
                    {player ? (isMe ? 'Вы' : player.name) : seat.label}
                  </span>

                  {/* (C) NEUTRAL AVATAR CIRCLE & BET ELEMENT */}
                  <div className="relative flex flex-col items-center">
                    {/* Status Pill floating above Avatar */}
                    {player && player.status !== 'waiting' && player.status !== 'playing' && (
                      <span
                        className={cn(
                          'absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.2 text-[8px] sm:text-[10px] font-black border border-black shadow-md z-30',
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

                    {/* Neutral Dark Avatar Circle */}
                    <div
                      className={cn(
                        'relative flex h-12 w-12 sm:h-15 sm:w-15 items-center justify-center rounded-full border-[3px] border-black bg-[#101318] text-white font-black text-xs sm:text-base shadow-xl transition-all overflow-hidden',
                        isTurn && 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-black scale-105 shadow-[0_0_25px_rgba(250,204,21,0.9)]',
                        isMe && 'border-emerald-400'
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
                          className="h-full w-full flex items-center justify-center text-white/60 hover:text-white hover:scale-110 active:scale-90 transition-transform font-black text-base sm:text-2xl"
                          title="Занять место"
                        >
                          +
                        </button>
                      )}
                    </div>

                    {/* (D) BET CHIP DIRECTLY UNDER AVATAR */}
                    {player && (player.bet > 0 || player.status === 'playing') && (
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 z-20">
                        <span className="rounded-full bg-[#ffac2e] text-black font-black text-[9px] sm:text-[11px] px-2 py-0.5 border-2 border-black shadow-md whitespace-nowrap block">
                          {Number(player.bet || 0).toFixed(0)} zł
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* =========================================================================
            4. ULTRA-COMPACT & SLEEK BOTTOM CONTROLS
           ========================================================================= */}
        <section className="w-full mt-2 sm:mt-3">
          {/* Active Turn Actions */}
          {isMyTurn ? (
            <div className="flex items-center gap-2 max-w-xl mx-auto">
              <button
                type="button"
                onClick={() => handleAction('hit')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
              >
                ЕЩЁ (Hit)
              </button>
              <button
                type="button"
                onClick={() => handleAction('stand')}
                disabled={isActionPending}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
              >
                ХВАТИТ (Stand)
              </button>
              {myPlayer && myPlayer.hand.length === 2 && (
                <button
                  type="button"
                  onClick={() => handleAction('double')}
                  disabled={isActionPending}
                  className="py-3 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                >
                  2× УДВОИТЬ
                </button>
              )}
            </div>
          ) : myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') ? (
            /* Seated Player Sleek Compact Single-Line Bet Bar */
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#0e1117]/95 p-2 px-3 shadow-xl backdrop-blur-md">
              {/* Stepper */}
              <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 rounded-xl px-2 py-1">
                <button
                  type="button"
                  onClick={() => handleUpdateBet(Math.max(1, selectedBet - 5))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
                >
                  <Minus size={14} />
                </button>
                <div className="px-2 text-center min-w-[70px]">
                  <span className="text-xs font-black text-amber-400">{selectedBet} zł</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateBet(selectedBet + 5)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/70"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Chips row */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
                {CHIP_VALUES.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleUpdateBet(val)}
                    className={cn(
                      'flex h-8 w-8 sm:h-8.5 sm:w-8.5 shrink-0 items-center justify-center rounded-full text-[11px] font-black border transition-all',
                      selectedBet === val
                        ? 'border-amber-400 bg-amber-500/30 text-amber-300 scale-105 shadow-md'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>

              {/* Stand up button */}
              <button
                type="button"
                onClick={handleLeaveSeat}
                className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={13} />
                Встать
              </button>
            </div>
          ) : !myPlayer ? (
            /* Spectator Panel */
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c0e14]/90 p-2 px-3 shadow-lg">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-white/40" />
                <span className="text-xs text-white/70">
                  Режим зрителя · Нажмите «+» на свободном месте за столом
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="relative rounded-xl bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20 transition-colors flex items-center gap-1.5"
              >
                <MessageSquare size={13} />
                Чат
                {unreadChatCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black animate-bounce">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {/* Floating Chat Open Button (if seated) */}
      {myPlayer && (
        <button
          type="button"
          onClick={() => {
            setIsChatOpen(true);
            setUnreadChatCount(0);
          }}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#151922] border border-white/15 text-white shadow-2xl hover:scale-105 transition-transform"
        >
          <MessageSquare size={18} />
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-black animate-bounce">
              {unreadChatCount}
            </span>
          )}
        </button>
      )}

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
                <h3 className="text-sm font-bold text-white">Правила Blackjack</h3>
                <button onClick={() => setShowRules(false)} className="text-white/50 hover:text-white">
                  ✕
                </button>
              </div>
              <div className="space-y-2 text-white/70 leading-relaxed">
                <p>• Наберите сумму очков ближе к 21, чем у дилера, не превышая 21.</p>
                <p>• Карты 2–10 считаются по номиналу, картинки (J, Q, K) — по 10 очков, Туз — 1 или 11.</p>
                <p>• Blackjack (Туз + 10 с раздачи) оплачивается 3 к 2 (2.5×).</p>
                <p>• Дилер обязан добирать карты до 16 очков и останавливаться на 17 (Dealer stands on 17).</p>
                <p>• Доступны действия: Еще (Hit), Хватит (Stand), Удвоить (Double).</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-bold"
              >
                Понятно
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
