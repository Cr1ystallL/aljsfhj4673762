'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useTelegramAuth } from '@/hooks/use-telegram-auth';
import { cn } from '@/lib/utils';
import { createAuthenticatedWebSocket } from '@/lib/websocket/authenticated-client';
import type { WSMessage, ServerBlackjackSeatUpdateEvent, ServerBlackjackStateEvent } from '@casino/shared';

interface Occupant {
  id: string;
  name: string;
  avatar?: string;
}

interface Seat {
  id: number;
  occupant?: Occupant | null;
  hand?: Card[];
  bet?: number;
  status?: 'playing' | 'stand' | 'bust' | 'blackjack' | 'surrender';
}

interface Room {
  id: string;
  label: string;
  seats: Seat[];
}

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
}

type GamePhase = 'waiting' | 'countdown' | 'dealing' | 'player_turn' | 'dealer_turn' | 'settling';

interface GameState {
  phase: GamePhase;
  countdown: number;
  dealerHand: Card[];
  currentTurnSeatId: number | null;
  roundId: string;
}

// Multiplayer seat positions (6 seats)
const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  1: { left: '10%', top: '58%' },
  2: { left: '26%', top: '70%' },
  3: { left: '42%', top: '76%' },
  4: { left: '58%', top: '76%' },
  5: { left: '74%', top: '70%' },
  6: { left: '90%', top: '58%' },
};

// Solo seat position (1 seat in center)
const SOLO_SEAT_POSITION: { left: string; top: string } = { left: '50%', top: '72%' };

const MODE_CARDS: Array<{
  key: 'solo' | 'multi';
  title: string;
  subtitle: string;
  image: string;
}> = [
  {
    key: 'solo',
    title: 'SOLO',
    subtitle: 'Тренируйся один за столом',
    image: '/BLACKJACK_SOLO.png',
  },
  {
    key: 'multi',
    title: 'MULTIPLAYER',
    subtitle: 'Комнаты до 6 игроков',
    image: '/BLACKJACK_MULTIPLAYER.png',
  },
];

const roomIdFromIndex = (idx: number) => `blackjack-${idx}`;

function createRoom(id: number): Room {
  const seats: Seat[] = Array.from({ length: 6 }, (_, idx) => ({ id: idx + 1 }));
  return {
    id: roomIdFromIndex(id),
    label: `Комната ${id}`,
    seats,
  };
}

function countFilled(seats: Seat[]) {
  return seats.filter((s) => !!s.occupant).length;
}

function ensureEmptyRoom(rooms: Room[]): Room[] {
  // Новая комната появляется только когда последняя комната полностью заполнена (6/6)
  if (rooms.length === 0) return [createRoom(1)];
  const lastRoom = rooms[rooms.length - 1];
  const lastRoomFilled = countFilled(lastRoom.seats);
  if (lastRoomFilled >= 6) {
    return [...rooms, createRoom(rooms.length + 1)];
  }
  return rooms;
}

function Avatar({ occupant }: { occupant: Occupant }) {
  const initials = occupant.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-11 w-11 rounded-full border border-white/20 bg-white/5 overflow-hidden flex items-center justify-center text-sm font-semibold text-frost-white shadow-lg shadow-black/40">
      {occupant.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={occupant.avatar}
          alt={occupant.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function InlineBetControls({ bet, onChange }: { bet: number; onChange: (value: number) => void }) {
  const fmt = (v: number) => v.toLocaleString('ru-RU');

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, Math.floor(bet / 2)))}
        className="h-5 px-1.5 rounded border border-white/15 bg-white/[0.08] text-[9px] text-white transition hover:border-white/30 hover:bg-white/[0.14]"
      >
        ½
      </button>
      <button
        type="button"
        onClick={() => onChange(Math.min(1_000_000, bet * 2))}
        className="h-5 px-1.5 rounded border border-white/15 bg-white/[0.08] text-[9px] text-white transition hover:border-white/30 hover:bg-white/[0.14]"
      >
        ×2
      </button>
    </div>
  );
}

