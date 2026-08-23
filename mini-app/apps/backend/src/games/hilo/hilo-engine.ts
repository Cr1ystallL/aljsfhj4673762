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
    // Random 0-3
    const suitIdx = randomBytes(1)[0] % 4;
    // Random 1-13
    const rank = (randomBytes(1)[0] % 13) + 1;
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
    await bettingPipeline.processBet(bet, false);
    bet.state = 'active';

    state.status = 'playing';
    state.betAmount = amount;
    state.bet = bet;
    state.currentMultiplier = 1.0;
    // Keep current card
    state.history = state.currentCard ? [state.currentCard] : [];
    
    // If somehow currentCard is missing
    if (!state.currentCard) {
      state.currentCard = this.generateCard();
      state.history = [state.currentCard];
    }
    
    const cfg = await gameConfig.get('hilo');
    state.nextMultipliers = getHiloMultipliers(state.currentCard.rank, cfg.houseEdge);

    return state;
  },

  async guess(userId: string, choice: 'red' | 'black' | 'higher' | 'lower'): Promise<HiloState> {
    const state = await this.getState(userId);
    if (state.status !== 'playing') throw new Error('Game not in progress');
    if (!state.currentCard) throw new Error('No current card');

    const bias = await rtpEngine.getBiasFor(userId).catch(() => 0);
    const cfg = await gameConfig.get('hilo');
    
    // Hilo-specific RTP forced loss mechanic based on house edge setting
    const localBias = cfg.houseEdge >= 1 ? cfg.houseEdge / 100 : cfg.houseEdge;
    
    // Total bias towards casino winning
    const totalBias = Math.max(bias, localBias);

    let shouldWin: boolean | null = null;
    if (totalBias > 0 && Math.random() < totalBias) shouldWin = false; // Casino favours, player loses
    else if (totalBias < 0 && Math.random() < -totalBias) shouldWin = true; // Player favours, player wins
    
    let nextCard = this.generateCard();
    const currentCard = state.currentCard;
    
    let won = false;
    let stepMultiplier = 0;
    const mults = state.nextMultipliers || getHiloMultipliers(currentCard.rank, cfg.houseEdge);

    // Calculate potential step multiplier first
    switch (choice) {
      case 'red': stepMultiplier = mults.red; break;
      case 'black': stepMultiplier = mults.black; break;
      case 'higher': stepMultiplier = mults.higher; break;
      case 'lower': stepMultiplier = mults.lower; break;
    }

    // --- Forced Loss / SmartDrain ---
    const potentialMultiplier = +(state.currentMultiplier === 1.0 ? stepMultiplier : state.currentMultiplier * stepMultiplier).toFixed(2);
    if (await rtpEngine.shouldForceLoss(userId, state.betAmount, potentialMultiplier)) {
      shouldWin = false;
    }

    // Regenerate up to 50 times if we need to force an outcome
    for (let loop = 0; loop < 50; loop++) {
      const isRed = nextCard.suit === 'hearts' || nextCard.suit === 'diamonds';
      const isBlack = nextCard.suit === 'clubs' || nextCard.suit === 'spades';

      switch (choice) {
        case 'red': won = isRed; stepMultiplier = mults.red; break;
        case 'black': won = isBlack; stepMultiplier = mults.black; break;
        case 'higher': won = nextCard.rank >= currentCard.rank; stepMultiplier = mults.higher; break;
        case 'lower': won = nextCard.rank <= currentCard.rank; stepMultiplier = mults.lower; break;
      }
      
      if (shouldWin === null || won === shouldWin) break;
      nextCard = this.generateCard();
    }

    state.currentCard = nextCard;
    state.history.push(nextCard);
    state.nextMultipliers = getHiloMultipliers(nextCard.rank, cfg.houseEdge);

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
      void rtpEngine.recordRoundForDrain(userId, state.betAmount, 0, false);
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

    void rtpEngine.recordRoundForDrain(userId, state.betAmount, winAmount, true);

    state.status = 'cashed_out';
    state.nextMultipliers = null;
    this.forget(userId);

    return { ...state }; // Return copy
  },

  forget(userId: string) {
    states.delete(userId);
  }
};
