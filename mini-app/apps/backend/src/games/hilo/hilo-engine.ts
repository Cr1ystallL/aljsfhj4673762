import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { dbops } from '../dbops.js';
import { gameConfig } from '../../services/game-config.js';

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
  nextMultipliers: { red: number; black: number; higher: number; lower: number } | null;
}

// In-memory store
const states = new Map<string, HiloState>();

export function getHiloMultipliers(currentRank: number): { red: number; black: number; higher: number; lower: number } {
  // Extract edge, fallback to 0.04 (RTP 96%)
  const edge = gameConfig?.hilo?.edge ?? 0.04;
  const rtp = 1 - edge;

  const redBlack = +(2.0 * rtp).toFixed(2);

  // Higher or same
  const higherCards = 14 - currentRank;
  const probHigher = higherCards / 13;
  const higher = +( (1 / probHigher) * rtp ).toFixed(2);

  // Lower or same
  const lowerCards = currentRank;
  const probLower = lowerCards / 13;
  const lower = +( (1 / probLower) * rtp ).toFixed(2);

  return { red: redBlack, black: redBlack, higher, lower };
}

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
        nextMultipliers: null,
      };
      state.nextMultipliers = getHiloMultipliers(state.currentCard.rank);
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
    state.nextMultipliers = getHiloMultipliers(state.currentCard.rank);
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
    state.nextMultipliers = getHiloMultipliers(state.currentCard.rank);

    return state;
  },

  async guess(userId: string, choice: 'red' | 'black' | 'higher' | 'lower'): Promise<HiloState> {
    const state = this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');
    if (!state.currentCard) throw new Error('No current card');

    const nextCard = this.generateCard();
    const currentCard = state.currentCard;
    
    let won = false;
    let stepMultiplier = 0;
    const mults = state.nextMultipliers || getHiloMultipliers(currentCard.rank);

    const isRed = nextCard.suit === 'hearts' || nextCard.suit === 'diamonds';
    const isBlack = nextCard.suit === 'clubs' || nextCard.suit === 'spades';

    switch (choice) {
      case 'red':
        won = isRed;
        stepMultiplier = mults.red;
        break;
      case 'black':
        won = isBlack;
        stepMultiplier = mults.black;
        break;
      case 'higher':
        won = nextCard.rank >= currentCard.rank;
        stepMultiplier = mults.higher;
        break;
      case 'lower':
        won = nextCard.rank <= currentCard.rank;
        stepMultiplier = mults.lower;
        break;
    }

    state.currentCard = nextCard;
    state.history.push(nextCard);
    state.nextMultipliers = getHiloMultipliers(nextCard.rank);

    if (won) {
      // Step win
      if (state.currentMultiplier === 1.0) {
        state.currentMultiplier = stepMultiplier;
      } else {
        state.currentMultiplier *= stepMultiplier;
      }
      
      // Prevent floating point errors
      state.currentMultiplier = Math.floor(state.currentMultiplier * 100) / 100;

    } else {
      // Busted
      state.status = 'busted';
      state.nextMultipliers = null;
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
    state.nextMultipliers = null;
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