function SeatSpot({
  seat,
  position,
  isYou,
  onSelect,
  bet,
  onBetChange,
  onLeave,
}: {
  seat: Seat;
  position: { left: string; top: string };
  isYou: boolean;
  onSelect: () => void;
  bet: number;
  onBetChange: (value: number) => void;
  onLeave?: () => void;
}) {
  const occupiedByOther = !!seat.occupant && !isYou;
  const isEmpty = !seat.occupant;

  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: position.left, top: position.top }}
    >
      {/* Empty seat - small green plus button */}
      {isEmpty && (
        <button
          type="button"
          onClick={onSelect}
          disabled={occupiedByOther}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/20 text-emerald-300 text-lg font-bold transition-all shadow-lg shadow-black/50 backdrop-blur hover:bg-emerald-500/30 hover:scale-110"
        >
          +
        </button>
      )}

      {/* Occupied by other - show avatar */}
      {occupiedByOther && (
        <div className="flex flex-col items-center gap-1">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/[0.08] shadow-lg">
            <Avatar occupant={seat.occupant!} />
          </div>
          <div className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] text-white/70 backdrop-blur">
            {seat.occupant!.name}
          </div>
        </div>
      )}

      {/* Your seat - avatar with leave button and bet controls */}
      {isYou && (
        <div className="flex flex-col items-center gap-1">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-900/30">
              <Avatar occupant={seat.occupant!} />
            </div>
            {/* Leave button (minus) in top-right corner */}
            <button
              type="button"
              onClick={onLeave}
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-red-400/50 bg-red-500/20 text-red-300 text-xs font-bold transition hover:bg-red-500/30"
            >
              −
            </button>
          </div>
          {/* Bet display */}
          <div className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
            {bet.toLocaleString('ru-RU')} zł
          </div>
          {/* Bet controls */}
          <InlineBetControls bet={bet} onChange={onBetChange} />
        </div>
      )}
    </div>
  );
}

