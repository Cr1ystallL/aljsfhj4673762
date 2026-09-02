import { randomBytes, randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { gameConfig } from '../../services/game-config.js';
import { rtpEngine } from '../../services/rtp-engine.js';
import type { Bet } from '../../game-engine/types.js';

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
  bet: Bet | null;
  isTournament?: boolean;
  currentMultiplier: number;
  currentCard: Card | null;
  history: Card[];
  nextMultipliers: { red: number; black: number; higher: number; lower: number } | null;
}

// In-memory store
const states = new Map<string, HiloState>();

export function getHiloMultipliers(currentRank: number, edge: number = 0.04): { red: number; black: number; higher: number; lower: number } {
  // If edge is provided as a whole number (e.g. 100), treat it as a percentage
  if (edge >= 1) edge = edge / 100;
  
  // Clamp RTP between 0.01 and 1.0
  const rtp = Math.max(0.01, Math.min(1.0, 1 - edge));

  const redBlack = +(2.0 * rtp).toFixed(2);

  // Higher or same
  const higherCards = 14 - currentRank;
  const probHigher = higherCards / 13;
  const higher = +( (1 / probHigher) * rtp ).toFixed(2);

  // Lower or same
  const lowerCards = currentRank;
  const probLower = lowerCards / 13;
  const lower = +( (1 / probLower) * rtp ).toFixed(2);

  return { 
    red: Math.max(1.01, redBlack), 
    black: Math.max(1.01, redBlack), 
    higher: Math.max(1.01, higher), 
    lower: Math.max(1.01, lower) 
  };
}

export const hiloEngine = {
  async getState(userId: string): Promise<HiloState> {
    let state = states.get(userId);
    if (!state) {
      state = {
        userId,
        status: 'idle',
        betAmount: 0,
        bet: null,
        currentMultiplier: 1.0,
        currentCard: this.generateCard(),
        history: [],
        nextMultipliers: null,
      };
      state.history = [state.currentCard!];
      const cfg = await gameConfig.get('hilo');
      state.nextMultipliers = getHiloMultipliers(state.currentCard!.rank, cfg.houseEdge);
      states.set(userId, state);
    }
    return state;
  },

  generateCard(): Card {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    // Random 0-3 (256 is cleanly divisible by 4, so no modulo bias)
    const suitIdx = randomBytes(1)[0] % 4;

    // 13 does not divide 256 evenly (256 = 19 * 13 + 9). Rejection threshold: 247.
    // This eliminates modulo bias entirely so each rank 1..13 has exact equal probability.
    let b: number;
    do {
      b = randomBytes(1)[0];
    } while (b >= 247);
    const rank = (b % 13) + 1;
    return { suit: suits[suitIdx], rank };
  },

  async swap(userId: string): Promise<HiloState> {
    const state = await this.getState(userId);
    if (state.status === 'playing') {
      throw new Error('Cannot swap while playing');
    }
    state.currentCard = this.generateCard();
    state.status = 'idle'; // Ensure it's idle
    state.history = [state.currentCard]; // Include the new card in history
    
    const cfg = await gameConfig.get('hilo');
    state.nextMultipliers = getHiloMultipliers(state.currentCard.rank, cfg.houseEdge);
    return state;
  },

  async start(userId: string, amount: number): Promise<HiloState> {
    if (amount < 1) throw new Error('Min bet is 1');
    const state = await this.getState(userId);
    if (state.status === 'playing') throw new Error('Game already in progress');

    const roundId = `hilo_${Date.now()}_${randomUUID()}`;
    const bet: Bet = {
      id: `bet_${Date.now()}_${randomUUID()}`,
      userId,
      gameId: roundId,
      roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { gameType: 'hilo' },
    };
    const isTournament = await bettingPipeline.processBet(bet, false);
    bet.state = 'active';
    bet.metadata = { ...(bet.metadata || {}), isTournament: Boolean(isTournament) };

    state.status = 'playing';
    state.betAmount = amount;
    state.bet = bet;
    state.isTournament = Boolean(isTournament);
    state.currentMultiplier = 1.0;
    // Keep current card
    state.history = state.currentCard ? [state.currentCard] : [];
    
    // If somehow currentCard is missing
    if (!state.currentCard) {
      state.currentCard = this.generateCard();
      state.history = [state.currentCard];
    }
    
    const cfg = await gameConfig.get('hilo');
    state.nextMultipliers = getHiloMultipliers(state.currentCard.rank, isTournament ? 0.04 : cfg.houseEdge);

    return state;
  },

  async guess(userId: string, choice: 'red' | 'black' | 'higher' | 'lower'): Promise<HiloState> {
    const state = await this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');
    if (!state.currentCard) throw new Error('No current card');

    const cfg = await gameConfig.get('hilo');
    const nextCard = this.generateCard();
    const currentCard = state.currentCard;
    
    const mults = state.nextMultipliers || getHiloMultipliers(currentCard.rank, state.isTournament ? 0.04 : cfg.houseEdge);
    let stepMultiplier = 0;
    switch (choice) {
      case 'red': stepMultiplier = mults.red; break;
      case 'black': stepMultiplier = mults.black; break;
      case 'higher': stepMultiplier = mults.higher; break;
      case 'lower': stepMultiplier = mults.lower; break;
    }

    const isRed = nextCard.suit === 'hearts' || nextCard.suit === 'diamonds';
    const isBlack = nextCard.suit === 'clubs' || nextCard.suit === 'spades';
    let won = false;

    switch (choice) {
      case 'red': won = isRed; break;
      case 'black': won = isBlack; break;
      case 'higher': won = nextCard.rank >= currentCard.rank; break;
      case 'lower': won = nextCard.rank <= currentCard.rank; break;
    }

    state.currentCard = nextCard;
    state.history.push(nextCard);
    state.nextMultipliers = getHiloMultipliers(nextCard.rank, state.isTournament ? 0.04 : cfg.houseEdge);

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
      if (state.bet) {
        state.bet.metadata = { ...state.bet.metadata, cards: state.history };
        await bettingPipeline.processLoss(state.bet, false);
      }
      if (!state.isTournament) {
        void rtpEngine.recordRoundForDrain(userId, state.betAmount, 0, false, false);
      }
      this.forget(userId);
    }

    return state;
  },

  async cashout(userId: string): Promise<HiloState> {
    const state = await this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');

    const winAmount = +(state.betAmount * state.currentMultiplier).toFixed(2);
    
    if (state.bet) {
      state.bet.multiplier = state.currentMultiplier;
      state.bet.metadata = { ...state.bet.metadata, cards: state.history };
      await bettingPipeline.processPayout(state.bet, winAmount, false);
    }

    if (!state.isTournament) {
      void rtpEngine.recordRoundForDrain(userId, state.betAmount, winAmount, true, false);
    }

    state.status = 'cashed_out';
    state.nextMultipliers = null;
    this.forget(userId);

    return { ...state }; // Return copy
  },

  forget(userId: string) {
    states.delete(userId);
  }
};
