import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { dbops } from '../dbops.js';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = number; // 1 (Ace) to 13 (King)

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HiloStatus = 'idle' | 'playing' | 'cashed_out' | 'busted';

export interface HiloState {
  userId: string;
  status: HiloStatus;
  betAmount: number;
  currentMultiplier: number;
  currentCard: Card | null;
  history: Card[];
}

// In-memory store
const states = new Map<string, HiloState>();

const FIXED_MULTIPLIER = 1.92;

export const hiloEngine = {
  getState(userId: string): HiloState {
    let state = states.get(userId);
    if (!state) {
      state = {
        userId,
        status: 'idle',
        betAmount: 0,
        currentMultiplier: 1.0,
        currentCard: hiloEngine.generateCard(),
        history: [],
      };
      states.set(userId, state);
    }
    return state;
  },

  generateCard(): Card {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    // Random 0-3
    const suitIdx = randomBytes(1)[0] % 4;
    // Random 1-13
    const rank = (randomBytes(1)[0] % 13) + 1;
    return { suit: suits[suitIdx], rank };
  },

  swap(userId: string): HiloState {
    const state = this.getState(userId);
    if (state.status === 'playing') {
      throw new Error('Cannot swap while playing');
    }
    state.currentCard = this.generateCard();
    state.status = 'idle'; // Ensure it's idle
    state.history = []; // Clear history
    return state;
  },

  async start(userId: string, amount: number): Promise<HiloState> {
    if (amount < 1) throw new Error('Min bet is 1');
    const state = this.getState(userId);
    if (state.status === 'playing') throw new Error('Game already in progress');

    // Deduct balance
    const user = await prisma.user.findUnique({ where: { telegramId: userId } });
    if (!user) throw new Error('User not found');
    if (Number(user.balance) < amount) throw new Error('Insufficient balance');

    await dbops.subtractBalance(userId, amount, 'hilo:bet');

    state.status = 'playing';
    state.betAmount = amount;
    state.currentMultiplier = 1.0;
    // Keep current card
    state.history = state.currentCard ? [state.currentCard] : [];
    
    // If somehow currentCard is missing
    if (!state.currentCard) {
      state.currentCard = this.generateCard();
      state.history = [state.currentCard];
    }

    return state;
  },

  async guess(userId: string, choice: 'red' | 'black' | 'higher' | 'lower'): Promise<HiloState> {
    const state = this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');
    if (!state.currentCard) throw new Error('No current card');

    const nextCard = this.generateCard();
    const currentCard = state.currentCard;
    
    let won = false;
    const isRed = nextCard.suit === 'hearts' || nextCard.suit === 'diamonds';
    const isBlack = nextCard.suit === 'clubs' || nextCard.suit === 'spades';

    switch (choice) {
      case 'red':
        won = isRed;
        break;
      case 'black':
        won = isBlack;
        break;
      case 'higher':
        won = nextCard.rank >= currentCard.rank;
        break;
      case 'lower':
        won = nextCard.rank <= currentCard.rank;
        break;
    }

    state.currentCard = nextCard;
    state.history.push(nextCard);

    if (won) {
      // Step win
      if (state.currentMultiplier === 1.0) {
        state.currentMultiplier = FIXED_MULTIPLIER;
      } else {
        state.currentMultiplier *= FIXED_MULTIPLIER;
      }
      
      // Prevent floating point errors
      state.currentMultiplier = Math.floor(state.currentMultiplier * 100) / 100;

    } else {
      // Busted
      state.status = 'busted';
      // Record to history
      await this.recordHistory(userId, state.betAmount, 0, state.history);
      this.forget(userId);
    }

    return state;
  },

  async cashout(userId: string): Promise<HiloState> {
    const state = this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');
    if (state.currentMultiplier <= 1.0) throw new Error('No winnings to cash out');

    const winAmount = +(state.betAmount * state.currentMultiplier).toFixed(2);
    
    await dbops.addBalance(userId, winAmount, 'hilo:win');

    state.status = 'cashed_out';
    await this.recordHistory(userId, state.betAmount, winAmount, state.history);
    this.forget(userId);

    return { ...state }; // Return copy
  },

  forget(userId: string) {
    states.delete(userId);
  },

  async recordHistory(userId: string, betAmount: number, winAmount: number, history: Card[]) {
    try {
      await prisma.gameBet.create({
        data: {
          telegramId: userId,
          gameType: 'hilo',
          betAmount,
          winAmount,
          multiplier: winAmount > 0 ? +(winAmount / betAmount).toFixed(2) : 0,
          metadata: { cards: history },
        },
      });
    } catch (err) {
      console.error('Failed to save hilo history', err);
    }
  }
};
