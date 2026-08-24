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
  Trophy,
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

const CHIP_VALUES = [10, 25, 50, 100, 250, 500];
const CHIP_DENOMINATIONS = [500, 250, 100, 50, 25, 10] as const;

function getChipStack(totalBet: number): number[] {
  if (!totalBet || totalBet <= 0) return [];
  let remaining = Math.round(totalBet);
  const stack: number[] = [];

  for (const denom of CHIP_DENOMINATIONS) {
    while (remaining >= denom && stack.length < 5) {
      stack.push(denom);
      remaining -= denom;
    }
  }

  if (remaining > 0 && stack.length < 5) {
    stack.push(10);
  }

  return stack;
}

function getChipImage(amount: number): string {
  if (amount >= 500) return '/BlackJack/500.png';
  if (amount >= 250) return '/BlackJack/250.png';
  if (amount >= 100) return '/BlackJack/100.png';
  if (amount >= 50) return '/BlackJack/50.png';
  if (amount >= 25) return '/BlackJack/25.png';
  return '/BlackJack/10.png';
}

const SEATS_CONFIG = [
  { id: 1, label: 'Игрок 1', arcOffset: 'translate-y-0' },
  { id: 2, label: 'Игрок 2', arcOffset: 'translate-y-1 sm:translate-y-2' },
  { id: 3, label: 'Игрок 3', arcOffset: 'translate-y-2 sm:translate-y-3' },
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

  // User's selected bet for their seat (min 10)
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

  // Dealer score
  const dealerCardsData = useMemo(() => {
    return state.dealerHand.filter((c) => !c.hidden).map(convertCard);
  }, [state.dealerHand]);

  const dealerScore = useMemo(() => {
    if (dealerCardsData.length === 0) return 0;
    return calculateHandValue(dealerCardsData).total;
  }, [dealerCardsData]);

  // Compute outcome for each seated player during settlement
  const getPlayerOutcome = useCallback((player: BJPlayer) => {
    if (state.phase !== 'settling' && state.phase !== 'finished') return null;
    // If player did not participate in the dealt round (e.g. AFK or bet exceeded balance)
    if (player.status === 'waiting' || !player.hand || player.hand.length === 0) {
      return null;
    }
    const pValue = calculateHandValue(player.hand.map(convertCard)).total;
    const isDealerBust = dealerScore > 21;
    const isPlayerBust = player.status === 'bust' || pValue > 21;
    const isPlayerBJ = player.status === 'blackjack' || (player.hand.length === 2 && pValue === 21);
    const isDealerBJ = state.dealerHand.length === 2 && dealerScore === 21;

    if (isPlayerBust) return 'lose';
    if (isPlayerBJ && !isDealerBJ) return 'blackjack';
    if (isDealerBJ && !isPlayerBJ) return 'lose';
    if (isDealerBust) return 'win';
    if (pValue > dealerScore) return 'win';
    if (pValue === dealerScore) return 'push';
    return 'lose';
  }, [state.phase, dealerScore, state.dealerHand.length]);

  const myOutcome = useMemo(() => {
    if (!myPlayer) return null;
    return getPlayerOutcome(myPlayer);
  }, [myPlayer, getPlayerOutcome]);

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

  const handleLeaveSeat = useCallback(() => {
    sendWs('blackjack:leave_seat', { roomId });
    soundManager.play('game.click');
  }, [roomId, sendWs]);

  // REST state fallback loader
  const loadStateSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/blackjack/state?roomId=${roomId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
        }
        if (data.chat) {
          setChatMessages(data.chat);
        }
      }
    } catch {}
  }, [roomId]);

  // Audio system initialization and registration
  useEffect(() => {
    void soundManager.initialize();
    soundManager.register('bj.card_slide', {
      src: '/BlackJack/audio/card_slide.mp3',
      category: 'sfx',
      volume: 0.75,
      preload: true,
    });
    soundManager.register('bj.chip_click', {
      src: '/BlackJack/audio/chip_click.mp3',
      category: 'sfx',
      volume: 0.7,
      preload: true,
    });
    soundManager.register('bj.win', {
      src: '/BlackJack/audio/win.mp3',
      category: 'sfx',
      volume: 0.85,
      preload: true,
    });
  }, []);

  // Card slide & Win sound tracking
  const prevCardsCountRef = useRef<number>(0);
  const prevPhaseRef = useRef<string>('waiting');

  useEffect(() => {
    const totalCards =
      state.dealerHand.length +
      state.players.reduce((sum, p) => sum + (p.hand?.length || 0), 0);

    if (totalCards > prevCardsCountRef.current && totalCards > 0) {
      soundManager.play('bj.card_slide');
    }
    prevCardsCountRef.current = totalCards;

    if (
      (state.phase === 'settling' || state.phase === 'finished') &&
      prevPhaseRef.current !== 'settling' &&
      prevPhaseRef.current !== 'finished'
    ) {
      if (myOutcome === 'win' || myOutcome === 'blackjack') {
        soundManager.play('bj.win');
      }
    }
    prevPhaseRef.current = state.phase;
  }, [state.dealerHand.length, state.players, state.phase, myOutcome]);

  // Initial load & fallback sync
  useEffect(() => {
    void loadStateSnapshot();
    const pollInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void loadStateSnapshot();
      }
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [loadStateSnapshot]);

  // Cleanup on unmount (leave seat so player does not bet AFK when navigating away)
  useEffect(() => {
    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'blackjack:leave_seat',
            payload: { roomId },
            timestamp: Date.now(),
          })
        );
      }
    };
  }, [roomId]);

  // WebSocket connection & messaging
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed || typeof window === 'undefined') return;

      const baseRaw =
        process.env.NEXT_PUBLIC_WS_URL ||
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
      let base = baseRaw.replace(/\/$/, '');
      if (!base.endsWith('/api')) {
        base = base.replace(/\/ws$/, '');
      }
      const wsUrl = base.endsWith('/api/ws') ? base : `${base.replace(/\/api$/, '')}/api/ws`;

      try {
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
              if (data.payload.phase === 'settling' || data.payload.phase === 'finished') {
                void fetchBalance();
                setTimeout(() => void fetchBalance(), 1000);
                setTimeout(() => void fetchBalance(), 2500);
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
          if (!isDisposed) {
            setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          try {
            ws?.close();
          } catch {}
        };
      } catch {
        if (!isDisposed) {
          setTimeout(connect, 4000);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      if (pingInterval) clearInterval(pingInterval);
      ws?.close();
    };
  }, [roomId, sessionId, token, user?.id, fetchBalance, isChatOpen]);

  const handleJoinSeat = (seatId: number) => {
    if (isBalanceReady && activeBalance < selectedBet) {
      toast.error('Недостаточно средств на балансе!');
      return;
    }
    sendWs('blackjack:join_seat', { roomId, seatId, bet: selectedBet });
    soundManager.play('bj.chip_click');
  };

  const handleUpdateBet = (bet: number) => {
    const validBet = Math.max(10, Math.min(bet, activeBalance > 0 ? activeBalance : 10000));
    setSelectedBet(validBet);
    soundManager.play('bj.chip_click');
    if (myPlayer) {
      sendWs('blackjack:bet', { roomId, bet: validBet });
    }
  };

  const handleAction = (action: 'hit' | 'stand' | 'double') => {
    if (!isMyTurn || isActionPending) return;
    setIsActionPending(true);
    sendWs('blackjack:action', { roomId, action });
    if (action === 'hit') {
      soundManager.play('bj.card_slide');
    } else if (action === 'double') {
      soundManager.play('bj.chip_click');
      soundManager.play('bj.card_slide');
    } else {
      soundManager.play('ui.click');
    }
  };

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendWs('blackjack:chat', { roomId, text: trimmed });
  };

  return (
    <main className="relative min-h-screen w-full bg-[#000000] text-frost-white flex flex-col justify-between select-none overflow-x-hidden pb-12 sm:pb-6">
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
        <section className="relative w-full rounded-[36px] sm:rounded-[54px] border-[5px] sm:border-[7px] border-[#5c3a21] bg-[#032511] p-3 sm:p-5 pb-8 sm:pb-12 shadow-[0_24px_70px_rgba(0,0,0,0.95),inset_0_0_100px_rgba(0,0,0,0.6)] flex flex-col justify-between min-h-[500px] sm:min-h-[580px] flex-1 overflow-hidden">
          
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
              className="w-36 h-36 sm:w-56 sm:h-56 object-contain opacity-20 filter brightness-0 select-none"
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
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center">
              <div className="h-full w-full rounded-full bg-black border-[3px] border-black text-white shadow-2xl overflow-hidden flex items-center justify-center">
                <img
                  src="/BlackJack/diller.png"
                  alt="Диллер"
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/diller.png';
                  }}
                />
              </div>
              {dealerScore > 0 && (
                <span className="absolute -bottom-2.5 sm:-bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/95 px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-white border border-white/30 shadow-2xl whitespace-nowrap z-30">
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
              2. CENTER: Dynamic Phase Badges, Outcome Banners & Minimalist In-Table Betting
             ========================================================================= */}
          <div className="relative z-20 my-auto py-2 text-center flex flex-col items-center justify-center gap-2">
            {/* LUXURY OUTCOME BANNER AT ROUND END */}
            {(state.phase === 'settling' || state.phase === 'finished') && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0, y: -15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 300 }}
                className="relative z-30"
              >
                {myOutcome === 'blackjack' ? (
                  <div className="relative flex flex-col items-center px-7 py-3 rounded-2xl bg-gradient-to-b from-[#2a1d07]/95 via-[#181308]/95 to-[#0a0803]/95 border-2 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.6)] backdrop-blur-xl">
                    <div className="flex items-center gap-1.5 text-amber-300 font-black text-xs uppercase tracking-widest">
                      <Sparkles size={15} className="text-amber-300 animate-spin" />
                      <span>БЛЭКДЖЕК 3:2</span>
                      <Sparkles size={15} className="text-amber-300 animate-spin" />
                    </div>
                    <span className="text-xl sm:text-2xl font-black bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent drop-shadow-md">
                      +{(myPlayer!.bet * 2.5).toFixed(0)} zł
                    </span>
                  </div>
                ) : myOutcome === 'win' ? (
                  <div className="relative flex flex-col items-center px-7 py-3 rounded-2xl bg-gradient-to-b from-[#062c18]/95 via-[#031c0e]/95 to-[#021008]/95 border-2 border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.6)] backdrop-blur-xl">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs uppercase tracking-widest">
                      <Trophy size={15} className="text-emerald-300" />
                      <span>ПОБЕДА НАД ДИЛЕРОМ</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 bg-clip-text text-transparent drop-shadow-md">
                      +{(myPlayer!.bet * 2).toFixed(0)} zł
                    </span>
                  </div>
                ) : myOutcome === 'push' ? (
                  <div className="relative flex flex-col items-center px-6 py-2.5 rounded-2xl bg-[#141720]/95 border-2 border-amber-400/60 shadow-[0_0_30px_rgba(251,191,36,0.3)] backdrop-blur-xl">
                    <span className="text-xs font-black text-amber-300 uppercase tracking-wider">НИЧЬЯ С ДИЛЕРОМ</span>
                    <span className="text-base sm:text-lg font-black text-white">Возврат {myPlayer!.bet} zł</span>
                  </div>
                ) : myOutcome === 'lose' ? (
                  <div className="relative flex flex-col items-center px-6 py-2.5 rounded-2xl bg-gradient-to-b from-[#2e090b]/90 via-[#180405]/95 to-[#0a0203]/95 border-2 border-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.4)] backdrop-blur-xl">
                    <span className="text-xs font-black text-red-400 uppercase tracking-wider">ДИЛЕР ВЫИГРАЛ</span>
                    <span className="text-sm sm:text-base font-black text-white/80">-{myPlayer!.bet} zł</span>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-2 px-5 py-2 rounded-full bg-black/80 border border-white/20 shadow-xl backdrop-blur-md">
                    <span className="text-xs sm:text-sm font-black text-white/90 uppercase tracking-wider">
                      РАУНД ЗАВЕРШЕН · ДИЛЕР {dealerScore > 21 ? 'ПЕРЕБОР' : dealerScore}
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* COUNTDOWN / WAITING PHASE: MINIMALIST CENTER BETTING HUD WITH REAL CHIPS */}
            {myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-2.5 bg-[#070a0f]/95 backdrop-blur-2xl border border-white/15 p-2.5 sm:p-3.5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] max-w-sm sm:max-w-md w-full"
              >
                <div className="flex items-center justify-between w-full px-1">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
                    <Zap size={14} className="animate-bounce" />
                    <span>Ставки: {state.countdown}с</span>
                  </div>
                  {myPlayer.bet > activeBalance && (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded-md">
                      АФК (Ставка &gt; Баланса)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleLeaveSeat}
                    className="flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 transition-colors"
                  >
                    <LogOut size={13} />
                    Встать
                  </button>
                </div>

                {/* Minimalist Stepper */}
                <div className="flex items-center justify-between gap-3 w-full bg-black/70 border border-white/10 rounded-2xl p-1.5 px-3">
                  <button
                    type="button"
                    onClick={() => handleUpdateBet(Math.max(10, selectedBet - 10))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 text-white font-black transition-all"
                  >
                    <Minus size={15} />
                  </button>
                  <div className="flex items-center gap-2">
                    <img
                      src={getChipImage(selectedBet)}
                      alt={`${selectedBet} zł`}
                      className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-md"
                    />
                    <span className="text-base sm:text-lg font-black text-white tracking-wide">
                      {selectedBet} <span className="text-amber-400 font-bold">zł</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateBet(selectedBet + 10)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 text-white font-black transition-all"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                {/* Realistic Casino Chip Selector from public/BlackJack */}
                <div className="flex items-center justify-center gap-2 sm:gap-3 w-full py-1 overflow-x-auto scrollbar-none">
                  {CHIP_VALUES.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleUpdateBet(val)}
                      className={cn(
                        'relative flex flex-col items-center shrink-0 transition-all active:scale-95 group',
                        selectedBet === val ? 'scale-110 -translate-y-1' : 'opacity-70 hover:opacity-100 hover:scale-105'
                      )}
                    >
                      <img
                        src={`/BlackJack/${val}.png`}
                        alt={`${val} zł`}
                        className={cn(
                          'w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow-xl rounded-full transition-all',
                          selectedBet === val && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black shadow-[0_0_15px_rgba(251,191,36,0.6)]'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ACTIVE TURN ACTION HUD (CENTER TABLE) */}
            {isMyTurn && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 sm:gap-3 bg-black/85 backdrop-blur-xl border border-white/20 p-2 sm:p-3 rounded-2xl shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => handleAction('hit')}
                  disabled={isActionPending}
                  className="py-2.5 px-4 sm:px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                >
                  ЕЩЁ (Hit)
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('stand')}
                  disabled={isActionPending}
                  className="py-2.5 px-4 sm:px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                >
                  ХВАТИТ (Stand)
                </button>
                {myPlayer && myPlayer.hand.length === 2 && (
                  <button
                    type="button"
                    onClick={() => handleAction('double')}
                    disabled={isActionPending}
                    className="py-2.5 px-4 sm:px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                  >
                    2× УДВОИТЬ
                  </button>
                )}
              </motion.div>
            )}

            {/* SPECTATOR / OTHER PHASES BADGES */}
            {!myPlayer && state.phase === 'countdown' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-amber-400 text-black px-4 py-1 shadow-lg font-black text-xs sm:text-sm">
                <Zap size={14} className="text-black animate-bounce" />
                Ставки: <span className="underline">{state.countdown}с</span>
              </div>
            )}

            {state.phase === 'dealing' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-emerald-300 text-black px-3.5 py-0.5 text-xs font-black shadow-lg">
                <Sparkles size={14} className="text-black animate-spin" />
                Раздача карт...
              </div>
            )}

            {state.phase === 'player_turn' && !isMyTurn && (
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
          </div>

          {/* =========================================================================
              3. 5 PLAYER SPOTS (LIFTED SAFELY, LARGER AVATARS, DYNAMIC WIN/LOSE BORDERS):
             ========================================================================= */}
          <div className="relative z-10 grid grid-cols-5 gap-1 sm:gap-3 w-full items-end pb-1 sm:pb-3">
            {SEATS_CONFIG.map((seat) => {
              const seatId = seat.id;
              const player = state.players.find((p) => p.seatId === seatId);
              const isTurn = state.phase === 'player_turn' && state.currentTurnSeatId === seatId;
              const isMe = user?.id && player?.userId === user.id;
              const outcome = player ? getPlayerOutcome(player) : null;

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
                  {/* (A) DEALT HAND CARDS (with flight animation from deck) */}
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
                  <span className="font-black text-[10px] sm:text-xs text-black uppercase tracking-wide mb-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)] truncate max-w-[80px] sm:max-w-[120px] text-center">
                    {player ? (isMe ? 'Вы' : player.name) : seat.label}
                  </span>

                  {/* (C) LARGE AVATAR CIRCLE (WITH WIN/LOSE DYNAMIC BORDER) */}
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

                    {/* Prominent Avatar Circle with Win/Lose highlight border */}
                    <div
                      className={cn(
                        'relative flex h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 items-center justify-center rounded-full border-[3.5px] bg-[#101318] text-white font-black text-base sm:text-xl shadow-2xl transition-all overflow-hidden',
                        // Outcome highlight border at round end:
                        outcome === 'win' || outcome === 'blackjack'
                          ? 'border-emerald-400 ring-4 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.9)] scale-105'
                          : outcome === 'lose'
                          ? 'border-red-500 ring-4 ring-red-500 shadow-[0_0_25px_rgba(239,68,68,0.9)]'
                          : outcome === 'push'
                          ? 'border-amber-400 ring-4 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)]'
                          : isTurn
                          ? 'border-yellow-400 ring-4 ring-yellow-400 ring-offset-2 ring-offset-black scale-105 shadow-[0_0_25px_rgba(250,204,21,0.9)]'
                          : isMe
                          ? 'border-emerald-400'
                          : 'border-black'
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
                          className="h-full w-full flex items-center justify-center text-amber-400/80 hover:text-amber-300 hover:scale-110 active:scale-90 transition-transform font-black text-2xl sm:text-3xl"
                          title="Занять место"
                        >
                          +
                        </button>
                      )}
                    </div>

                    {/* (D) REAL CASINO CHIP STACK UNDER AVATAR */}
                    {player && (player.bet > 0 || player.status === 'playing') && (
                      <div className="absolute -bottom-6 sm:-bottom-7 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
                        {/* 3D Stack of casino chips */}
                        <div
                          className="relative flex items-center justify-center"
                          style={{
                            width: 32,
                            height: 22 + (getChipStack(player.bet).length - 1) * 4,
                          }}
                        >
                          {getChipStack(player.bet).map((chipVal, idx) => (
                            <img
                              key={idx}
                              src={`/BlackJack/${chipVal}.png`}
                              alt={`${chipVal} zł`}
                              className="absolute object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)]"
                              style={{
                                width: 26,
                                height: 26,
                                bottom: idx * 4,
                                zIndex: idx + 1,
                              }}
                              draggable={false}
                            />
                          ))}
                        </div>

                        {/* Bet Amount Pill */}
                        <span className="mt-0.5 font-black text-[9px] sm:text-[11px] text-amber-300 bg-black/95 px-2 py-0.2 rounded-full border border-white/20 shadow-xl whitespace-nowrap">
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
      </div>

      {/* Floating Chat Open Button */}
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
