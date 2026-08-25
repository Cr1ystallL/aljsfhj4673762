'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2,
  HelpCircle,
  MessageSquare,
  Users,
  Zap,
  Sparkles,
  Minus,
  Plus,
  LogOut,
  Trophy,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { Suit } from '@/components/game/hilo/playing-card';
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
  turnCountdown?: number;
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

// True arc curve for 5 seats following the casino table ellipse
const SEATS_CONFIG = [
  { id: 1, label: 'Игрок 1', arcOffset: '-translate-y-8 sm:-translate-y-12' },
  { id: 2, label: 'Игрок 2', arcOffset: '-translate-y-3 sm:-translate-y-5' },
  { id: 3, label: 'Игрок 3', arcOffset: 'translate-y-2 sm:translate-y-4' },
  { id: 4, label: 'Игрок 4', arcOffset: '-translate-y-3 sm:-translate-y-5' },
  { id: 5, label: 'Игрок 5', arcOffset: '-translate-y-8 sm:-translate-y-12' },
];

function convertCard(c: BJCard) {
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

/**
 * High-End Casino Playing Card Component
 * Matches design specification: cream gradient face-up & crimson gold-framed back with MacvBet logo.
 */
function CasinoBlackjackCard({
  card,
  isFaceDown = false,
  className,
}: {
  card?: BJCard | null;
  isFaceDown?: boolean;
  className?: string;
}) {
  if (isFaceDown || !card || card.hidden) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center rounded-[8px] sm:rounded-[9px] select-none flex-shrink-0 overflow-hidden',
          'w-[54px] h-[78px] sm:w-[68px] sm:h-[96px] md:w-[76px] md:h-[106px]',
          'border border-black/35 shadow-[0_8px_18px_rgba(0,0,0,0.65),0_0_22px_rgba(150,20,20,0.25)]',
          className
        )}
        style={{
          background: 'linear-gradient(155deg, #7c1a1a 0%, #550f10 60%, #3a0709 100%)',
        }}
      >
        {/* Inner gold frame with subtle diagonal pattern */}
        <div
          className="absolute inset-[3px] sm:inset-[5px] rounded-[5px] sm:rounded-[6px] border border-[rgba(230,196,130,0.35)] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(230,196,130,0.06) 0 2px, transparent 2px 7px)',
          }}
        />

        {/* MacvBet Crown Logo in center */}
        <img
          src="/ButtonLogo.svg"
          alt="MacvBet"
          className="relative z-10 w-6 h-6 sm:w-8 sm:h-8 object-contain filter brightness-125 drop-shadow-[0_0_8px_rgba(227,193,126,0.6)]"
          draggable={false}
        />
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol =
    card.suit === 'spades'
      ? '♠'
      : card.suit === 'hearts'
      ? '♥'
      : card.suit === 'diamonds'
      ? '♦'
      : '♣';
  const rankStr = card.rank;

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between p-1.5 sm:p-2 rounded-[8px] sm:rounded-[9px] select-none flex-shrink-0 overflow-hidden',
        'w-[54px] h-[78px] sm:w-[68px] sm:h-[96px] md:w-[76px] md:h-[106px]',
        'border border-black/25 shadow-[0_8px_18px_rgba(0,0,0,0.55)]',
        isRed ? 'text-[#9c1f24]' : 'text-[#161512]',
        className
      )}
      style={{
        background: 'linear-gradient(160deg, #fbf7ee 0%, #efe7d3 100%)',
      }}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center self-start leading-none pointer-events-none z-10">
        <span className="text-xs sm:text-base font-black leading-none font-serif">
          {rankStr}
        </span>
        <span className="text-[10px] sm:text-xs leading-none mt-0.5">{suitSymbol}</span>
      </div>

      {/* Large Center Suit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-2xl sm:text-3xl md:text-4xl leading-none">{suitSymbol}</span>
      </div>

      {/* Bottom Right Corner (Rotated 180) */}
      <div className="flex flex-col items-center self-end leading-none pointer-events-none rotate-180 z-10">
        <span className="text-xs sm:text-base font-black leading-none font-serif">
          {rankStr}
        </span>
        <span className="text-[10px] sm:text-xs leading-none mt-0.5">{suitSymbol}</span>
      </div>
    </div>
  );
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

  // User's selected bet for their seat (defaults to 0 until placed)
  const [selectedBet, setSelectedBet] = useState(0);
  const [isActionPending, setIsActionPending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Determine user's seat
  const myPlayer = useMemo(() => {
    if (!user?.id) return null;
    return state.players.find((p) => p.userId === user.id) || null;
  }, [state.players, user?.id]);

  // Keep selectedBet synchronized if player already has a bet on server
  useEffect(() => {
    if (myPlayer && myPlayer.bet > 0 && selectedBet === 0) {
      setSelectedBet(myPlayer.bet);
    }
  }, [myPlayer, selectedBet]);

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
  const getPlayerOutcome = useCallback(
    (player: BJPlayer) => {
      if (state.phase !== 'settling' && state.phase !== 'finished') return null;
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
    },
    [state.phase, dealerScore, state.dealerHand.length]
  );

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
    setSelectedBet(0);
    soundManager.play('bj.chip_click');
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

  // Card slide & Win sound tracking with fade-out
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
        soundManager.playWithFadeOut('bj.win', { volume: 0.85, fadeOutDurationMs: 1500 });
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

  // Comprehensive exit / unmount / beforeunload seat release cleanup
  useEffect(() => {
    const handleLeave = () => {
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

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);

    return () => {
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
      handleLeave();
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
          } catch {}
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
    // Join with bet = 0; player chooses their bet after sitting down
    sendWs('blackjack:join_seat', { roomId, seatId, bet: 0 });
    setSelectedBet(0);
    soundManager.play('bj.chip_click');
  };

  const handleUpdateBet = (bet: number) => {
    const validBet = Math.max(10, Math.min(bet, activeBalance > 0 ? activeBalance : 10000));
    if (isBalanceReady && activeBalance < validBet) {
      toast.error('Недостаточно средств на балансе!');
      return;
    }
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
            THE GAME TABLE: Responsive Background (TableMobile.png & TablePC.png)
           ========================================================================= */}
        <section className="relative w-full rounded-[20px] sm:rounded-[36px] flex flex-col justify-between overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.95)] aspect-[1/1.9] sm:aspect-[2/1] min-h-[580px] sm:min-h-[500px] max-h-[85vh] sm:max-h-[720px] p-3 sm:p-5">
          
          {/* Responsive Casino Table Background: Mobile / Desktop */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div
              className="block sm:hidden absolute inset-0 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: 'url(/BlackJack/TableMobile.png)' }}
            />
            <div
              className="hidden sm:block absolute inset-0 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: 'url(/BlackJack/TablePC.png)' }}
            />
          </div>


          {/* =========================================================================
              1. TOP CENTER: Large Dealer Avatar, Name & Hand Cards
             ========================================================================= */}
          <div className="relative z-10 flex flex-col items-center pt-2 sm:pt-4">
            {/* Prominent Large Dealer Avatar with locked pixel dimensions */}
            <div className="relative flex w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] md:w-[96px] md:h-[96px] shrink-0 items-center justify-center">
              <div className="h-full w-full rounded-full bg-black border-2 sm:border-[3px] border-amber-400 text-white shadow-[0_0_25px_rgba(251,191,36,0.6),0_12px_30px_rgba(0,0,0,0.85)] overflow-hidden flex items-center justify-center">
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
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/95 px-3 py-0.5 text-[11px] sm:text-xs font-black text-amber-300 border border-amber-400/50 shadow-2xl whitespace-nowrap z-30">
                  {dealerScore}
                </span>
              )}
            </div>

            {/* Label "Диллер" */}
            <span className="font-bold text-xs sm:text-sm text-amber-300/90 uppercase tracking-wider mt-1 mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              Диллер
            </span>

            {/* Dealer Hand Cards */}
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
                        marginLeft: idx > 0 ? (state.dealerHand.length > 3 ? '-28px' : '-14px') : '0px',
                        zIndex: idx + 1,
                      }}
                    >
                      <CasinoBlackjackCard
                        card={c}
                        isFaceDown={c.hidden}
                        className="w-[56px] h-[80px] sm:w-[72px] sm:h-[100px]"
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              2. CENTER: Liquid Glass 3D Betting Controls, Outcome Banners & Action HUD
             ========================================================================= */}
          <div className="relative z-20 my-auto py-1 text-center flex flex-col items-center justify-center gap-2">
            {/* LUXURY 3D LIQUID GLASS OUTCOME BANNER */}
            {(state.phase === 'settling' || state.phase === 'finished') && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0, y: -15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 300 }}
                className="relative z-30"
              >
                {myOutcome === 'blackjack' ? (
                  <div className="relative flex flex-col items-center px-8 py-3.5 rounded-2xl bg-gradient-to-b from-amber-950/80 via-black/85 to-black/95 border border-amber-400/80 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
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
                  <div className="relative flex flex-col items-center px-8 py-3.5 rounded-2xl bg-gradient-to-b from-emerald-950/80 via-black/85 to-black/95 border border-emerald-400/80 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-2px_4px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs uppercase tracking-widest">
                      <Trophy size={15} className="text-emerald-300" />
                      <span>ПОБЕДА НАД ДИЛЕРОМ</span>
                    </div>
                    <span className="text-xl sm:text-2xl font-black bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 bg-clip-text text-transparent drop-shadow-md">
                      +{(myPlayer!.bet * 2).toFixed(0)} zł
                    </span>
                  </div>
                ) : myOutcome === 'push' ? (
                  <div className="relative flex flex-col items-center px-7 py-3 rounded-2xl bg-gradient-to-b from-slate-900/80 via-black/85 to-black/95 border border-amber-400/50 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                    <span className="text-xs font-black text-amber-300 uppercase tracking-wider">НИЧЬЯ С ДИЛЕРОМ</span>
                    <span className="text-base sm:text-lg font-black text-white">Возврат {myPlayer!.bet} zł</span>
                  </div>
                ) : myOutcome === 'lose' ? (
                  <div className="relative flex flex-col items-center px-7 py-3 rounded-2xl bg-gradient-to-b from-red-950/80 via-black/85 to-black/95 border border-red-500/70 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                    <span className="text-xs font-black text-red-400 uppercase tracking-wider">ДИЛЕР ВЫИГРАЛ</span>
                    <span className="text-sm sm:text-base font-black text-white/80">-{myPlayer!.bet} zł</span>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-2 px-6 py-2.5 rounded-full bg-black/85 border border-amber-400/40 shadow-xl backdrop-blur-2xl">
                    <span className="text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wider">
                      РАУНД ЗАВЕРШЕН · ДИЛЕР {dealerScore > 21 ? 'ПЕРЕБОР' : dealerScore}
                    </span>
                  </div>
                )}
              </motion.div>
            )}

            {/* 3D LIQUID GLASS BETTING PANEL (ONLY FOR SEATED PLAYER) */}
            {myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-2.5 rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#141a14]/90 via-[#0a0f0a]/92 to-[#040604]/96 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95),inset_0_2px_4px_rgba(255,255,255,0.22),inset_0_-3px_6px_rgba(0,0,0,0.85)] p-3.5 sm:p-4.5 min-w-[310px] sm:min-w-[430px] max-w-[94vw]"
              >
                {/* Top Header Row: ⚡ СТАВКА & ВСТАТЬ */}
                <div className="flex items-center justify-between w-full px-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs sm:text-sm tracking-wider uppercase">
                    <Zap size={14} className="text-amber-400" />
                    <span>Ставка: {selectedBet > 0 ? `${selectedBet} zł` : 'Не выбрана'}</span>
                    {state.phase === 'countdown' && (
                      <span className="text-xs font-normal text-amber-300/80 lowercase">
                        ({state.countdown}с)
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleLeaveSeat}
                    className="flex items-center gap-1 text-red-400/90 hover:text-red-300 text-xs font-bold transition-colors"
                    title="Покинуть место"
                  >
                    <LogOut size={13} />
                    <span>ВСТАТЬ</span>
                  </button>
                </div>

                {/* Middle Row: Stepper Buttons (- / +) and Center Chip + Amount */}
                <div className="flex items-center justify-between w-full bg-black/50 rounded-xl p-1.5 border border-white/10 shadow-inner">
                  <button
                    type="button"
                    onClick={() => handleUpdateBet(Math.max(10, selectedBet - 10))}
                    disabled={selectedBet <= 10}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 text-white font-bold transition-all"
                  >
                    <Minus size={14} />
                  </button>

                  <div className="flex items-center gap-2">
                    <img
                      src={getChipImage(selectedBet > 0 ? selectedBet : 10)}
                      alt={`${selectedBet} zł`}
                      className="w-6 h-6 sm:w-7 sm:h-7 object-contain drop-shadow-md"
                    />
                    <span className="text-sm sm:text-base font-black text-white tracking-wide">
                      {selectedBet > 0 ? `${selectedBet} zł` : '0 zł'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateBet(selectedBet + 10)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Bottom Row: Realistic Casino Chips Selector (No clipping) */}
                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 w-full py-2 px-1 overflow-visible">
                  {CHIP_VALUES.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleUpdateBet(val)}
                      className={cn(
                        'relative flex flex-col items-center shrink-0 transition-all active:scale-95 group',
                        selectedBet === val ? 'scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'
                      )}
                    >
                      <img
                        src={`/BlackJack/${val}.png`}
                        alt={`${val} zł`}
                        className={cn(
                          'w-9 h-9 sm:w-11 sm:h-11 object-contain drop-shadow-xl rounded-full transition-all',
                          selectedBet === val &&
                            'ring-2 ring-amber-400 ring-offset-2 ring-offset-black shadow-[0_0_16px_rgba(251,191,36,0.8)]'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ACTIVE TURN ACTION HUD WITH 30s COUNTDOWN */}
            {isMyTurn && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-2 bg-[#080c08]/92 backdrop-blur-2xl border border-amber-500/40 p-3 sm:p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 uppercase tracking-wider">
                  <Clock size={14} className="text-amber-400 animate-spin" />
                  <span>ВАШ ХОД: {state.turnCountdown !== undefined ? `${state.turnCountdown}с` : '30с'}</span>
                </div>

                <div className="flex items-center justify-center gap-2.5 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => handleAction('hit')}
                    disabled={isActionPending}
                    className="py-2.5 px-4 sm:px-6 rounded-xl bg-gradient-to-b from-[#15803d] to-[#052e16] border border-emerald-500/50 hover:brightness-110 text-emerald-100 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                  >
                    ЕЩЁ (HIT)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('stand')}
                    disabled={isActionPending}
                    className="py-2.5 px-4 sm:px-6 rounded-xl bg-gradient-to-b from-[#991b1b] to-[#450a0a] border border-red-500/50 hover:brightness-110 text-red-100 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                  >
                    ХВАТИТ (STAND)
                  </button>
                  {myPlayer && myPlayer.hand.length === 2 && (
                    <button
                      type="button"
                      onClick={() => handleAction('double')}
                      disabled={isActionPending}
                      className="py-2.5 px-4 sm:px-5 rounded-xl bg-gradient-to-b from-[#b45309] to-[#451a03] border border-amber-500/50 hover:brightness-110 text-amber-100 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                    >
                      2× УДВОИТЬ
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* SPECTATOR / WAITING BADGE */}
            {!myPlayer && state.phase === 'countdown' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-black/85 text-amber-300 px-4 py-1 text-xs font-bold shadow-lg backdrop-blur-md">
                <Zap size={14} className="text-amber-400 animate-bounce" />
                Ставки: {state.countdown}с (Займите место)
              </div>
            )}

            {/* DEALING PHASE BADGE */}
            {state.phase === 'dealing' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/80 text-amber-300 px-4 py-1 text-xs font-bold shadow-lg backdrop-blur-md">
                <Sparkles size={14} className="text-amber-400 animate-spin" />
                Раздача карт...
              </div>
            )}

            {/* OTHER PLAYER'S TURN BADGE WITH COUNTDOWN */}
            {state.phase === 'player_turn' && !isMyTurn && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-black/80 text-cyan-300 px-4 py-1 text-xs font-bold shadow-lg backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                Ход: Место #{state.currentTurnSeatId} ({state.turnCountdown ?? 30}с)
              </div>
            )}

            {/* DARK PROMINENT DEALER TURN BADGE */}
            {state.phase === 'dealer_turn' && (
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/50 bg-black/90 text-white/95 px-6 py-2 text-sm sm:text-base font-black shadow-[0_10px_30px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-ping" />
                ХОД ДИЛЕРА...
              </div>
            )}
          </div>

          {/* =========================================================================
              3. 5 PLAYER SPOTS (TRUE CASINO ARC, 3D GLASS DISKS, PERFECT ALIGNMENT):
             ========================================================================= */}
          <div className="relative z-10 grid grid-cols-5 gap-1 sm:gap-4 w-full items-end pb-8 sm:pb-14 px-1 sm:px-6">
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
                    'flex flex-col items-center justify-end min-w-0 transition-transform duration-300 h-[190px] sm:h-[220px]',
                    seat.arcOffset
                  )}
                >
                  {/* (A) FIXED-HEIGHT CARDS AREA (Prevents entire row from sinking when a player joins) */}
                  <div className="relative h-[88px] sm:h-[108px] w-full flex items-end justify-center mb-1.5 pointer-events-none">
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
                              marginLeft: cardIdx > 0 ? '-28px' : '0px',
                              zIndex: cardIdx + 1,
                            }}
                          >
                            <CasinoBlackjackCard
                              card={c}
                              isFaceDown={c.hidden}
                              className="w-[56px] h-[80px] sm:w-[72px] sm:h-[100px]"
                            />
                          </motion.div>
                        ))}
                        {/* Score Indicator */}
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/95 px-2 py-0.5 text-[9px] sm:text-xs font-black text-amber-300 border border-amber-400/40 shadow-xl whitespace-nowrap">
                          {playerHandScore}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* (B) PLAYER LABEL (Visible only for seated players: "ВЫ" or Player Name) */}
                  <div className="h-4 sm:h-5 flex items-center justify-center mb-1 w-full">
                    {player ? (
                      <span className="font-bold text-[10px] sm:text-xs text-amber-300/90 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate max-w-[80px] sm:max-w-[120px] text-center">
                        {isMe ? 'ВЫ' : player.name}
                      </span>
                    ) : null}
                  </div>

                  {/* (C) 3D LIQUID GLASS DISK / AVATAR SLOT */}
                  <div className="relative flex flex-col items-center">
                    {/* Status Pill floating above Avatar */}
                    {player && player.status !== 'waiting' && player.status !== 'playing' && (
                      <span
                        className={cn(
                          'absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.2 text-[8px] sm:text-[10px] font-black border border-black shadow-md z-30',
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

                    {player ? (
                      /* Occupied Seat Avatar with Golden Glow Ring */
                      <div
                        className={cn(
                          'relative flex w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0 items-center justify-center rounded-full border-2 bg-black/80 text-white font-black text-sm sm:text-lg shadow-2xl transition-all overflow-hidden',
                          outcome === 'win' || outcome === 'blackjack'
                            ? 'border-emerald-400 ring-4 ring-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.9)] scale-105'
                            : outcome === 'lose'
                            ? 'border-red-500 ring-4 ring-red-500 shadow-[0_0_25px_rgba(239,68,68,0.9)]'
                            : outcome === 'push'
                            ? 'border-amber-400 ring-4 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)]'
                            : isTurn
                            ? 'border-yellow-400 ring-4 ring-yellow-400 ring-offset-2 ring-offset-black scale-105 shadow-[0_0_25px_rgba(250,204,21,0.9)]'
                            : 'border-amber-400/90 ring-2 ring-amber-400/30 shadow-[0_0_20px_rgba(251,191,36,0.5),0_10px_25px_rgba(0,0,0,0.8)]'
                        )}
                      >
                        {player.avatar ? (
                          <img src={player.avatar} alt={player.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="drop-shadow-md text-amber-300">{player.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                    ) : (
                      /* Empty Seat: 3D Liquid Glass Disc with Perfectly Centered SVG Plus */
                      <button
                        disabled={state.phase !== 'waiting' && state.phase !== 'countdown'}
                        onClick={() => handleJoinSeat(seatId)}
                        className="relative flex w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-500/35 bg-gradient-to-b from-black/50 to-black/85 backdrop-blur-md shadow-[0_8px_20px_rgba(0,0,0,0.7),inset_0_2px_4px_rgba(255,255,255,0.15),inset_0_-2px_4px_rgba(0,0,0,0.7)] hover:border-amber-400 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] transition-all active:scale-95 group"
                        title="Занять место"
                      >
                        <Plus
                          className="text-amber-400/80 group-hover:text-amber-300 transition-transform group-hover:scale-110"
                          size={24}
                          strokeWidth={2.5}
                        />
                      </button>
                    )}

                    {/* (D) REAL CASINO CHIP STACK UNDER AVATAR (Absolute positioned so no layout shift) */}
                    {player && (player.bet > 0 || player.status === 'playing') && (
                      <div className="absolute -bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
                        {/* 3D Stack of casino chips */}
                        <div
                          className="relative flex items-center justify-center"
                          style={{
                            width: 28,
                            height: 18 + (getChipStack(player.bet).length - 1) * 3,
                          }}
                        >
                          {getChipStack(player.bet).map((chipVal, idx) => (
                            <img
                              key={idx}
                              src={`/BlackJack/${chipVal}.png`}
                              alt={`${chipVal} zł`}
                              className="absolute object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)]"
                              style={{
                                width: 22,
                                height: 22,
                                bottom: idx * 3,
                                zIndex: idx + 1,
                              }}
                              draggable={false}
                            />
                          ))}
                        </div>

                        {/* Bet Amount Pill */}
                        <span className="mt-0.5 font-bold text-[8px] sm:text-[10px] text-amber-300 bg-black/95 px-2 py-0.2 rounded-full border border-amber-400/30 shadow-xl whitespace-nowrap">
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
        onClick={() => {
          setIsChatOpen(true);
          setUnreadChatCount(0);
          soundManager.play('ui.click');
        }}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-black/85 text-amber-300 shadow-2xl backdrop-blur-xl hover:bg-black hover:scale-105 active:scale-95 transition-transform"
        title="Чат стола"
      >
        <MessageSquare size={20} />
        {unreadChatCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white border-2 border-black animate-pulse">
            {unreadChatCount}
          </span>
        )}
      </button>

      {/* Slide-over Multiplayer Table Chat Drawer */}
      <BlackjackTableChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        currentUserId={user?.id}
        players={state.players}
      />
    </main>
  );
}
