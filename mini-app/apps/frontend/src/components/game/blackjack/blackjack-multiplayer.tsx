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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { PlayingCard, CardData, Suit } from '@/components/game/hilo/playing-card';
import { BlackjackTableChat, ChatMessage } from './blackjack-table-chat';
import { calculateHandValue } from '@/hooks/useBlackjackGame';
import { GameTopBar } from '@/components/game/game-top-bar';
import {
  BetPanelShell,
  StakeField,
  GamePrimaryButton,
  BetPanelCtaRow,
} from '@/components/game/kit';
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
  { id: 2, label: 'Игрок 2', arcOffset: 'translate-y-4 sm:translate-y-8' },
  { id: 3, label: 'Игрок 3', arcOffset: 'translate-y-8 sm:translate-y-16' },
  { id: 4, label: 'Игрок 4', arcOffset: 'translate-y-4 sm:translate-y-8' },
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
    setSelectedBet(bet);
    if (myPlayer) {
      sendWs('blackjack:bet', { roomId, bet });
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

      {/* Main Wide Table Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-2 sm:p-4 w-full max-w-[1360px] mx-auto">
        
        {/* =========================================================================
            THE GAME TABLE: Dark Velvet Green Felt, Solid Brown Rim, Wide on PC
           ========================================================================= */}
        <section className="relative w-full rounded-[36px] sm:rounded-[54px] border-[5px] sm:border-[7px] border-[#5c3a21] bg-[#032511] p-3 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.95),inset_0_0_100px_rgba(0,0,0,0.6)] flex flex-col justify-between min-h-[460px] sm:min-h-[560px] flex-1 overflow-hidden">
          
          {/* Subtle Radial Felt Texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(5, 59, 27, 0.6) 0%, rgba(3, 37, 17, 0.95) 75%, rgba(2, 26, 12, 1) 100%)',
            }}
          />

          {/* Center Hollow Outline Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <span
              className="font-black text-4xl sm:text-7xl uppercase tracking-[0.25em] select-none text-transparent opacity-25"
              style={{
                WebkitTextStroke: '2px #000000',
                letterSpacing: '0.25em',
              }}
            >
              MACVBET
            </span>
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
              1. TOP CENTER: Large Black Dealer Circle, Text "Диллер", Dealt Cards (NO wireframe slots)
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
            <span className="font-extrabold text-xs sm:text-sm text-black uppercase tracking-wider mt-1.5 mb-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]">
              Диллер
            </span>

            {/* Dealer Hand Cards (Normal Size, dynamically rendered, NO empty slots) */}
            <div className="relative flex items-center justify-center min-h-[68px] sm:min-h-[96px] mt-0.5">
              {state.dealerHand.length > 0 && (
                <div className="flex items-center justify-center">
                  {state.dealerHand.map((c, idx) => (
                    <motion.div
                      key={`dealer_${idx}_${c.rank}_${c.suit}`}
                      initial={{ opacity: 0, y: -25, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: idx * 0.15 }}
                      className="relative"
                      style={{
                        marginLeft: idx > 0 ? (state.dealerHand.length > 3 ? '-20px' : '-10px') : '0px',
                        zIndex: idx + 1,
                      }}
                    >
                      {c.hidden ? (
                        <div className="w-14 h-20 sm:w-18 sm:h-26 rounded-lg sm:rounded-xl border-2 border-black bg-gradient-to-br from-[#800c14] to-[#3a060a] flex items-center justify-center shadow-2xl">
                          <Shield size={18} className="text-amber-400/70" />
                        </div>
                      ) : (
                        <PlayingCard
                          card={convertCard(c)}
                          className="w-14 h-20 sm:w-18 sm:h-26 shadow-2xl border-2 border-black rounded-lg sm:rounded-xl"
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
              3. 5 PLAYER SPOTS (ARC AT BOTTOM):
                 - Hand cards directly on table (normal size, NO empty wireframe slots)
                 - Label "Игрок N"
                 - Dark Neutral Avatar Circles (NOT rainbow)
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
                  {/* (A) DEALT HAND CARDS (NO empty placeholder slots) */}
                  <div className="relative flex min-h-[64px] sm:min-h-[92px] w-full items-center justify-center mb-1">
                    {player && player.hand.length > 0 && (
                      <div className="relative flex justify-center items-center">
                        {player.hand.map((c, cardIdx) => (
                          <div
                            key={`card_${seatId}_${cardIdx}`}
                            className="relative"
                            style={{
                              marginLeft: cardIdx > 0 ? '-22px' : '0px',
                              zIndex: cardIdx + 1,
                            }}
                          >
                            <PlayingCard
                              card={convertCard(c)}
                              className="w-13 h-18 sm:w-17 sm:h-24 shadow-2xl border-2 border-black rounded-lg sm:rounded-xl"
                            />
                          </div>
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
                        'relative flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full border-[3px] border-black bg-[#101318] text-white font-black text-xs sm:text-base shadow-xl transition-all overflow-hidden',
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
                      <div className="absolute -bottom-2.5 sm:-bottom-3 left-1/2 -translate-x-1/2 z-20">
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
            4. CONTROLS HUD (COMPLIANT WITH PROJECT KIT)
           ========================================================================= */}
        <section className="w-full mt-3 sm:mt-4">
          {/* Active Turn Actions */}
          {isMyTurn ? (
            <div className="flex items-center gap-3">
              <GamePrimaryButton
                onClick={() => handleAction('hit')}
                disabled={isActionPending}
                tone="solid"
                className="flex-1 py-3 text-sm font-black"
              >
                ЕЩЁ (Hit)
              </GamePrimaryButton>
              <GamePrimaryButton
                onClick={() => handleAction('stand')}
                disabled={isActionPending}
                tone="muted"
                className="flex-1 py-3 text-sm font-black bg-red-600/30 border-red-500/50 hover:bg-red-600/40 text-red-200"
              >
                ХВАТИТ (Stand)
              </GamePrimaryButton>
              {myPlayer && myPlayer.hand.length === 2 && (
                <GamePrimaryButton
                  onClick={() => handleAction('double')}
                  disabled={isActionPending}
                  tone="solid"
                  className="py-3 px-6 text-sm font-black bg-amber-400 text-black hover:bg-amber-300"
                >
                  2× УДВОИТЬ
                </GamePrimaryButton>
              )}
            </div>
          ) : myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') ? (
            /* Seated Player Betting Panel */
            <BetPanelShell>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2 p-3">
                <StakeField
                  amount={selectedBet}
                  onAmountChange={(val) => handleUpdateBet(Number(val))}
                  minBet={1}
                  maxBet={Math.max(1, Math.floor(activeBalance) || 1)}
                  label={`Ставка (Место #${myPlayer.seatId})`}
                  decreaseLabel="Уменьшить"
                  increaseLabel="Увеличить"
                />

                {/* Quick Chips row */}
                <div className="flex items-center justify-between gap-1 overflow-x-auto py-1 scrollbar-none">
                  {CHIP_VALUES.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleUpdateBet(val)}
                      className={cn(
                        'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold border transition-all',
                        selectedBet === val
                          ? 'border-amber-400 bg-amber-500/30 text-amber-300 scale-105 shadow-md'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      )}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <BetPanelCtaRow>
                <button
                  type="button"
                  onClick={handleLeaveSeat}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors font-semibold"
                >
                  Встать из-за стола
                </button>
              </BetPanelCtaRow>
            </BetPanelShell>
          ) : !myPlayer ? (
            /* Spectator Panel */
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0c0e14]/90 p-3 shadow-lg">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-white/40" />
                <span className="text-xs text-white/70">
                  Режим зрителя. Нажмите «+» на свободном месте за столом, чтобы сыграть.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="relative rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition-colors flex items-center gap-1.5"
              >
                <MessageSquare size={14} />
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
