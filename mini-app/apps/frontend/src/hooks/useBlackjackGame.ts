import { useState, useEffect, useCallback, useRef } from 'react';
import { CardData, Suit, Rank } from '@/components/game/hilo/playing-card';

export type GameStatus = 'WAITING' | 'BETTING' | 'DEALING' | 'PLAYER_TURN' | 'DEALER_TURN' | 'PAYOUT';
export type PlayerStatus = 'EMPTY' | 'WAITING' | 'BETTING' | 'PLAYING' | 'BUSTED' | 'STOOD' | 'BLACKJACK' | 'WON' | 'LOST' | 'PUSH';

export interface PlayerSeat {
  id: number;
  status: PlayerStatus;
  bet: number;
  hand: CardData[];
}

export interface BlackjackState {
  status: GameStatus;
  deck: CardData[];
  dealerHand: CardData[];
  seats: PlayerSeat[];
  activeSeatIndex: number;
  bettingTimeLeft: number;
  notification: string | null;
}

const createDeck = (): CardData[] => {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: CardData[] = [];
  // 6 decks for realistic blackjack
  for (let d = 0; d < 6; d++) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank });
      }
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

export const calculateHandValue = (hand: CardData[]): { total: number; isSoft: boolean } => {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 1) {
      aces += 1;
      total += 11;
    } else if (card.rank >= 10) {
      total += 10;
    } else {
      total += card.rank;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return { total, isSoft: aces > 0 && total <= 21 };
};

const INITIAL_SEATS: PlayerSeat[] = Array.from({ length: 5 }, (_, i) => ({
  id: i,
  status: 'EMPTY',
  bet: 0,
  hand: [],
}));

