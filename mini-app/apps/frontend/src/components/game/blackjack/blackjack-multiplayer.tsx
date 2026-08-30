'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  Play,
  History,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useActiveBalance } from '@/hooks/use-active-balance';
import { Suit } from '@/components/game/hilo/playing-card';
import { BlackjackTableChat, ChatMessage } from './blackjack-table-chat';
import { BlackjackHistoryModal } from './blackjack-history-modal';
import { BlackjackRulesModal } from './blackjack-rules-modal';
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
  isReady?: boolean;
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
  const chips: number[] = [];

  // Denominations available: 500, 250, 100, 50, 25, 10
  while (remaining >= 500) {
    chips.push(500);
    remaining -= 500;
  }
  while (remaining >= 250) {
    chips.push(250);
    remaining -= 250;
  }
  while (remaining >= 100) {
    chips.push(100);
    remaining -= 100;
  }
  while (remaining >= 50) {
    chips.push(50);
    remaining -= 50;
  }
  while (remaining >= 25 && (remaining % 10 !== 0 || remaining === 25)) {
    chips.push(25);
    remaining -= 25;
  }
  while (remaining >= 10) {
    chips.push(10);
    remaining -= 10;
  }
  if (remaining > 0) {
    chips.push(10);
  }

  // Reverse so the highest denomination chip is rendered at the top of the stack
  return chips.reverse();
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
  { id: 1, label: 'Игрок 1', arcOffset: '-translate-y-3 sm:-translate-y-5' },
  { id: 2, label: 'Игрок 2', arcOffset: '-translate-y-0.5 sm:-translate-y-1' },
  { id: 3, label: 'Игрок 3', arcOffset: 'translate-y-2 sm:translate-y-3' },
  { id: 4, label: 'Игрок 4', arcOffset: '-translate-y-0.5 sm:-translate-y-1' },
  { id: 5, label: 'Игрок 5', arcOffset: '-translate-y-3 sm:-translate-y-5' },
];
const SEATS_LAYOUT = SEATS_CONFIG;

type TableListItem = {
  roomId: string;
  phase: string;
  playersCount: number;
  maxSeats?: number;
  countdown: number;
};

function sortTableList(tables: TableListItem[]): TableListItem[] {
  return [...tables].sort((a, b) => {
    const na = Number(String(a.roomId).replace(/\D/g, '')) || 0;
    const nb = Number(String(b.roomId).replace(/\D/g, '')) || 0;
    return na - nb;
  });
}

function mergeLiveTables(
  tables: TableListItem[],
  live?: { roomId: string; playersCount: number; phase?: string; countdown?: number }
): TableListItem[] {
  const byId = new Map<string, TableListItem>();
  for (const row of tables) {
    if (row?.roomId) byId.set(row.roomId, { maxSeats: 5, ...row });
  }
  if (live?.roomId) {
    const prev = byId.get(live.roomId);
    byId.set(live.roomId, {
      roomId: live.roomId,
      phase: live.phase || prev?.phase || 'waiting',
      countdown: live.countdown ?? prev?.countdown ?? 12,
      maxSeats: prev?.maxSeats ?? 5,
      playersCount: Math.max(prev?.playersCount ?? 0, live.playersCount),
    });
  }
  if (!byId.has('bj_table_1')) {
    byId.set('bj_table_1', {
      roomId: 'bj_table_1',
      phase: 'waiting',
      playersCount: 0,
      maxSeats: 5,
      countdown: 12,
    });
  }
  const list = sortTableList([...byId.values()]);
  const hasEmpty = list.some((t) => t.playersCount === 0);
  if (!hasEmpty) {
    let index = 1;
    while (byId.has(`bj_table_${index}`)) index += 1;
    list.push({
      roomId: `bj_table_${index}`,
      phase: 'waiting',
      playersCount: 0,
      maxSeats: 5,
      countdown: 12,
    });
  }
  return sortTableList(list);
}

function tableShortName(id: string): string {
  if (!id) return 'стол';
  if (id === 'bj_table_1') return 'Стол #1';
  const n = String(id).replace(/^bj_table_/, '');
  return n && n !== id ? `Стол #${n}` : id;
}