export function BlackjackClient() {
  const { user } = useAuthStore();
  useTelegramAuth();

  const you: Occupant = useMemo(
    () => ({
      id: user?.id ?? 'you',
      name: user?.firstName || 'Вы',
      avatar: user?.photoUrl,
    }),
    [user?.firstName, user?.photoUrl, user?.id]
  );

  const [mode, setMode] = useState<'solo' | 'multi' | null>(null);
  const [bet, setBet] = useState(100);
  const [soloSeats, setSoloSeats] = useState<Seat[]>(() => [{ id: 1 }]);
  const [soloGameState, setSoloGameState] = useState<GameState>({
    phase: 'waiting',
    countdown: 10,
    dealerHand: [],
    currentTurnSeatId: null,
    roundId: '',
  });

  const [rooms, setRooms] = useState<Room[]>(() => ensureEmptyRoom([createRoom(1)]));
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [multiGameState, setMultiGameState] = useState<GameState | null>(null);
  const wsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(null);
  const roomWsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(null);
  const multiWsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(null);

  const sessionId = useAuthStore((s) => s.sessionId);

  const currentSoloSeat = soloSeats.find((s) => s.occupant?.id === you.id)?.id ?? null;
  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  const handleSoloSeat = (seatId: number) => {
    setSoloSeats((prev) => {
      const next = prev.map((s) =>
        s.occupant?.id === you.id
          ? { ...s, occupant: undefined, hand: undefined, bet: undefined, status: undefined }
          : s
      );
      const target = next.find((s) => s.id === seatId);
      if (!target) return prev;
      if (target.occupant && target.occupant.id !== 'you') return prev;
      target.occupant = you;
      target.bet = bet;
      return [...next];
    });
  };

  const handleSoloLeave = () => {
    setSoloSeats((prev) => prev.map((s) => ({ ...s, occupant: undefined, hand: undefined, bet: undefined, status: undefined })));
    setSoloGameState({
      phase: 'waiting',
      countdown: 10,
      dealerHand: [],
      currentTurnSeatId: null,
      roundId: '',
    });
  };

  // Blackjack game logic helpers
  const createDeck = (): Card[] => {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };

  const getCardValue = (card: Card): number => {
    if (card.rank === 'A') return 11;
    if (['K', 'Q', 'J'].includes(card.rank)) return 10;
    return parseInt(card.rank);
  };

  const calculateHandValue = (hand: Card[]): { total: number; soft: boolean } => {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.hidden) continue;
      if (card.rank === 'A') {
        aces++;
        total += 11;
      } else if (['K', 'Q', 'J'].includes(card.rank)) {
        total += 10;
      } else {
        total += parseInt(card.rank);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  };

  const isBlackjack = (hand: Card[]): boolean => {
    return hand.length === 2 && calculateHandValue(hand).total === 21;
  };

  const dealCard = (deck: Card[], hidden = false): { card: Card; remaining: Card[] } => {
    const card = { ...deck[0], hidden };
    return { card, remaining: deck.slice(1) };
  };

  // Solo game timer and dealing effect
  useEffect(() => {
    if (mode !== 'solo') return;
    const occupiedSeats = soloSeats.filter((s) => s.occupant);
    
    // If someone is sitting, start/restart countdown
    if (occupiedSeats.length > 0 && soloGameState.phase === 'waiting') {
      setSoloGameState((prev) => ({ ...prev, phase: 'countdown' }));
    }
    
    // If everyone left, reset to waiting
    if (occupiedSeats.length === 0 && soloGameState.phase !== 'waiting') {
      setSoloGameState({
        phase: 'waiting',
        countdown: 10,
        dealerHand: [],
        currentTurnSeatId: null,
        roundId: '',
      });
      setSoloSeats((prev) => prev.map((s) => ({ ...s, hand: undefined, status: undefined })));
    }
  }, [mode, soloSeats, soloGameState.phase]);

  // Countdown timer
  useEffect(() => {
    if (mode !== 'solo' || soloGameState.phase !== 'countdown') return;
    
    const timer = setInterval(() => {
      setSoloGameState((prev) => {
        if (prev.countdown <= 1) {
          // Start dealing
          startSoloRound();
          return { ...prev, phase: 'dealing', countdown: 0 };
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [mode, soloGameState.phase]);

  const startSoloRound = () => {
    const deck = createDeck();
    let currentDeck = deck;
    const roundId = `solo_${Date.now()}`;
    
    // Deal first card to player (if seated)
    setSoloSeats((prev) => {
      const next = [...prev];
      const playerSeat = next.find((s) => s.occupant);
      if (playerSeat) {
        const { card, remaining } = dealCard(currentDeck);
        currentDeck = remaining;
        playerSeat.hand = [card];
      }
      return next;
    });
    
    // Deal first card to dealer (visible) after 500ms
    setTimeout(() => {
      const { card, remaining } = dealCard(currentDeck);
      currentDeck = remaining;
      setSoloGameState((prev) => ({ ...prev, dealerHand: [card] }));
      
      // Deal second card to player after 500ms
      setTimeout(() => {
        setSoloSeats((prev) => {
          const next = [...prev];
          const playerSeat = next.find((s) => s.occupant);
          if (playerSeat && currentDeck.length > 0) {
            const { card: card2, remaining } = dealCard(currentDeck);
            currentDeck = remaining;
            playerSeat.hand = [...(playerSeat.hand || []), card2];
            
            // Check for blackjack
            if (isBlackjack(playerSeat.hand)) {
              playerSeat.status = 'blackjack';
            } else {
              playerSeat.status = 'playing';
            }
          }
          return next;
        });
        
        // Deal second card to dealer (hidden) after 500ms
        setTimeout(() => {
          const { card: hiddenCard, remaining } = dealCard(currentDeck, true);
          setSoloGameState((prev) => ({
            ...prev,
            dealerHand: [...prev.dealerHand, hiddenCard],
            phase: 'player_turn',
            currentTurnSeatId: 1,
            roundId,
          }));
        }, 500);
      }, 500);
    }, 500);
  };

  // Player actions
  const handleHit = () => {
    if (soloGameState.phase !== 'player_turn') return;
    
    const deck = createDeck();
    const { card } = dealCard(deck);
    
    setSoloSeats((prev) => {
      const next = [...prev];
      const playerSeat = next.find((s) => s.occupant);
      if (playerSeat) {
        playerSeat.hand = [...(playerSeat.hand || []), card];
        const { total } = calculateHandValue(playerSeat.hand);
        if (total > 21) {
          playerSeat.status = 'bust';
          // End round - dealer wins
          setTimeout(() => finishSoloRound(), 1000);
        }
      }
      return next;
    });
  };

  const handleStand = () => {
    if (soloGameState.phase !== 'player_turn') return;
    
    setSoloSeats((prev) => {
      const next = [...prev];
      const playerSeat = next.find((s) => s.occupant);
      if (playerSeat) {
        playerSeat.status = 'stand';
      }
      return next;
    });
    
    // Start dealer turn
    setSoloGameState((prev) => ({ ...prev, phase: 'dealer_turn' }));
    setTimeout(() => playDealerTurn(), 1000);
  };

  const handleDouble = () => {
    if (soloGameState.phase !== 'player_turn') return;
    
    setSoloSeats((prev) => {
      const next = [...prev];
      const playerSeat = next.find((s) => s.occupant);
      if (playerSeat && playerSeat.bet) {
        playerSeat.bet *= 2;
      }
      return next;
    });
    
    // Hit one more card then stand
    handleHit();
    setTimeout(() => handleStand(), 500);
  };

  const playDealerTurn = () => {
    // Reveal hidden card
    setSoloGameState((prev) => ({
      ...prev,
      dealerHand: prev.dealerHand.map((c) => ({ ...c, hidden: false })),
    }));
    
    setTimeout(() => {
      const { total } = calculateHandValue(soloGameState.dealerHand);
      
      if (total < 17) {
        // Dealer hits
        const deck = createDeck();
        const { card } = dealCard(deck);
        setSoloGameState((prev) => ({
          ...prev,
          dealerHand: [...prev.dealerHand, card],
        }));
        setTimeout(() => playDealerTurn(), 1000);
      } else {
        // Dealer stands or busts
        finishSoloRound();
      }
    }, 1000);
  };

  const finishSoloRound = async () => {
    setSoloGameState((prev) => ({ ...prev, phase: 'settling' }));
    
    const playerSeat = soloSeats.find((s) => s.occupant);
    const playerHand = playerSeat?.hand || [];
    const playerValue = calculateHandValue(playerHand).total;
    const dealerValue = calculateHandValue(soloGameState.dealerHand).total;
    
    const playerHasBlackjack = isBlackjack(playerHand);
    const dealerHasBlackjack = isBlackjack(soloGameState.dealerHand);
    
    // Determine winner and settle bets
    let result: 'win' | 'lose' | 'push' | 'blackjack' = 'lose';
    let payout = 0;
    
    if (playerHasBlackjack && !dealerHasBlackjack) {
      result = 'blackjack';
      payout = (playerSeat?.bet || 0) * 2.5; // 3:2 payout
    } else if (playerValue > 21) {
      result = 'lose';
      payout = 0;
    } else if (dealerValue > 21) {
      result = 'win';
      payout = (playerSeat?.bet || 0) * 2;
    } else if (playerValue > dealerValue) {
      result = 'win';
      payout = (playerSeat?.bet || 0) * 2;
    } else if (playerValue === dealerValue) {
      result = 'push';
      payout = playerSeat?.bet || 0;
    } else {
      result = 'lose';
      payout = 0;
    }
    
    // Send result to backend
    try {
      const response = await fetch('/api/games/blackjack/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bet: playerSeat?.bet || 0,
          result,
          payout,
          playerHand: playerHand.map(c => ({ suit: c.suit, rank: c.rank })),
          dealerHand: soloGameState.dealerHand.map(c => ({ suit: c.suit, rank: c.rank })),
          mode: 'solo',
          roundId: soloGameState.roundId,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Update local balance if needed
          console.log('Round finished:', { result, payout, newBalance: data.balance });
        }
      }
    } catch (error) {
      console.error('Failed to send game result:', error);
    }
    
    // Reset for next round after delay
    setTimeout(() => {
      setSoloGameState({
        phase: 'waiting',
        countdown: 10,
        dealerHand: [],
        currentTurnSeatId: null,
        roundId: '',
      });
      setSoloSeats((prev) => prev.map((s) => ({ ...s, hand: undefined, status: undefined, bet: undefined })));
    }, 3000);
  };

  const handleRoomSeat = (seatId: number) => {
    if (!activeRoom) return;
    
    // Check if already seated - then leave
    const currentSeat = activeRoom.seats.find((s) => s.occupant?.id === you.id);
    if (currentSeat) {
      // Leave current seat
      setRooms((prev) => {
        const nextRooms = prev.map((room) => {
          if (room.id !== activeRoom.id) return room;
          const seats = room.seats.map((s) =>
            s.occupant?.id === you.id ? { ...s, occupant: undefined } : s
          );
          return { ...room, seats };
        });
        return ensureEmptyRoom(nextRooms);
      });
      
      // Send leave to backend
      if (wsRef.current) {
        wsRef.current.send({
          type: 'bj:leave_game',
          payload: { roomId: activeRoom.id },
          timestamp: Date.now(),
        });
      }
      setMultiGameState(null);
      return;
    }
    
    // Join new seat
    setRooms((prev) => {
      const nextRooms = prev.map((room) => {
        if (room.id !== activeRoom.id) return room;
        const seats = room.seats.map((s) =>
          s.occupant?.id === you.id ? { ...s, occupant: undefined } : s
        );
        const target = seats.find((s) => s.id === seatId);
        if (!target) return room;
        if (target.occupant && target.occupant.id !== you.id) return room;
        target.occupant = you;
        return { ...room, seats };
      });
      return ensureEmptyRoom(nextRooms);
    });

    // Send presence update
    if (wsRef.current && sessionId) {
      wsRef.current.send({
        type: 'bj:seat',
        payload: { roomId: activeRoom.id, seatId, name: you.name, avatar: you.avatar },
        timestamp: Date.now(),
      });
      
      // Join actual game
      wsRef.current.send({
        type: 'bj:join_game',
        payload: { roomId: activeRoom.id, seatId, name: you.name, avatar: you.avatar, bet },
        timestamp: Date.now(),
      });
    }
  };

  // Multiplayer actions
  const handleMultiHit = () => {
    if (!activeRoom || !wsRef.current) return;
    wsRef.current.send({
      type: 'bj:hit',
      payload: { roomId: activeRoom.id },
      timestamp: Date.now(),
    });
  };

  const handleMultiStand = () => {
    if (!activeRoom || !wsRef.current) return;
    wsRef.current.send({
      type: 'bj:stand',
      payload: { roomId: activeRoom.id },
      timestamp: Date.now(),
    });
  };

  const handleMultiDouble = () => {
    if (!activeRoom || !wsRef.current) return;
    wsRef.current.send({
      type: 'bj:double',
      payload: { roomId: activeRoom.id },
      timestamp: Date.now(),
    });
  };

  const currentRoomSeatId = activeRoom?.seats.find((s) => s.occupant?.id === you.id)?.id ?? null;

  // --- Load rooms from server and subscribe to real-time updates via WebSocket ---
  useEffect(() => {
    if (mode !== 'multi') return;

    // Initial load via REST API
    const loadRooms = async () => {
      try {
        const res = await fetch('/api/games/blackjack/rooms', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.rooms)) {
            setRooms((prev) => {
              const serverRooms = data.rooms.map((r: any) => ({
                id: r.id,
                label: r.label || `Комната ${r.id.split('-')[1]}`,
                seats: Array.isArray(r.seats)
                  ? r.seats.map((s: any) => ({
                      id: s.id,
                      occupant: s.occupant
                        ? {
                            id: s.occupant.id,
                            name: s.occupant.name,
                            avatar: s.occupant.avatar,
                          }
                        : undefined,
                    }))
                  : Array.from({ length: 6 }, (_, i) => ({ id: i + 1 })),
              }));
              return ensureEmptyRoom(serverRooms);
            });
          }
        }
      } catch {
        // Fallback to local state on error
      }
    };

    loadRooms();

    // Subscribe to all blackjack rooms via WebSocket for real-time updates
    if (sessionId) {
      const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
      const base = /\/ws$/.test(baseRaw) ? baseRaw : `${baseRaw.replace(/\/$/, '')}/ws`;
      const ws = createAuthenticatedWebSocket(base);
      roomWsRef.current = ws;

      const connect = async () => {
        await ws.connectAuthenticated(sessionId);
        // Subscribe to all blackjack rooms
        rooms.forEach((room) => {
          if (room.id.startsWith('blackjack')) {
            ws.send({ type: 'game:join', payload: { roomId: room.id }, timestamp: Date.now() });
          }
        });

        ws.onMessage((msg: WSMessage) => {
          if (msg.type === 'bj:state') {
            const payload = (msg as any).payload;
            // Check if this is a multiplayer game state (has phase) or room presence update
            if (payload.phase && payload.players) {
              // Multiplayer game state from engine
              if (activeRoomId === payload.roomId) {
                setMultiGameState({
                  phase: payload.phase,
                  countdown: payload.countdown,
                  dealerHand: payload.dealerHand || [],
                  currentTurnSeatId: payload.currentTurnSeatId,
                  roundId: payload.roundId,
                });
                // Update room seats with game data
                setRooms((prev) => {
                  return prev.map((r) => {
                    if (r.id !== payload.roomId) return r;
                    // Map players to seats
                    const seatsWithHands = r.seats.map((s) => {
                      const player = payload.players.find((p: any) => p.seatId === s.id);
                      if (player) {
                        return {
                          ...s,
                          hand: player.hand,
                          bet: player.bet,
                          status: player.status,
                        };
                      }
                      return s;
                    });
                    return { ...r, seats: seatsWithHands };
                  });
                });
              }
            } else if (payload.seats) {
              // Room presence update
              const { roomId, seats, label } = payload;
              setRooms((prev) => {
                const exists = prev.some((r) => r.id === roomId);
                let next;
                if (exists) {
                  next = prev.map((r) => (r.id === roomId ? { ...r, seats, label: label || r.label } : r));
                } else {
                  next = [...prev, { id: roomId, label: label || `Комната ${roomId.split('-')[1]}`, seats }];
                }
                return ensureEmptyRoom(next);
              });
            }
          }
          if (msg.type === 'bj:seat_update') {
            const { roomId, seats } = (msg as ServerBlackjackSeatUpdateEvent).payload;
            setRooms((prev) => {
              const exists = prev.some((r) => r.id === roomId);
              if (!exists) {
                return ensureEmptyRoom([...prev, { id: roomId, label: `Комната ${roomId.split('-')[1]}`, seats }]);
              }
              return ensureEmptyRoom(prev.map((r) => (r.id === roomId ? { ...r, seats } : r)));
            });
          }
        });

        ws.onDisconnect(() => {
          setTimeout(() => {
            connect().catch(() => {});
          }, 2000);
        });
      };

      connect().catch(() => {});
    }

    return () => {
      if (roomWsRef.current) {
        roomWsRef.current.disconnect();
        roomWsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sessionId]);

  // --- WebSocket handlers for multiplayer ---
  useEffect(() => {
    if (!sessionId || !mode) return;

    if (!activeRoomId) return;

    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
    const base = /\/ws$/.test(baseRaw) ? baseRaw : `${baseRaw.replace(/\/$/, '')}/ws`;
    const ws = createAuthenticatedWebSocket(base);
    wsRef.current = ws;

    let unsub: (() => void) | null = null;

    const connect = async () => {
      await ws.connectAuthenticated(sessionId);
      // Join room
      ws.send({ type: 'game:join', payload: { roomId: activeRoomId }, timestamp: Date.now() });
      // Subscribe to messages
      unsub = ws.onMessage((msg: WSMessage) => {
        if (msg.type === 'bj:state') {
          const { roomId, seats, label } = (msg as ServerBlackjackStateEvent).payload;
          setRooms((prev) => {
            const next = prev.map((r) => (r.id === roomId ? { ...r, seats, label } : r));
            // ensure exists
            if (!next.find((r) => r.id === roomId)) next.push({ id: roomId, label, seats });
            return next;
          });
        }
        if (msg.type === 'bj:seat_update') {
          const { roomId, seats } = (msg as ServerBlackjackSeatUpdateEvent).payload;
          setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, seats } : r)));
        }
      });

      ws.onDisconnect(() => {
        setTimeout(() => {
          connect().catch(() => {});
        }, 1000);
      });
    };

    connect().catch(() => {});

    return () => {
      if (wsRef.current && activeRoomId) {
        wsRef.current.send({
          type: 'game:leave',
          payload: { roomId: activeRoomId },
          timestamp: Date.now(),
        });
      }
      if (unsub) unsub();
      ws.disconnect();
      wsRef.current = null;
    };
  }, [activeRoomId, mode, sessionId]);

  const renderModeSelection = () => (
    <div className="grid grid-cols-1 gap-4">
      {MODE_CARDS.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => {
            setMode(card.key);
            if (card.key === 'multi') setActiveRoomId(null);
          }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left shadow-xl"
        >
          <div className="relative aspect-[16/9] w-full">
            <Image
              src={card.image}
              alt={card.title}
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/65" />
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <p className="text-[12px] uppercase tracking-[0.12em] text-amber-200/80">Blackjack</p>
              <p className="font-roobert text-[20px] text-white">{card.title}</p>
              <p className="text-[13px] text-white/80">{card.subtitle}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  // Subscribe to rooms updates when rooms change
  useEffect(() => {
    if (!roomWsRef.current || mode !== 'multi') return;
    const ws = roomWsRef.current;
    if (ws.isConnected()) {
      rooms.forEach((room) => {
        if (room.id.startsWith('blackjack')) {
          ws.send({ type: 'game:join', payload: { roomId: room.id }, timestamp: Date.now() });
        }
      });
    }
  }, [rooms, mode]);

  // Card component
  const CardDisplay = ({ card, small = false }: { card: Card; small?: boolean }) => {
    if (card.hidden) {
      return (
        <div className={cn(
          'rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 border border-white/20 flex items-center justify-center shadow-lg',
          small ? 'h-10 w-7' : 'h-16 w-11'
        )}>
          <span className="text-white/50 text-xs">?</span>
        </div>
      );
    }
    
    const suitSymbols: Record<Suit, string> = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠',
    };
    
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    
    return (
      <div className={cn(
        'rounded-lg bg-white border border-white/20 flex flex-col items-center justify-center shadow-lg',
        small ? 'h-10 w-7' : 'h-16 w-11',
        isRed ? 'text-red-600' : 'text-black'
      )}>
        <span className={cn('font-bold leading-none', small ? 'text-[10px]' : 'text-sm')}>{card.rank}</span>
        <span className={cn('leading-none', small ? 'text-[8px]' : 'text-xs')}>{suitSymbols[card.suit]}</span>
      </div>
    );
  };

  const renderTable = (
    seats: Seat[],
    onSeat: (id: number) => void,
    activeSeatId: number | null,
    onLeave?: () => void,
    isSolo: boolean = false,
    gameState?: GameState
  ) => {
    const isPlayerTurn = gameState?.phase === 'player_turn' && activeSeatId;
    const showActions = isSolo && isPlayerTurn;
    
    return (
    <div className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-3xl bg-[#05060c] shadow-2xl">
      <div className="relative aspect-[4/3.5]">
        <Image src="/BJ_table.png" alt="Blackjack table" fill className="object-contain" priority />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/40 to-black/65" />

        {/* Status bar */}
        <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
          <Users size={16} className="text-amber-300" />
          <span>{isSolo ? '1 на 1 с дилером' : `Свободных мест: ${6 - countFilled(seats)}/6`}</span>
          {activeSeatId && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-50 border border-emerald-300/30">
              Вы на месте {activeSeatId}
            </span>
          )}
        </div>

        {/* Countdown timer - compact like Wheel/Crash */}
        {(isSolo && gameState?.phase === 'countdown') || (!isSolo && multiGameState?.phase === 'countdown') ? (
          <div className="absolute left-1/2 top-[5%] z-30 -translate-x-1/2">
            <div className="flex flex-col items-center">
              <div className="rounded-full border border-amber-300/50 bg-black/80 px-4 py-1.5 text-center shadow-lg">
                <span className="font-roobert text-[18px] font-bold text-amber-300">
                  {isSolo ? soloGameState.countdown : multiGameState?.countdown}
                </span>
                <span className="ml-1.5 text-[12px] text-white/70">сек</span>
              </div>
              <span className="mt-1 text-[11px] text-white/60">Раздача через...</span>
            </div>
          </div>
        ) : null}

        {/* Phase indicator for waiting/betting phase */}
        {(isSolo && gameState?.phase === 'waiting') || (!isSolo && multiGameState?.phase === 'waiting') ? (
          <div className="absolute left-1/2 top-[5%] z-30 -translate-x-1/2">
            <div className="flex flex-col items-center">
              <div className="rounded-full border border-white/20 bg-black/60 px-4 py-1.5 text-center">
                <span className="text-[12px] text-white/80">Ожидание игроков...</span>
              </div>
              <span className="mt-1 text-[10px] text-white/50">Сядьте за стол, чтобы начать</span>
            </div>
          </div>
        ) : null}

        {/* Dealer area - top center */}
        <div className="absolute left-1/2 top-[12%] -translate-x-1/2 z-20">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {gameState?.dealerHand.map((card, idx) => (
                <CardDisplay key={idx} card={card} />
              ))}
            </div>
            {gameState && gameState.dealerHand.length > 0 && (
              <div className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/70 border border-white/10">
                Дилер: {calculateHandValue(gameState.dealerHand).total}
              </div>
            )}
          </div>
        </div>

        {/* Player hands and seats */}
        {isSolo ? (
          <>
            {/* Solo seat */}
            <SeatSpot
              key={1}
              seat={seats[0] || { id: 1 }}
              position={SOLO_SEAT_POSITION}
              isYou={seats[0]?.occupant?.id === you.id}
              onSelect={() => onSeat(1)}
              onLeave={onLeave}
              bet={bet}
              onBetChange={setBet}
            />
            
            {/* Player hand display */}
            {seats[0]?.hand && seats[0].hand.length > 0 && (
              <div 
                className="absolute z-25 flex flex-col items-center gap-1"
                style={{ left: SOLO_SEAT_POSITION.left, top: '55%' }}
              >
                <div className="flex items-center gap-1">
                  {seats[0].hand.map((card, idx) => (
                    <CardDisplay key={idx} card={card} />
                  ))}
                </div>
                {seats[0].status && (
                  <div className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium border',
                    seats[0].status === 'bust' && 'bg-red-400/20 text-red-300 border-red-400/30',
                    seats[0].status === 'blackjack' && 'bg-amber-400/20 text-amber-300 border-amber-400/30',
                    seats[0].status === 'stand' && 'bg-blue-400/20 text-blue-300 border-blue-400/30',
                    seats[0].status === 'playing' && 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30'
                  )}>
                    {calculateHandValue(seats[0].hand).total} 
                    {seats[0].status === 'bust' && ' - Перебор'}
                    {seats[0].status === 'blackjack' && ' - Блэкджек!'}
                    {seats[0].status === 'stand' && ' - Стоп'}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            {showActions && (
              <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
                <button
                  onClick={handleHit}
                  className="rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30 transition"
                >
                  Ещё (Hit)
                </button>
                <button
                  onClick={handleStand}
                  className="rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition"
                >
                  Хватит (Stand)
                </button>
                {seats[0]?.hand?.length === 2 && (
                  <button
                    onClick={handleDouble}
                    className="rounded-xl border border-blue-400/50 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/30 transition"
                  >
                    Удвоить (Double)
                  </button>
                )}
              </div>
            )}

            {/* Phase indicator */}
            {gameState && gameState.phase !== 'waiting' && gameState.phase !== 'countdown' && (
              <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 z-30 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/70 border border-white/10">
                {gameState.phase === 'dealing' && 'Раздача карт...'}
                {gameState.phase === 'player_turn' && 'Ваш ход'}
                {gameState.phase === 'dealer_turn' && 'Ход дилера...'}
                {gameState.phase === 'settling' && 'Подсчёт результатов...'}
              </div>
            )}
          </>
        ) : (
          // Multiplayer mode - 6 seats
          Object.entries(SEAT_POSITIONS).map(([id, position]) => {
            const seat = seats.find((s) => s.id === Number(id));
            if (!seat) return null;
            const isYou = seat.occupant?.id === you.id;
            return (
              <SeatSpot
                key={seat.id}
                seat={seat}
                position={position}
                isYou={isYou}
                onSelect={() => onSeat(seat.id)}
                onLeave={onLeave}
                bet={bet}
                onBetChange={setBet}
              />
            );
          })
        )}
      </div>

      {/* Global bet controls - shown during waiting/countdown when seated */}
      {activeSeatId && gameState && (gameState.phase === 'waiting' || gameState.phase === 'countdown') && (
        <div className="absolute bottom-[4%] left-1/2 -translate-x-1/2 z-40">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-full border border-white/20 bg-black/70 px-4 py-2 backdrop-blur-sm">
              <span className="text-[12px] text-white/70">Ваша ставка:</span>
              <span className="ml-2 font-roobert text-[16px] text-amber-300">{bet.toLocaleString('ru-RU')} zł</span>
            </div>
            <InlineBetControls bet={bet} onChange={setBet} />
          </div>
        </div>
      )}
    </div>
    );
  };

  const renderSolo = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к выбору режима
      </button>
      <h1 className="font-roobert text-[22px] text-white">Blackjack — SOLO</h1>
      {renderTable(soloSeats, handleSoloSeat, currentSoloSeat, handleSoloLeave, true, soloGameState)}
    </div>
  );

  const renderRoomList = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setMode(null)}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к выбору режима
      </button>
      <div>
        <h1 className="font-roobert text-[22px] text-white">Blackjack — MULTIPLAYER</h1>
        <p className="text-[13px] text-white/65">
          В комнате до 6 игроков. Новая комната открывается когда текущая заполнена.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {rooms.map((room) => {
          const filled = countFilled(room.seats);
          const isFull = filled === 6;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left shadow-xl transition-all hover:border-white/20"
            >
              <div className="relative aspect-[16/6] w-full">
                <Image
                  src="/BJ_table.png"
                  alt={room.label}
                  fill
                  priority
                  className="object-cover opacity-40 group-hover:opacity-50 transition-opacity"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
                <div className="absolute inset-0 flex items-center justify-between p-4">
                  <div className="flex flex-col gap-1">
                    <p className="font-roobert text-[18px] text-white">{room.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-[12px] px-2 py-0.5 rounded-full border',
                        isFull 
                          ? 'border-red-300/40 bg-red-400/10 text-red-200'
                          : 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
                      )}>
                        {filled}/6 игроков
                      </span>
                      {isFull && <span className="text-[11px] text-red-300/80">Комната заполнена</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {room.seats.filter(s => s.occupant).slice(0, 4).map((seat, idx) => (
                        <div
                          key={idx}
                          className="h-8 w-8 rounded-full border-2 border-black/50 bg-white/20 flex items-center justify-center text-[10px] text-white/90"
                          title={seat.occupant?.name}
                        >
                          {seat.occupant?.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {filled > 4 && (
                        <div className="h-8 w-8 rounded-full border-2 border-black/50 bg-white/10 flex items-center justify-center text-[10px] text-white/70">
                          +{filled - 4}
                        </div>
                      )}
                    </div>
                    <span className="ml-2 rounded-xl border border-amber-300/60 bg-amber-300/15 px-4 py-2 text-sm font-medium text-amber-50 group-hover:border-amber-200 transition-colors">
                      Войти
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderActiveRoom = () => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          if (wsRef.current && activeRoomId) {
            wsRef.current.send({
              type: 'game:leave',
              payload: { roomId: activeRoomId },
              timestamp: Date.now(),
            });
          }
          // очистить локально свое место
          setRooms((prev) =>
            prev.map((room) =>
              room.id === activeRoomId
                ? {
                    ...room,
                    seats: room.seats.map((s) =>
                      s.occupant?.id === you.id ? { ...s, occupant: undefined } : s
                    ),
                  }
                : room
            )
          );
          setActiveRoomId(null);
        }}
        className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <ArrowLeft size={18} />
        Назад к списку комнат
      </button>
      <div className="flex items-center gap-2 text-white/80">
        <Users size={16} className="text-amber-300" />
        <span>{activeRoom?.label}</span>
      </div>
      {activeRoom ? renderTable(activeRoom.seats, handleRoomSeat, currentRoomSeatId) : null}
    </div>
  );

  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6">
        {mode === null && renderModeSelection()}
        {mode === 'solo' && renderSolo()}
        {mode === 'multi' && activeRoomId === null && renderRoomList()}
        {mode === 'multi' && activeRoomId !== null && renderActiveRoom()}
      </div>
    </main>
  );
}