export function useBlackjackGame() {
  const [state, setState] = useState<BlackjackState>({
    status: 'WAITING',
    deck: createDeck(),
    dealerHand: [],
    seats: [...INITIAL_SEATS],
    activeSeatIndex: -1,
    bettingTimeLeft: 15,
    notification: null,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const notify = useCallback((message: string, duration = 3000) => {
    setState((p) => ({ ...p, notification: message }));
    setTimeout(() => {
      setState((p) => (p.notification === message ? { ...p, notification: null } : p));
    }, duration);
  }, []);

  // Actions
  const sitDown = useCallback((seatIndex: number) => {
    setState((prev) => {
      if (prev.seats[seatIndex].status !== 'EMPTY' || prev.status !== 'WAITING') return prev;
      const newSeats = [...prev.seats];
      newSeats[seatIndex] = { ...newSeats[seatIndex], status: 'WAITING' };
      return { ...prev, seats: newSeats, status: 'BETTING', bettingTimeLeft: 15 };
    });
  }, []);

  const placeBet = useCallback((seatIndex: number, amount: number) => {
    setState((prev) => {
      if (prev.status !== 'BETTING') return prev;
      const newSeats = [...prev.seats];
      newSeats[seatIndex] = { 
        ...newSeats[seatIndex], 
        bet: newSeats[seatIndex].bet + amount,
        status: 'BETTING'
      };
      return { ...prev, seats: newSeats };
    });
  }, []);

  // Game Loop Effects
  useEffect(() => {
    if (state.status === 'BETTING') {
      timerRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.bettingTimeLeft <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, status: 'DEALING', bettingTimeLeft: 0 };
          }
          return { ...prev, bettingTimeLeft: prev.bettingTimeLeft - 1 };
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status]);

  // Dealing phase
  useEffect(() => {
    if (state.status === 'DEALING') {
      const dealCards = async () => {
        let currentDeck = [...state.deck];
        if (currentDeck.length < 20) currentDeck = createDeck(); // Reshuffle if low

        const newSeats = [...state.seats];
        const newDealerHand: CardData[] = [];
        
        // Filter active players (those who bet)
        const activePlayers = newSeats.filter(s => s.status === 'BETTING' && s.bet > 0);
        
        if (activePlayers.length === 0) {
          // No bets placed, reset
          setState(p => ({ ...p, status: 'WAITING', seats: p.seats.map(s => s.status === 'BETTING' ? { ...s, status: 'WAITING' } : s) }));
          return;
        }

        // Deal 2 cards each, round robin
        for (let round = 0; round < 2; round++) {
          for (let i = 0; i < newSeats.length; i++) {
            if (newSeats[i].status === 'BETTING' && newSeats[i].bet > 0) {
              const card = currentDeck.pop()!;
              newSeats[i].hand = [...newSeats[i].hand, card];
              setState(p => ({ ...p, seats: [...newSeats], deck: currentDeck }));
              await new Promise(r => setTimeout(r, 400));
            }
          }
          // Dealer card
          const dCard = currentDeck.pop()!;
          newDealerHand.push(dCard);
          setState(p => ({ ...p, dealerHand: [...newDealerHand], deck: currentDeck }));
          await new Promise(r => setTimeout(r, 400));
        }

        // Check for instant blackjacks
        let firstActiveIndex = -1;
        for (let i = 0; i < newSeats.length; i++) {
          if (newSeats[i].bet > 0) {
            const val = calculateHandValue(newSeats[i].hand).total;
            if (val === 21) {
              newSeats[i].status = 'BLACKJACK';
            } else {
              newSeats[i].status = 'PLAYING';
              if (firstActiveIndex === -1) firstActiveIndex = i;
            }
          }
        }

        setState(p => ({
          ...p,
          seats: newSeats,
          status: firstActiveIndex !== -1 ? 'PLAYER_TURN' : 'DEALER_TURN',
          activeSeatIndex: firstActiveIndex !== -1 ? firstActiveIndex : -1,
        }));
      };

      dealCards();
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actions during player turn
  const hit = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'PLAYER_TURN' || prev.activeSeatIndex === -1) return prev;
      
      const currentDeck = [...prev.deck];
      const card = currentDeck.pop()!;
      
      const newSeats = [...prev.seats];
      const seat = newSeats[prev.activeSeatIndex];
      seat.hand = [...seat.hand, card];
      
      const val = calculateHandValue(seat.hand).total;
      if (val > 21) {
        seat.status = 'BUSTED';
        notify('Перебор!', 2000);
      }

      return { ...prev, seats: newSeats, deck: currentDeck };
    });
  }, [notify]);

  const stand = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'PLAYER_TURN' || prev.activeSeatIndex === -1) return prev;
      const newSeats = [...prev.seats];
      newSeats[prev.activeSeatIndex].status = 'STOOD';
      return { ...prev, seats: newSeats };
    });
  }, []);

  const doubleDown = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'PLAYER_TURN' || prev.activeSeatIndex === -1) return prev;
      
      const currentDeck = [...prev.deck];
      const card = currentDeck.pop()!;
      
      const newSeats = [...prev.seats];
      const seat = newSeats[prev.activeSeatIndex];
      
      // Can only double on first 2 cards
      if (seat.hand.length !== 2) return prev;
      
      seat.hand = [...seat.hand, card];
      seat.bet *= 2;
      
      const val = calculateHandValue(seat.hand).total;
      if (val > 21) {
        seat.status = 'BUSTED';
        notify('Перебор!', 2000);
      } else {
        seat.status = 'STOOD';
      }

      return { ...prev, seats: newSeats, deck: currentDeck };
    });
  }, [notify]);

  // Advance to next player
  useEffect(() => {
    if (state.status === 'PLAYER_TURN') {
      const activeSeat = state.seats[state.activeSeatIndex];
      if (!activeSeat || activeSeat.status !== 'PLAYING') {
        // Find next playing seat
        let nextIndex = state.activeSeatIndex + 1;
        while (nextIndex < state.seats.length && state.seats[nextIndex].status !== 'PLAYING') {
          nextIndex++;
        }
        
        if (nextIndex >= state.seats.length) {
          // No more players
          setState(p => ({ ...p, status: 'DEALER_TURN', activeSeatIndex: -1 }));
        } else {
          setState(p => ({ ...p, activeSeatIndex: nextIndex }));
        }
      }
    }
  }, [state.status, state.activeSeatIndex, state.seats]);

  // Dealer turn
  useEffect(() => {
    if (state.status === 'DEALER_TURN') {
      const playDealer = async () => {
        let currentDeck = [...state.deck];
        let dHand = [...state.dealerHand];
        
        // Wait a sec before dealer starts
        await new Promise(r => setTimeout(r, 1000));

        let val = calculateHandValue(dHand).total;
        while (val < 17) {
          const card = currentDeck.pop()!;
          dHand.push(card);
          val = calculateHandValue(dHand).total;
          
          setState(p => ({ ...p, dealerHand: [...dHand], deck: currentDeck }));
          await new Promise(r => setTimeout(r, 600));
        }

        setState(p => ({ ...p, status: 'PAYOUT' }));
      };
      playDealer();
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Payout phase
  useEffect(() => {
    if (state.status === 'PAYOUT') {
      const dVal = calculateHandValue(state.dealerHand).total;
      const dealerBust = dVal > 21;

      const newSeats = [...state.seats];
      
      for (let i = 0; i < newSeats.length; i++) {
        const s = newSeats[i];
        if (s.status === 'STOOD' || s.status === 'BLACKJACK' || s.status === 'BUSTED') {
          if (s.status === 'BUSTED') {
            s.status = 'LOST';
          } else if (s.status === 'BLACKJACK') {
            s.status = (dVal === 21 && state.dealerHand.length === 2) ? 'PUSH' : 'WON';
          } else {
            const pVal = calculateHandValue(s.hand).total;
            if (dealerBust) {
              s.status = 'WON';
            } else if (pVal > dVal) {
              s.status = 'WON';
            } else if (pVal < dVal) {
              s.status = 'LOST';
            } else {
              s.status = 'PUSH';
            }
          }
        }
      }

      setState(p => ({ ...p, seats: newSeats }));
      
      // Reset after some time
      setTimeout(() => {
        setState(p => ({
          ...p,
          status: 'WAITING',
          dealerHand: [],
          activeSeatIndex: -1,
          seats: p.seats.map(s => s.status !== 'EMPTY' ? { ...s, status: 'WAITING', hand: [], bet: 0 } : s)
        }));
      }, 5000);
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    sitDown,
    placeBet,
    hit,
    stand,
    doubleDown
  };
}