function emptyTableState(id: string): BJState {
  return {
    roomId: id,
    phase: 'waiting',
    countdown: 12,
    dealerHand: [],
    players: [],
    currentTurnSeatId: null,
    roundId: '',
  };
}

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
          'relative flex items-center justify-center rounded-[6px] sm:rounded-[8px] select-none flex-shrink-0 overflow-hidden',
          'w-[40px] h-[58px] sm:w-[50px] sm:h-[72px] md:w-[58px] md:h-[82px]',
          'border border-black/35 shadow-[0_6px_14px_rgba(0,0,0,0.65),0_0_18px_rgba(150,20,20,0.25)]',
          className
        )}
        style={{
          background: 'linear-gradient(155deg, #7c1a1a 0%, #550f10 60%, #3a0709 100%)',
        }}
      >
        {/* Inner gold frame with subtle diagonal pattern */}
        <div
          className="absolute inset-[2.5px] sm:inset-[4px] rounded-[4px] sm:rounded-[5px] border border-[rgba(230,196,130,0.35)] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(230,196,130,0.06) 0 2px, transparent 2px 7px)',
          }}
        />

        {/* MacvBet Crown Logo in center */}
        <img
          src="/ButtonLogo.svg"
          alt="MacvBet"
          className="relative z-10 w-4 h-4 sm:w-6 sm:h-6 object-contain filter brightness-125 drop-shadow-[0_0_6px_rgba(227,193,126,0.6)]"
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
        'relative flex flex-col justify-between p-1 sm:p-1.5 rounded-[6px] sm:rounded-[8px] select-none flex-shrink-0 overflow-hidden',
        'w-[40px] h-[58px] sm:w-[50px] sm:h-[72px] md:w-[58px] md:h-[82px]',
        'border border-black/25 shadow-[0_6px_14px_rgba(0,0,0,0.55)]',
        isRed ? 'text-[#9c1f24]' : 'text-[#161512]',
        className
      )}
      style={{
        background: 'linear-gradient(160deg, #fbf7ee 0%, #efe7d3 100%)',
      }}
    >
      {/* Top Left Corner */}
      <div className="flex flex-col items-center self-start leading-none pointer-events-none z-10">
        <span className="text-[10px] sm:text-xs md:text-sm font-black leading-none font-serif">
          {rankStr}
        </span>
        <span className="text-[8px] sm:text-[10px] leading-none mt-0.5">{suitSymbol}</span>
      </div>

      {/* Large Center Suit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-lg sm:text-2xl md:text-3xl leading-none">{suitSymbol}</span>
      </div>

      {/* Bottom Right Corner (Rotated 180) */}
      <div className="flex flex-col items-center self-end leading-none pointer-events-none rotate-180 z-10">
        <span className="text-[10px] sm:text-xs md:text-sm font-black leading-none font-serif">
          {rankStr}
        </span>
        <span className="text-[8px] sm:text-[10px] leading-none mt-0.5">{suitSymbol}</span>
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
    syncBalance,
    optimisticUpdate,
  } = useActiveBalance('blackjack');

  const searchParams = useSearchParams();
  const explicitRoom = searchParams.get('roomId');
  const [roomId, setRoomId] = useState(explicitRoom || 'bj_table_1');
  const roomIdRef = useRef(roomId);
  const switchTargetRef = useRef<string | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const [tableSwitch, setTableSwitch] = useState<{ from: string; to: string; mode: 'watch' | 'sit' } | null>(null);
  const [seatedRoomId, setSeatedRoomId] = useState<string | null>(null);
  const seatedRoomIdRef = useRef<string | null>(null);
  seatedRoomIdRef.current = seatedRoomId;

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    if (explicitRoom && explicitRoom !== roomIdRef.current && !switchTargetRef.current) {
      setRoomId(explicitRoom);
    }
  }, [explicitRoom]);

  const [state, setState] = useState<BJState>(emptyTableState(explicitRoom || 'bj_table_1'));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showRules, setShowRules] = useState(false);

  // Minimalist table list popover state
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [tableHistory, setTableHistory] = useState<any[]>([]);
  const [availableTables, setAvailableTables] = useState<TableListItem[]>([
    { roomId: 'bj_table_1', phase: 'waiting', playersCount: 0, maxSeats: 5, countdown: 12 },
  ]);

  const fetchAvailableTables = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/games/blackjack/tables', { credentials: 'include', headers });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.tables) && j.tables.length > 0) {
          setAvailableTables((prev) => {
            const live = prev.find((t) => t.roomId === roomId);
            return mergeLiveTables(j.tables, live);
          });
        }
      }
    } catch {}
  }, [token, roomId]);

  const fetchTableHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/blackjack/history?roomId=${roomId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.history)) {
          setTableHistory(j.history);
        }
      }
    } catch {}
  }, [roomId]);

  useEffect(() => {
    void fetchAvailableTables();
    void fetchTableHistory();
  }, [fetchAvailableTables, fetchTableHistory]);

  useEffect(() => {
    setAvailableTables((prev) =>
      mergeLiveTables(prev, {
        roomId,
        playersCount: state.players.length,
        phase: state.phase,
        countdown: state.countdown,
      })
    );
  }, [roomId, state.players.length, state.phase, state.countdown]);

  useEffect(() => {
    if (!isTableMenuOpen) return;
    void fetchAvailableTables();
    const id = window.setInterval(() => void fetchAvailableTables(), 2500);
    return () => window.clearInterval(id);
  }, [isTableMenuOpen, fetchAvailableTables]);

  // User's selected bet for their seat (defaults to 0 until placed)
  const [selectedBet, setSelectedBet] = useState(0);
  const [isActionPending, setIsActionPending] = useState(false);

  // Smooth local countdown tickers to eliminate server ping jumps
  const [clientCountdown, setClientCountdown] = useState<number>(12);
  const [clientTurnCountdown, setClientTurnCountdown] = useState<number>(30);

  useEffect(() => {
    setClientCountdown(state.countdown);
  }, [state.countdown, state.phase]);

  useEffect(() => {
    setClientTurnCountdown(state.turnCountdown !== undefined ? state.turnCountdown : 30);
  }, [state.turnCountdown, state.currentTurnSeatId, state.phase]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setClientCountdown((c) => (c > 0 ? c - 1 : 0));
      setClientTurnCountdown((tc) => (tc > 0 ? tc - 1 : 0));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const hasDebitedBetRef = useRef(false);

  const [wsUserId, setWsUserId] = useState<string | null>(null);
  const wsUserIdRef = useRef<string | null>(null);
  wsUserIdRef.current = wsUserId;
  const pendingReseatRef = useRef(false);
  const handleJoinSeatRef = useRef<(seatId: number) => void>(() => {});
  const myPlayerRef = useRef<BJPlayer | null>(null);

  // Determine user's seat strictly by authenticated/session user IDs
  const myPlayer = useMemo(() => {
    return (
      state.players.find(
        (p) =>
          (user?.id && p.userId === user.id) ||
          (wsUserId && p.userId === wsUserId) ||
          (sessionId && p.userId === `guest_${sessionId.slice(0, 8)}`) ||
          (sessionId && p.userId.includes(sessionId.slice(0, 8)))
      ) || null
    );
  }, [state.players, user?.id, wsUserId, sessionId]);
  myPlayerRef.current = myPlayer;

  useEffect(() => {
    if (myPlayer) setSeatedRoomId(roomId);
  }, [myPlayer, roomId]);

  // Track phase transitions for instant balance updates and reset
  useEffect(() => {
    if (state.phase === 'dealing' || state.phase === 'player_turn') {
      const myBet = myPlayer?.bet || selectedBet || 0;
      if (myBet >= 10 && !hasDebitedBetRef.current && activeBalance >= myBet) {
        hasDebitedBetRef.current = true;
        optimisticUpdate(-myBet);
      }
      void syncBalance();
    } else if (state.phase === 'waiting') {
      hasDebitedBetRef.current = false;
      setSelectedBet(0);
      void fetchBalance();
      void syncBalance();
    } else if (state.phase === 'settling' || state.phase === 'finished') {
      hasDebitedBetRef.current = false;
      void fetchBalance();
      void syncBalance();
    }
  }, [state.phase, myPlayer?.bet, selectedBet, optimisticUpdate, syncBalance, fetchBalance]);

  // Keep selectedBet synchronized if player already has a bet on server in countdown phase
  useEffect(() => {
    if (state.phase === 'countdown' && myPlayer && myPlayer.bet > 0 && selectedBet === 0) {
      setSelectedBet(myPlayer.bet);
    }
  }, [myPlayer?.bet, state.phase, selectedBet]);

  const isMyTurn = useMemo(() => {
    if (!myPlayer || state.phase !== 'player_turn') return false;
    return state.currentTurnSeatId === myPlayer.seatId;
  }, [myPlayer, state.currentTurnSeatId, state.phase]);

  const bettingPlayersCount = useMemo(() => {
    return state.players.filter((p) => (p.bet ?? 0) >= 10).length;
  }, [state.players]);

  const readyPlayersCount = useMemo(() => {
    return state.players.filter((p) => p.isReady && (p.bet ?? 0) >= 10).length;
  }, [state.players]);

  const isDoubleEligible = useMemo(() => {
    if (!myPlayer) return false;
    const doubleAmount = myPlayer.bet || selectedBet || 0;
    return myPlayer.hand?.length === 2 && doubleAmount > 0 && activeBalance >= doubleAmount;
  }, [myPlayer, selectedBet, activeBalance]);

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
    (player: BJPlayer): { type: 'win' | 'lose' | 'push' | 'blackjack'; label: string; payout: number } | null => {
      if (state.phase !== 'settling' && state.phase !== 'finished') return null;
      if (player.status === 'waiting' || !player.hand || player.hand.length === 0) {
        return null;
      }

      const pValue = calculateHandValue(player.hand.map(convertCard)).total;
      const isDealerBust = dealerScore > 21;
      const isPlayerBust = player.status === 'bust' || pValue > 21;
      const isPlayerBJ = player.status === 'blackjack' || (player.hand.length === 2 && pValue === 21);
      const isDealerBJ = state.dealerHand.length === 2 && dealerScore === 21;

      if (isPlayerBust) return { type: 'lose', label: 'ДИЛЕР ВЫИГРАЛ', payout: 0 };
      if (isPlayerBJ && !isDealerBJ) return { type: 'blackjack', label: 'БЛЭКДЖЕК 3:2', payout: player.bet * 2.5 };
      if (isDealerBJ && !isPlayerBJ) return { type: 'lose', label: 'ДИЛЕР ВЫИГРАЛ', payout: 0 };
      if (isDealerBust) return { type: 'win', label: 'ПОБЕДА НАД ДИЛЕРОМ', payout: player.bet * 2 };
      if (pValue > dealerScore) return { type: 'win', label: 'ПОБЕДА НАД ДИЛЕРОМ', payout: player.bet * 2 };
      if (pValue === dealerScore) return { type: 'push', label: 'НИЧЬЯ С ДИЛЕРОМ', payout: player.bet };
      return { type: 'lose', label: 'ДИЛЕР ВЫИГРАЛ', payout: 0 };
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

  const clearSwitchTimer = useCallback(() => {
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }, []);

  const finishTableSwitch = useCallback(
    (arrivedId: string) => {
      if (switchTargetRef.current && arrivedId === switchTargetRef.current) {
        switchTargetRef.current = null;
        setTableSwitch(null);
        clearSwitchTimer();
      }
    },
    [clearSwitchTimer]
  );

  const switchTable = useCallback(
    (nextId: string, mode: 'watch' | 'sit' = 'watch') => {
      const prev = roomIdRef.current;
      if (!nextId || nextId === prev) {
        setIsTableMenuOpen(false);
        return;
      }

      const leaveUserId =
        myPlayerRef.current?.userId ||
        user?.id ||
        wsUserIdRef.current ||
        (sessionId ? `guest_${sessionId.slice(0, 8)}` : undefined);

      const seatedId = seatedRoomIdRef.current;
      const shouldLeaveSeat = mode === 'sit' && !!leaveUserId && !!seatedId && seatedId !== nextId;

      switchTargetRef.current = nextId;
      roomIdRef.current = nextId;
      pendingReseatRef.current = mode === 'sit';
      setTableSwitch({ from: prev, to: nextId, mode });
      setIsTableMenuOpen(false);
      setChatMessages([]);
      setUnreadChatCount(0);
      setSelectedBet(0);
      setIsActionPending(false);
      setState(emptyTableState(nextId));

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        if (shouldLeaveSeat) {
          ws.send(
            JSON.stringify({
              type: 'blackjack:leave_seat',
              payload: { roomId: seatedId, userId: leaveUserId },
              timestamp: Date.now(),
            })
          );
        }
        if (prev !== seatedId || mode === 'sit') {
          ws.send(
            JSON.stringify({
              type: 'game:leave',
              payload: { roomId: prev },
              timestamp: Date.now(),
            })
          );
        }
        ws.send(
          JSON.stringify({
            type: 'game:join',
            payload: { roomId: nextId },
            timestamp: Date.now(),
          })
        );
      }

      if (shouldLeaveSeat) {
        setSeatedRoomId(null);
        void fetch('/api/games/blackjack/leave', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ roomId: seatedId, userId: leaveUserId }),
        }).catch(() => {});
      }

      setRoomId(nextId);
      try {
        router.replace(`/game/blackjack?roomId=${encodeURIComponent(nextId)}`, { scroll: false });
      } catch {}

      void fetch(`/api/games/blackjack/state?roomId=${encodeURIComponent(nextId)}`, {
        credentials: 'include',
        headers,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (roomIdRef.current !== nextId) return;
          if (data?.state && (!data.state.roomId || data.state.roomId === nextId)) {
            setState(data.state);
            if (Array.isArray(data.state.history)) setTableHistory(data.state.history);
            finishTableSwitch(nextId);
            if (pendingReseatRef.current) {
              const seated = Array.isArray(data.state.players) ? data.state.players : [];
              const me = leaveUserId && seated.some((p: BJPlayer) => p.userId === leaveUserId);
              if (!me) {
                const taken = new Set(seated.map((p: BJPlayer) => p.seatId));
                const free = SEATS_CONFIG.find((s) => !taken.has(s.id));
                if (free) {
                  pendingReseatRef.current = false;
                  handleJoinSeatRef.current(free.id);
                } else {
                  pendingReseatRef.current = false;
                }
              } else {
                pendingReseatRef.current = false;
              }
            }
          }
          if (Array.isArray(data?.chat)) setChatMessages(data.chat);
        })
        .catch(() => {});

      clearSwitchTimer();
      switchTimerRef.current = window.setTimeout(() => {
        if (switchTargetRef.current === nextId) {
          switchTargetRef.current = null;
          setTableSwitch(null);
        }
      }, 4500);
    },
    [token, router, finishTableSwitch, clearSwitchTimer, user?.id, sessionId]
  );

  const goToFreeTable = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/games/blackjack/matchmake', {
        credentials: 'include',
        headers,
      });
      if (!res.ok) return;
      const j = await res.json();
      if (j.roomId) {
        if (j.roomId === roomIdRef.current) {
          setIsTableMenuOpen(false);
        } else {
          switchTable(j.roomId, 'sit');
        }
      }
    } catch {}
  }, [token, switchTable]);

  const loadStateSnapshot = useCallback(async () => {
    try {
      const id = roomIdRef.current;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/games/blackjack/state?roomId=${encodeURIComponent(id)}`, {
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (roomIdRef.current !== id) return;
        if (data.state && (!data.state.roomId || data.state.roomId === id)) {
          setState(data.state);
          if (Array.isArray(data.state.history)) {
            setTableHistory(data.state.history);
          }
          finishTableSwitch(id);
        }
        if (Array.isArray(data.chat)) {
          setChatMessages(data.chat);
        }
      }
    } catch {}
  }, [token, finishTableSwitch]);

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
      if (myOutcome?.type === 'win' || myOutcome?.type === 'blackjack') {
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

  // Seat release on tab close / leave page — not on table switch (that's switchTable).
  useEffect(() => {
    const handleLeave = () => {
      const id = roomIdRef.current;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'blackjack:leave_seat',
            payload: { roomId: id },
            timestamp: Date.now(),
          })
        );
        wsRef.current.send(
          JSON.stringify({
            type: 'game:leave',
            payload: { roomId: id },
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
    };
  }, []);

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    };
  }, []);

  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  const fetchAvailableTablesRef = useRef(fetchAvailableTables);
  const fetchBalanceRef = useRef(fetchBalance);
  const syncBalanceRef = useRef(syncBalance);
  const fetchTableHistoryRef = useRef(fetchTableHistory);
  const finishTableSwitchRef = useRef(finishTableSwitch);
  const switchTableRef = useRef(switchTable);
  useEffect(() => {
    fetchAvailableTablesRef.current = fetchAvailableTables;
    fetchBalanceRef.current = fetchBalance;
    syncBalanceRef.current = syncBalance;
    fetchTableHistoryRef.current = fetchTableHistory;
    finishTableSwitchRef.current = finishTableSwitch;
    switchTableRef.current = switchTable;
  }, [fetchAvailableTables, fetchBalance, syncBalance, fetchTableHistory, finishTableSwitch, switchTable]);

  // WebSocket connection & messaging
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let base =
        process.env.NEXT_PUBLIC_WS_URL ||
        process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, 'ws') ||
        `${wsProtocol}//${window.location.host}`;

      if (!base.endsWith('/api')) {
        base = base.replace(/\/ws$/, '');
      }
      const wsUrl = base.endsWith('/api/ws') ? base : `${base.replace(/\/api$/, '')}/api/ws`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(
            JSON.stringify({
              type: 'auth',
              payload: {
                sessionId: sessionId || undefined,
                token: token || undefined,
                userId: user?.id || undefined,
              },
              timestamp: Date.now(),
            })
          );

          ws?.send(
            JSON.stringify({
              type: 'game:join',
              payload: { roomId: roomIdRef.current },
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
              if (data.payload?.userId) {
                setWsUserId(data.payload.userId);
              }
              ws?.send(
                JSON.stringify({
                  type: 'game:join',
                  payload: { roomId: roomIdRef.current },
                  timestamp: Date.now(),
                })
              );
            }

            if (data.type === 'balance_update' && data.payload) {
              const payload = data.payload;
              const curBal = useBalanceStore.getState().balance;
              const nextTb = payload.tournamentBalances ?? useBalanceStore.getState().tournamentBalances;
              useBalanceStore.getState().setBalance({
                userId: user?.id || '',
                amount: payload.amount,
                currency: payload.currency,
                freeCases: payload.freeCases ?? (curBal as any)?.freeCases ?? 0,
                freeCasesJson: payload.freeCasesJson ?? (curBal as any)?.freeCasesJson ?? {},
                demoMode: payload.demoMode ?? false,
                lastSyncedAt: new Date(payload.timestamp || Date.now()),
              }, nextTb);
            }

            if (data.type === 'bj:state' && data.payload) {
              const arrivedId = data.payload.roomId || roomIdRef.current;
              if (arrivedId !== roomIdRef.current) {
                return;
              }
              setState((prev) => {
                const incoming = data.payload;
                const prevById = new Map(prev.players.map((p) => [p.userId, p]));
                return {
                  ...incoming,
                  players: (incoming.players ?? []).map((p: BJPlayer) => ({
                    ...p,
                    isReady:
                      typeof p.isReady === 'boolean'
                        ? p.isReady
                        : !!prevById.get(p.userId)?.isReady,
                  })),
                };
              });
              setIsActionPending(false);
              finishTableSwitchRef.current(arrivedId);
              if (pendingReseatRef.current) {
                const seated = Array.isArray(data.payload.players) ? data.payload.players : [];
                const me =
                  (user?.id && seated.some((p: BJPlayer) => p.userId === user.id)) ||
                  (wsUserIdRef.current && seated.some((p: BJPlayer) => p.userId === wsUserIdRef.current));
                if (!me) {
                  const taken = new Set(seated.map((p: BJPlayer) => p.seatId));
                  const free = SEATS_CONFIG.find((s) => !taken.has(s.id));
                  if (free) {
                    pendingReseatRef.current = false;
                    window.setTimeout(() => handleJoinSeatRef.current?.(free.id), 0);
                  }
                } else {
                  pendingReseatRef.current = false;
                }
              }
              if (Array.isArray(data.payload.history)) {
                setTableHistory(data.payload.history);
              }
              setAvailableTables((prev) =>
                mergeLiveTables(prev, {
                  roomId: arrivedId,
                  playersCount: Array.isArray(data.payload.players) ? data.payload.players.length : 0,
                  phase: data.payload.phase,
                  countdown: data.payload.countdown,
                })
              );
              if (data.payload.phase === 'settling' || data.payload.phase === 'finished') {
                void fetchBalanceRef.current();
                void syncBalanceRef.current();
                void fetchTableHistoryRef.current();
                setTimeout(() => {
                  void fetchBalanceRef.current();
                  void syncBalanceRef.current();
                }, 800);
                setTimeout(() => void fetchBalanceRef.current(), 2000);
              }
            }

            if (data.type === 'bj:redirect' && data.payload?.roomId) {
              if (data.payload.roomId !== roomIdRef.current) {
                switchTableRef.current(data.payload.roomId, 'sit');
              }
            }

            if (data.type === 'bj:tables' && Array.isArray(data.payload?.tables)) {
              setAvailableTables((prev) => {
                const currentId = roomIdRef.current;
                const live = prev.find((t) => t.roomId === currentId) ?? {
                  roomId: currentId,
                  playersCount: 0,
                  phase: 'waiting',
                  countdown: 12,
                };
                return mergeLiveTables(data.payload.tables, live);
              });
            }

            if (data.type === 'error' && data.payload) {
              const code = data.payload.code;
              if (code === 'TABLE_FULL' || code === 'JOIN_SEAT_FAILED') {
                toast.info(data.payload.message || 'Место занято');
                void fetchAvailableTablesRef.current();
              }
            }

            if (data.type === 'blackjack:chat:history' && Array.isArray(data.payload?.messages)) {
              if (!data.payload.roomId || data.payload.roomId === roomIdRef.current) {
                setChatMessages(data.payload.messages);
              }
            }

            if (data.type === 'blackjack:chat:message' && data.payload) {
              const msg = data.payload;
              if (msg.roomId && msg.roomId !== roomIdRef.current) {
                return;
              }
              const isMine = msg.userId === user?.id || (wsUserId && msg.userId === wsUserId);
              setChatMessages((prev) => {
                const isDuplicate = prev.some(
                  (m) =>
                    m.id === msg.id ||
                    (m.timestamp === msg.timestamp &&
                      m.userId === msg.userId &&
                      m.text === msg.text)
                );
                if (isDuplicate) {
                  return prev;
                }
                if (!isChatOpenRef.current && !isMine) {
                  setUnreadChatCount((c) => c + 1);
                }
                return [...prev, msg];
              });
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
  }, [sessionId, token, user?.id]);

  const handleJoinSeat = (seatId: number) => {
    setSelectedBet(0);
    soundManager.play('bj.chip_click');

    const effectiveUserId = user?.id || wsUserId || (sessionId ? `guest_${sessionId.slice(0, 8)}` : undefined);
    const previousSeat = seatedRoomIdRef.current;
    if (previousSeat && previousSeat !== roomIdRef.current && effectiveUserId) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendWs('blackjack:leave_seat', { roomId: previousSeat, userId: effectiveUserId });
      }
      const leaveHeaders: Record<string, string> = { 'content-type': 'application/json' };
      if (token) leaveHeaders.Authorization = `Bearer ${token}`;
      void fetch('/api/games/blackjack/leave', {
        method: 'POST',
        credentials: 'include',
        headers: leaveHeaders,
        body: JSON.stringify({ roomId: previousSeat, userId: effectiveUserId }),
      }).catch(() => {});
      setSeatedRoomId(null);
    }
    const effectiveName = user?.firstName || user?.username || 'Игрок';
    const effectiveAvatar = user?.photoUrl || undefined;

    const payload = {
      roomId: roomIdRef.current,
      seatId,
      bet: 0,
      userId: effectiveUserId,
      name: effectiveName,
      avatar: effectiveAvatar,
    };

    // 1. Send WebSocket message if connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendWs('blackjack:join_seat', payload);
    }

    // 2. Also dispatch REST request to guarantee instant seat occupation
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('/api/games/blackjack/join', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.redirected && data.roomId && data.roomId !== roomIdRef.current) {
          switchTable(data.roomId, 'sit');
          return;
        }
        if (data?.state && (!data.state.roomId || data.state.roomId === roomIdRef.current)) {
          setState(data.state);
          setSeatedRoomId(roomIdRef.current);
        }
        if (data?.success === false) {
          toast.info('Место занято — стол можно смотреть без посадки');
        }
      })
      .catch(() => {});
  };
  handleJoinSeatRef.current = handleJoinSeat;

  const handleLeaveSeat = () => {
    setSelectedBet(0);
    setSeatedRoomId(null);
    soundManager.play('bj.chip_click');

    const effectiveUserId = myPlayer?.userId || user?.id || wsUserId || (sessionId ? `guest_${sessionId.slice(0, 8)}` : undefined);
    const payload = { roomId, userId: effectiveUserId };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendWs('blackjack:leave_seat', payload);
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch('/api/games/blackjack/leave', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.state && (!data.state.roomId || data.state.roomId === roomIdRef.current)) {
          setState(data.state);
        }
      })
      .catch(() => {});
  };

  const MIN_BET = 10;
  const MAX_BET = 500;

  const handleUpdateBet = (bet: number) => {
    if (bet > MAX_BET) {
      toast.info(`Максимальная ставка ${MAX_BET} ${currencyLabel}`);
      bet = MAX_BET;
    }
    const maxAllowed = Math.min(MAX_BET, Math.max(0, activeBalance));
    if (bet > 0 && activeBalance < MIN_BET) {
      toast.error('Недостаточно средств на балансе!');
      return;
    }
    const validBet = bet === 0 ? 0 : Math.max(MIN_BET, Math.min(bet, maxAllowed));

    if (validBet > activeBalance) {
      toast.error('Недостаточно средств на балансе!');
      return;
    }
    setSelectedBet(validBet);
    soundManager.play('bj.chip_click');

    const effectiveUserId = myPlayer?.userId || user?.id || wsUserId;
    const payload = { roomId, bet: validBet, userId: effectiveUserId || undefined };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendWs('blackjack:bet', payload);
    } else {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/games/blackjack/bet', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.state && (!data.state.roomId || data.state.roomId === roomIdRef.current)) {
            setState(data.state);
          }
        })
        .catch(() => {});
    }
  };

  const handleToggleReady = (ready?: boolean) => {
    const nextReady = ready !== undefined ? ready : !myPlayer?.isReady;
    soundManager.play('ui.click');

    const effectiveUserId = myPlayer?.userId || user?.id || wsUserId;
    if (!effectiveUserId) return;

    const currentBet = selectedBet || myPlayer?.bet || 0;
    if (nextReady && currentBet < MIN_BET) {
      toast.info(`Сделайте ставку (мин. ${MIN_BET} ${currencyLabel})`);
      return;
    }
    if (nextReady && currentBet > activeBalance) {
      toast.error('Недостаточно средств на балансе для ставки!');
      return;
    }

    // If bet changed locally, sync bet first
    if (selectedBet >= MIN_BET && myPlayer?.bet !== selectedBet) {
      const betPayload = { roomId, bet: selectedBet, userId: effectiveUserId };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendWs('blackjack:bet', betPayload);
      }
    }

    // Instant optimistic balance deduction when player commits bet to deal
    if (nextReady && currentBet >= MIN_BET && !hasDebitedBetRef.current && activeBalance >= currentBet) {
      hasDebitedBetRef.current = true;
      optimisticUpdate(-currentBet);
    }

    // Optimistic local state update
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.userId === effectiveUserId ? { ...p, isReady: nextReady, bet: selectedBet || p.bet } : p
      ),
    }));

    const payload = { roomId, isReady: nextReady, userId: effectiveUserId };

    // 1. WebSocket dispatch
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendWs('blackjack:ready_to_deal', payload);
    } else {
      // 2. HTTP REST dispatch fallback
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/games/blackjack/ready', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.state && (!data.state.roomId || data.state.roomId === roomIdRef.current)) {
            setState(data.state);
          }
        })
        .catch(() => {});
    }
  };

  const handleAction = (action: 'hit' | 'stand' | 'double') => {
    if (!isMyTurn || isActionPending) return;
    setIsActionPending(true);
    // Auto unfreeze button after 500ms to prevent double clicks
    setTimeout(() => setIsActionPending(false), 500);

    if (action === 'hit') {
      soundManager.play('bj.card_slide');
    } else if (action === 'double') {
      const doubleAmount = myPlayer?.bet || selectedBet || 0;
      if (doubleAmount <= 0 || activeBalance < doubleAmount) {
        toast.error('Недостаточно средств для удвоения');
        setIsActionPending(false);
        return;
      }
      soundManager.play('bj.chip_click');
      soundManager.play('bj.card_slide');
      // Instant optimistic deduction of the double bet
      optimisticUpdate(-doubleAmount);
    } else {
      soundManager.play('ui.click');
    }

    const effectiveUserId = myPlayer?.userId || user?.id || wsUserId;
    const payload = { roomId, action, userId: effectiveUserId };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendWs('blackjack:action', payload);
    } else {
      // Fallback only if WebSocket is disconnected
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/games/blackjack/action', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.state && (!data.state.roomId || data.state.roomId === roomIdRef.current)) {
            setState(data.state);
          }
        })
        .catch(() => {});
    }
  };

  const handleSendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendWs('blackjack:chat', { roomId, text: trimmed, userId: user?.id || wsUserId || undefined });
  };

  return (
    <main className="relative min-h-screen w-full bg-[#000000] text-frost-white flex flex-col justify-between select-none overflow-x-hidden pb-12 sm:pb-6">
      <AnimatePresence>
        {tableSwitch ? (
          <motion.div
            key={`switch-${tableSwitch.to}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#050505]/88 backdrop-blur-md"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="h-10 w-10 rounded-full border-2 border-white/15 border-t-amber-300 animate-spin"
              aria-hidden
            />
            <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.18em] text-amber-200">
              {tableShortName(tableSwitch.to)}
            </p>
            <p className="mt-1.5 text-[11px] text-white/50">
              {tableSwitch.mode === 'sit' ? 'Переход за стол…' : 'Открываем стол…'}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* Top Bar Header */}
      <div className="w-full max-w-[1360px] mx-auto px-3 pt-3">
        <GameTopBar
          title="Blackjack"
          Icon={Gamepad2}
          balance={activeBalance}
          currency={currencyLabel}
          onHowToPlay={() => setShowRules(true)}
        />
        {seatedRoomId && seatedRoomId !== roomId ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-amber-400/30 bg-black/70 px-3 py-2">
            <p className="font-roobert text-[11px] text-amber-100/90 leading-snug">
              Вы сидите за {tableShortName(seatedRoomId)}. Сейчас смотрите {tableShortName(roomId)} — раздачу за вашим столом не пропустите, вернитесь к нему.
            </p>
            <button
              type="button"
              onClick={() => switchTable(seatedRoomId, 'watch')}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-400/40 bg-amber-400/15 text-[10px] font-bold uppercase tracking-wide text-amber-200"
            >
              К своему столу
            </button>
          </div>
        ) : null}
      </div>

      {/* Main Table Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-2 sm:p-4 w-full max-w-[1360px] mx-auto">
        
        {/* =========================================================================
            THE GAME TABLE: Responsive Background (TableMobile.png & TablePC.png)
           ========================================================================= */}
        <section className="relative w-full rounded-[20px] sm:rounded-[36px] overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.95)] aspect-[1/1.9] sm:aspect-[2/1] min-h-[580px] sm:min-h-[500px] max-h-[85vh] sm:max-h-[720px] p-3 sm:p-5">
          
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
                  alt="Дилер"
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

            {/* Label "Дилер" */}
            <span className="font-bold text-xs sm:text-sm text-amber-300/90 uppercase tracking-wider mt-1 mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              Дилер
            </span>

            {/* Dealer Hand Cards */}
            <div className="relative flex items-center justify-center min-h-[84px] sm:min-h-[104px] mt-0.5">
              {state.dealerHand.length > 0 && (
                <div className="flex items-center justify-center">
                  {state.dealerHand.map((c, idx) => (
                    <motion.div
                      key={`dealer_card_${idx}`}
                      initial={{
                        opacity: 0,
                        y: -120,
                        x: 100,
                        scale: 0.25,
                        rotate: -15,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        x: 0,
                        scale: 1,
                        rotate: 0,
                      }}
                      transition={{
                        type: 'spring',
                        damping: 18,
                        stiffness: 190,
                        mass: 0.8,
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
                 (Positioned absolutely so it NEVER shifts the bottom player seats row!)
             ========================================================================= */}
          <div className="absolute top-[48%] sm:top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 text-center flex flex-col items-center justify-center gap-2 pointer-events-auto w-full max-w-[540px] px-2">
            {/* 3D LIQUID GLASS BETTING PANEL (ONLY FOR SEATED PLAYER) */}
            {myPlayer && (state.phase === 'waiting' || state.phase === 'countdown') && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative flex flex-col items-center gap-2.5 rounded-2xl border-2 border-amber-500/60 bg-[#0c120c] shadow-[0_20px_50px_rgba(0,0,0,0.98),0_0_20px_rgba(0,0,0,0.85)] p-3 sm:p-4 w-full max-w-[340px] sm:max-w-[440px] overflow-hidden"
              >
                {/* 3D Liquid Glass Glare / Bevel highlight */}
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.14] to-transparent pointer-events-none rounded-t-2xl" />
                <div className="absolute inset-[1px] rounded-[14px] border border-amber-400/20 pointer-events-none" />

                {/* Top Header Row: ⚡ СТАВКА & ВСТАТЬ */}
                <div className="relative z-10 flex items-center justify-between w-full px-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs sm:text-sm tracking-wider uppercase">
                    <Zap size={14} className="text-amber-400" />
                    <span>Ставка: {selectedBet > 0 ? `${selectedBet} ${currencyLabel}` : 'Не выбрана'}</span>
                    {state.phase === 'countdown' && (
                      <span className="text-xs font-normal text-amber-300/90 lowercase font-mono">
                        ({Math.max(0, clientCountdown)}с)
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleLeaveSeat}
                    className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-bold transition-colors cursor-pointer"
                    title="Покинуть место"
                  >
                    <LogOut size={13} />
                    <span>ВСТАТЬ</span>
                  </button>
                </div>

                {/* Middle Row: Stepper Buttons (- / +) and Center Chip + Amount */}
                <div className="relative z-10 flex items-center justify-between w-full bg-black/70 rounded-xl p-1.5 border border-amber-500/20 shadow-inner">
                  <button
                    type="button"
                    onClick={() => handleUpdateBet(Math.max(0, selectedBet - 10))}
                    disabled={selectedBet <= 0}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 text-white font-bold transition-all cursor-pointer"
                  >
                    <Minus size={14} />
                  </button>

                  <div className="flex items-center gap-2">
                    <img
                      src={getChipImage(selectedBet > 0 ? selectedBet : 10)}
                      alt={`${selectedBet} ${currencyLabel}`}
                      className="w-6 h-6 sm:w-7 sm:h-7 object-contain drop-shadow-md"
                    />
                    <span className="text-sm sm:text-base font-black text-white tracking-wide">
                      {selectedBet > 0 ? `${selectedBet} ${currencyLabel}` : `0 ${currencyLabel}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateBet(Math.min(MAX_BET, selectedBet + 10))}
                    disabled={selectedBet >= MAX_BET}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 text-white font-bold transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Bottom Row: Realistic Casino Chips Selector (Cumulative Additions) + Reset Button */}
                <div className="relative z-10 flex items-center justify-center gap-2 sm:gap-3 w-full py-1 px-1 overflow-visible">
                  {CHIP_VALUES.map((val) => {
                    const isMax = selectedBet >= MAX_BET;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleUpdateBet(Math.min(MAX_BET, selectedBet + val))}
                        disabled={isMax}
                        className={`relative flex flex-col items-center shrink-0 transition-all active:scale-90 hover:scale-110 group cursor-pointer ${
                          isMax ? 'opacity-30 pointer-events-none' : ''
                        }`}
                        title={`Добавить +${val} ${currencyLabel}`}
                      >
                        <img
                          src={`/BlackJack/${val}.png`}
                          alt={`+${val} ${currencyLabel}`}
                          className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-xl rounded-full transition-all hover:drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                        />
                        <span className="text-[9px] sm:text-[10px] font-black text-amber-300/90 mt-0.5 drop-shadow">
                          +{val}
                        </span>
                      </button>
                    );
                  })}

                  {/* Reset / Clear Bet Button */}
                  <button
                    type="button"
                    onClick={() => handleUpdateBet(0)}
                    disabled={selectedBet === 0}
                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 text-red-300 font-bold text-[10px] sm:text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 shadow-md shrink-0 ml-1"
                    title="Очистить ставку"
                  >
                    <RotateCcw size={12} />
                    <span>Сброс</span>
                  </button>
                </div>

                {/* Minimalist Deal Button ("РАЗДАТЬ") */}
                <div className="relative z-10 w-full pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 px-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      myPlayer?.isReady ? "bg-emerald-400 animate-pulse" : "bg-white/30"
                    )} />
                    <span className="text-[11px] font-roobert text-white/70 truncate">
                      {readyPlayersCount} из {bettingPlayersCount || 1} готовы
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleReady(!myPlayer?.isReady)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer touch-manipulation select-none flex items-center gap-1 shrink-0 border shadow-sm active:scale-95",
                      myPlayer?.isReady
                        ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/80"
                        : "bg-white/10 hover:bg-white/20 border-white/20 text-white/90"
                    )}
                  >
                    {myPlayer?.isReady ? (
                      <>
                        <CheckCircle2 size={12} className="text-emerald-400" />
                        <span>Готов</span>
                      </>
                    ) : (
                      <>
                        <Play size={11} className="text-amber-400 fill-amber-400" />
                        <span>Готов</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ACTIVE TURN ACTION HUD WITH 30s COUNTDOWN */}
            {isMyTurn && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative flex flex-col items-center gap-2 bg-[#0c120c] border-2 border-amber-500/60 p-2.5 sm:p-3.5 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.98),0_0_30px_rgba(0,0,0,0.9)] overflow-hidden max-w-[95vw]"
              >
                {/* Glass top reflection */}
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.14] to-transparent pointer-events-none rounded-t-2xl" />
                <div className="relative z-10 flex items-center gap-1.5 text-xs font-black text-amber-300 uppercase tracking-wider">
                  <Clock size={14} className="text-amber-400 animate-spin" />
                  <span>ВАШ ХОД: {clientTurnCountdown}с</span>
                </div>

                <div className="relative z-10 flex flex-row items-center justify-center gap-1.5 sm:gap-2.5 flex-nowrap">
                  <button
                    type="button"
                    onClick={() => handleAction('hit')}
                    disabled={isActionPending}
                    className="py-2.5 px-3 sm:px-4 rounded-xl bg-gradient-to-b from-[#15803d] to-[#052e16] border border-emerald-500/50 hover:brightness-110 text-emerald-100 font-black text-[11px] sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    ЕЩЁ (HIT)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('stand')}
                    disabled={isActionPending}
                    className="py-2.5 px-3 sm:px-4 rounded-xl bg-gradient-to-b from-[#991b1b] to-[#450a0a] border border-red-500/50 hover:brightness-110 text-red-100 font-black text-[11px] sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    ХВАТИТ (STAND)
                  </button>
                  {isDoubleEligible && (
                    <button
                      type="button"
                      onClick={() => handleAction('double')}
                      disabled={isActionPending}
                      className="py-2.5 px-3 sm:px-4 rounded-xl bg-gradient-to-b from-[#b45309] to-[#451a03] border border-amber-500/50 hover:brightness-110 text-amber-100 font-black text-[11px] sm:text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
                {`Ставки: ${Math.max(0, clientCountdown)}с`}
                {seatedRoomId && seatedRoomId !== roomId ? ' · смотрите' : ' · займите место'}
              </div>
            )}

            {/* DEALING PHASE BADGE */}
            {state.phase === 'dealing' && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/80 text-amber-300 px-4 py-1 text-xs font-bold shadow-lg backdrop-blur-md">
                <Sparkles size={14} className="text-amber-400 animate-spin" />
                Раздача карт...
              </div>
            )}

            {/* LUXURY 3D LIQUID GLASS OUTCOME BANNER */}
            {(state.phase === 'settling' || state.phase === 'finished') && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: -10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 300 }}
                className="relative z-30 flex flex-col items-center pointer-events-none"
              >
                {myOutcome ? (
                  myOutcome.type === 'blackjack' ? (
                    <div className="relative flex flex-col items-center px-8 py-3 rounded-2xl bg-gradient-to-b from-amber-950/95 via-black/90 to-black/98 border-2 border-amber-400 shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_30px_rgba(251,191,36,0.4)] backdrop-blur-2xl">
                      <div className="flex items-center gap-1.5 text-amber-300 font-black text-xs sm:text-sm uppercase tracking-widest">
                        <Sparkles size={16} className="text-amber-300 animate-spin" />
                        <span>{myOutcome.label}</span>
                        <Sparkles size={16} className="text-amber-300 animate-spin" />
                      </div>
                      <span className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent drop-shadow-md mt-0.5">
                        +{myOutcome.payout.toFixed(0)} {currencyLabel}
                      </span>
                    </div>
                  ) : myOutcome.type === 'win' ? (
                    <div className="relative flex flex-col items-center px-8 py-3 rounded-2xl bg-gradient-to-b from-emerald-950/95 via-black/90 to-black/98 border-2 border-emerald-400 shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_30px_rgba(16,185,129,0.4)] backdrop-blur-2xl">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs sm:text-sm uppercase tracking-widest">
                        <Trophy size={16} className="text-emerald-300" />
                        <span>{myOutcome.label}</span>
                      </div>
                      <span className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 bg-clip-text text-transparent drop-shadow-md mt-0.5">
                        +{myOutcome.payout.toFixed(0)} {currencyLabel}
                      </span>
                    </div>
                  ) : myOutcome.type === 'push' ? (
                    <div className="relative flex flex-col items-center px-8 py-3 rounded-2xl bg-gradient-to-b from-slate-900/95 via-black/90 to-black/98 border-2 border-amber-400/80 shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_20px_rgba(251,191,36,0.25)] backdrop-blur-2xl">
                      <span className="text-xs sm:text-sm font-black text-amber-300 uppercase tracking-wider">{myOutcome.label}</span>
                      <span className="text-lg sm:text-xl font-black text-white mt-0.5">Возврат {myOutcome.payout.toFixed(0)} {currencyLabel}</span>
                    </div>
                  ) : (
                    <div className="relative flex flex-col items-center px-8 py-3 rounded-2xl bg-gradient-to-b from-red-950/95 via-black/90 to-black/98 border-2 border-red-500/90 shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_25px_rgba(239,68,68,0.35)] backdrop-blur-2xl">
                      <span className="text-xs sm:text-sm font-black text-red-400 uppercase tracking-wider">{myOutcome.label}</span>
                      <span className="text-lg sm:text-xl font-black text-white/90 mt-0.5">-{myPlayer?.bet || 0} {currencyLabel}</span>
                    </div>
                  )
                ) : (
                  <div className="relative flex items-center gap-2 px-6 py-2.5 rounded-full bg-black/90 border border-amber-400/50 shadow-xl backdrop-blur-2xl">
                    <span className="text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wider">
                      РАУНД ЗАВЕРШЕН · ДИЛЕР {dealerScore > 21 ? 'ПЕРЕБОР' : dealerScore}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* TABLE SEATS ROW (BOTTOM ARC) */}
          <div className="absolute bottom-5 sm:bottom-8 inset-x-0 z-20 grid grid-cols-5 gap-1.5 sm:gap-6 md:gap-8 w-full items-end px-2 sm:px-6 pointer-events-auto max-w-[1100px] mx-auto">
            {SEATS_CONFIG.map((seat) => {
              const seatId = seat.id;
              const player = state.players.find((p) => p.seatId === seatId);
              const isMe = myPlayer?.seatId === seatId;
              const isCurrentTurn = state.phase === 'player_turn' && state.currentTurnSeatId === seatId;
              const isTurn = isCurrentTurn;
              const playerHandScore = player && player.hand.length > 0
                ? calculateHandValue(player.hand.map(convertCard)).total
                : 0;
              const playerOutcome = player ? getPlayerOutcome(player) : null;
              const outcome = playerOutcome?.type;

              return (
                <div
                  key={seatId}
                  className={cn(
                    'relative flex flex-col items-center justify-end min-w-0 transition-transform duration-300',
                    seat.arcOffset
                  )}
                >
                  {/* (A) CARDS AREA: Positioned above avatar */}
                  {player && player.hand.length > 0 && (
                    <div className="relative mb-1 pointer-events-none flex justify-center items-center gap-1 z-30">
                      {/* Main Hand */}
                      <div className="relative flex justify-center items-center rounded-lg p-0.5">
                        {player.hand.map((c, cardIdx) => (
                          <motion.div
                            key={`seat_${seatId}_card_${cardIdx}`}
                            initial={{
                              opacity: 0,
                              y: -160,
                              x: 100,
                              scale: 0.25,
                              rotate: -20,
                            }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              x: 0,
                              scale: 1,
                              rotate: 0,
                            }}
                            transition={{
                              type: 'spring',
                              damping: 18,
                              stiffness: 190,
                              mass: 0.8,
                            }}
                            className="relative"
                            style={{
                              marginLeft: cardIdx > 0 ? (isMe ? '-22px' : '-16px') : '0px',
                              zIndex: cardIdx + 1,
                            }}
                          >
                            <CasinoBlackjackCard
                              card={c}
                              isFaceDown={c.hidden}
                              className={
                                isMe
                                  ? 'w-[52px] h-[76px] sm:w-[66px] sm:h-[94px]'
                                  : 'w-[36px] h-[52px] sm:w-[44px] sm:h-[64px]'
                              }
                            />
                          </motion.div>
                        ))}
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/95 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-black text-amber-300 border border-amber-400/40 shadow-xl whitespace-nowrap">
                          {calculateHandValue(player.hand.map(convertCard)).total}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* (B) PLAYER LABEL */}
                  {player && (
                    <div className="h-4 sm:h-5 flex items-center justify-center mb-0.5 w-full">
                      <span className="font-bold text-[10px] sm:text-xs text-amber-300/90 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate max-w-[80px] sm:max-w-[120px] text-center">
                        {isMe ? 'ВЫ' : player.name}
                      </span>
                    </div>
                  )}

                  {/* (C) 3D LIQUID GLASS DISK / AVATAR SLOT */}
                  <div className="relative flex flex-col items-center">
                    {player ? (
                      <>
                        {/* Occupied Seat Avatar with Golden Glow Ring */}
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

                        {/* READY BADGE ON AVATAR (Visible during betting / countdown) */}
                        {player && player.isReady && (state.phase === 'waiting' || state.phase === 'countdown') && (
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute -top-1.5 -right-1.5 z-40 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-black text-[8px] sm:text-[9px] font-black uppercase shadow-[0_0_12px_rgba(16,185,129,0.9)] border border-emerald-300 pointer-events-none"
                          >
                            <CheckCircle2 size={10} strokeWidth={3} className="text-black shrink-0" />
                            <span>Готов</span>
                          </motion.div>
                        )}

                        {/* LEAVE SEAT BUTTON ON AVATAR (Visible during waiting / countdown for own seat) */}
                        {isMe && (state.phase === 'waiting' || state.phase === 'countdown') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLeaveSeat();
                            }}
                            className="absolute -bottom-1 -left-1 z-40 flex items-center justify-center w-5 h-5 rounded-full bg-red-600/90 hover:bg-red-500 text-white shadow-lg border border-red-400 cursor-pointer active:scale-95 transition-all"
                            title="Встать из-за стола"
                          >
                            <LogOut size={10} />
                          </button>
                        )}
                      </>
                    ) : (
                      /* Empty Seat: 3D Liquid Glass Disc with Perfectly Centered SVG Plus */
                      <button
                        onClick={() => handleJoinSeat(seatId)}
                        className="relative flex w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-500/35 bg-gradient-to-b from-black/50 to-black/85 backdrop-blur-md shadow-[0_8px_20px_rgba(0,0,0,0.7),inset_0_2px_4px_rgba(255,255,255,0.15),inset_0_-2px_4px_rgba(0,0,0,0.7)] hover:border-amber-400 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] transition-all active:scale-95 group cursor-pointer"
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

      {/* Floating Action Bar (Minimalist Table Switcher + Chat Button) */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        {/* Minimalist Table Switcher Button */}
        <div className="relative">
          <button
            onClick={() => {
              setIsTableMenuOpen((v) => !v);
              void fetchAvailableTables();
              soundManager.play('ui.click');
            }}
            className="flex h-12 items-center gap-2 px-3 rounded-2xl border border-white/20 bg-black/85 text-frost-white shadow-2xl backdrop-blur-xl hover:border-amber-400/40 hover:text-amber-300 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title="Выбор стола"
          >
            <Users size={16} className="text-amber-400 shrink-0" />
            <div className="flex flex-col items-start leading-none text-left">
              <span className="text-[11px] font-bold text-amber-300">
              {roomId === 'bj_table_1' ? 'Стол #1' : `Стол #${roomId.replace('bj_table_', '')}`}
              </span>
              <span className="text-[9px] text-white/50 font-mono mt-0.5">
                {state.players.length}/5 мест
              </span>
            </div>
            <ChevronDown size={13} className={cn("text-white/40 transition-transform duration-200", isTableMenuOpen && "rotate-180")} />
          </button>

          {/* Minimalist Table List Popover */}
          <AnimatePresence>
            {isTableMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-14 right-0 w-64 rounded-2xl border border-white/15 bg-[#0a0f0a]/95 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.95)] p-2.5 flex flex-col gap-2 z-50 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 px-1">
                  <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    Столы Blackjack
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void goToFreeTable();
                    }}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase font-mono tracking-tight cursor-pointer"
                  >
                    Авто-поиск
                  </button>
                </div>

                <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-0.5">
                  {availableTables.map((tbl) => {
                    const isCurrent = tbl.roomId === roomId;
                    const isCountdown = tbl.phase === 'countdown';
                    const isPlayerTurn = tbl.phase === 'player_turn';
                    const isDealerTurn = tbl.phase === 'dealer_turn';
                    const maxSeats = tbl.maxSeats ?? 5;
                    const isFull = tbl.playersCount >= maxSeats;
                    const isEmpty = tbl.playersCount === 0;

                    return (
                      <button
                        key={tbl.roomId}
                        type="button"
                        onClick={() => {
                          if (isCurrent) {
                            setIsTableMenuOpen(false);
                            return;
                          }
                          switchTable(tbl.roomId, 'watch');
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-2 rounded-xl text-left border transition-all cursor-pointer",
                          isCurrent
                            ? "border-amber-400/60 bg-amber-400/15 shadow-sm"
                            : "border-white/10 bg-black/40 hover:bg-white/10 hover:border-white/20"
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              isCurrent ? "bg-emerald-400 animate-pulse" : isEmpty ? "bg-white/70" : "bg-white/40"
                            )} />
                            <span className={cn(
                              "text-xs font-bold truncate",
                              isCurrent ? "text-amber-200" : "text-frost-white"
                            )}>
                              {tbl.roomId === 'bj_table_1' ? 'Стол #1 (Главный)' : `Стол #${tbl.roomId.replace('bj_table_', '')}`}
                            </span>
                          </div>
                          <span className="text-[9px] text-white/50 mt-0.5">
                            {isCurrent
                              ? 'Смотрите сейчас'
                              : isEmpty
                              ? 'Свободен · сесть или смотреть'
                              : isFull
                              ? 'Полный · можно смотреть'
                              : isCountdown
                              ? `Ставки (${tbl.countdown}с) · смотреть`
                              : isPlayerTurn
                              ? 'Ход игроков · смотреть'
                              : isDealerTurn
                              ? 'Ход дилера · смотреть'
                              : 'Ожидание ставок · смотреть'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-md border text-[9px] font-mono font-bold",
                            isFull
                              ? "bg-white/10 border-white/15 text-white/55"
                              : isEmpty
                              ? "bg-white/[0.08] border-white/20 text-frost-white"
                              : "bg-black/60 border-white/10 text-white/80"
                          )}>
                            {tbl.playersCount}/{maxSeats}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Round History Button */}
        <button
          onClick={() => {
            setIsHistoryOpen(true);
            void fetchTableHistory();
            soundManager.play('ui.click');
          }}
          className="flex h-12 items-center gap-2 px-3 rounded-2xl border border-white/15 bg-black/85 text-frost-white shadow-2xl backdrop-blur-xl hover:border-white/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="История раундов"
        >
          <History size={18} className="text-amber-400 shrink-0" />
          <div className="flex flex-col items-start leading-none text-left hidden sm:flex">
            <span className="text-[11px] font-bold text-frost-white">
              История
            </span>
            <span className="text-[9px] text-white/50 font-mono mt-0.5">
              Раунды
            </span>
          </div>
        </button>

        {/* Floating Chat Open Button */}
        <button
          onClick={() => {
            setIsChatOpen(true);
            setUnreadChatCount(0);
            soundManager.play('ui.click');
          }}
          className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-black/85 text-amber-300 shadow-2xl backdrop-blur-xl hover:bg-black hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          title="Чат стола"
        >
          <MessageSquare size={20} />
          {unreadChatCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white border-2 border-black animate-pulse">
              {unreadChatCount}
            </span>
          )}
        </button>
      </div>

      {/* Slide-over Multiplayer Table Chat Drawer */}
      <BlackjackTableChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        currentUserId={user?.id}
        players={state.players}
      />

      <BlackjackHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        roomId={roomId}
        history={tableHistory}
        currentUserId={user?.id}
      />

      {/* Rules Modal */}
      <BlackjackRulesModal
        open={showRules}
        onClose={() => setShowRules(false)}
      />
    </main>
  );
}
