import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
// import { rtpEngine } from '../../services/rtp-engine.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { wsManager } from '../../lib/websocket-manager.js';
import type { Bet } from '../../game-engine/types.js';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
}

export interface Player {
  userId: string;
  name: string;
  avatar?: string;
  seatId: number;
  hand: Card[];
  bet: number;
  status: 'waiting' | 'playing' | 'stand' | 'bust' | 'blackjack' | 'surrender' | 'doubled';
  isReady: boolean;
}

export type GamePhase = 'waiting' | 'countdown' | 'dealing' | 'player_turn' | 'dealer_turn' | 'settling' | 'finished';

export interface BlackjackState {
  roomId: string;
  phase: GamePhase;
  countdown: number;
  dealerHand: Card[];
  players: Player[];
  currentTurnSeatId: number | null;
  roundId: string;
}

interface GameConfig {
  minBet: number;
  maxBet: number;
  countdownSeconds: number;
  dealerStandOn: number;
}

const DEFAULT_CONFIG: GameConfig = {
  minBet: 1,
  maxBet: 100000,
  countdownSeconds: 10,
  dealerStandOn: 17,
};

/**
 * Blackjack Game Engine with RTP integration
 * 
 * Features:
 * - Multiplayer synchronized card dealing
 * - Turn queue system (players act in seat order)
 * - RTP bias applied per-player for card outcomes
 * - Auto-dealer AI (hits until 17+)
 */
export class BlackjackEngine extends EventEmitter {
  private roomId: string;
  private config: GameConfig;
  private state: BlackjackState;
  private countdownTimer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private deck: Card[] = [];

  constructor(roomId: string, config: Partial<GameConfig> = {}) {
    super();
    this.roomId = roomId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      roomId,
      phase: 'waiting',
      countdown: this.config.countdownSeconds,
      dealerHand: [],
      players: [],
      currentTurnSeatId: null,
      roundId: '',
    };
  }

  /* -----------------------------------------------------------------
   * Player management
   * ---------------------------------------------------------------- */

  join(userId: string, name: string, avatar: string | undefined, seatId: number, bet: number): boolean {
    if (this.state.phase !== 'waiting' && this.state.phase !== 'countdown') {
      return false; // Can't join during active round
    }

    // Check if seat is taken
    const existingPlayer = this.state.players.find((p) => p.seatId === seatId);
    if (existingPlayer) {
      return false;
    }

    // Remove from old seat if switching
    this.state.players = this.state.players.filter((p) => p.userId !== userId);

    const player: Player = {
      userId,
      name,
      avatar,
      seatId,
      hand: [],
      bet,
      status: 'waiting',
      isReady: true,
    };

    this.state.players.push(player);
    this.broadcastState();

    // Start countdown if first player joined
    if (this.state.players.length === 1 && this.state.phase === 'waiting') {
      this.startCountdown();
    }

    return true;
  }

  leave(userId: string): void {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player) return;

    // If player leaves during their turn, move to next
    if (this.state.currentTurnSeatId === player.seatId && this.state.phase === 'player_turn') {
      this.nextTurn();
    }

    this.state.players = this.state.players.filter((p) => p.userId !== userId);

    // Reset if no players
    if (this.state.players.length === 0) {
      this.resetGame();
    }

    this.broadcastState();
  }

  updateBet(userId: string, bet: number): boolean {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || this.state.phase !== 'waiting' && this.state.phase !== 'countdown') {
      return false;
    }
    player.bet = Math.max(this.config.minBet, Math.min(this.config.maxBet, bet));
    this.broadcastState();
    return true;
  }

  /* -----------------------------------------------------------------
   * Game flow
   * ---------------------------------------------------------------- */

  private startCountdown(): void {
    if (this.state.phase !== 'waiting') return;
    
    this.state.phase = 'countdown';
    this.state.countdown = this.config.countdownSeconds;
    this.broadcastState();

    this.countdownTimer = setInterval(() => {
      this.state.countdown--;
      this.broadcastState();

      if (this.state.countdown <= 0) {
        this.stopCountdown();
        this.startRound();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async startRound(): Promise<void> {
    if (this.state.players.length === 0) {
      this.state.phase = 'waiting';
      return;
    }

    this.state.phase = 'dealing';
    this.state.roundId = `bj_${Date.now()}_${randomUUID()}`;
    this.state.dealerHand = [];
    
    // Create and shuffle deck
    this.deck = this.createDeck();

    // Process bets first
    for (const player of this.state.players) {
      const bet: Bet = {
        id: `bj_bet_${player.userId}_${Date.now()}`,
        userId: player.userId,
        gameId: this.state.roundId,
        roundId: this.state.roundId,
        amount: player.bet,
        state: 'pending',
        placedAt: Date.now(),
        metadata: { gameType: 'blackjack', mode: 'multi', roomId: this.roomId },
      };

      try {
        await bettingPipeline.processBet(bet, false);
        player.status = 'playing';
      } catch (err) {
        logger.warn({ err, userId: player.userId }, 'Failed to process blackjack bet');
        player.status = 'waiting';
      }
    }

    // Deal cards with animation delays
    await this.dealInitialCards();
  }

  private async dealInitialCards(): Promise<void> {
    // Deal first card to each player
    for (const player of this.state.players) {
      if (player.status === 'playing') {
        player.hand = [this.drawCard(player.userId)];
      }
    }
    this.broadcastState();
    await this.delay(500);

    // Deal first card to dealer
    this.state.dealerHand = [this.drawCard('dealer')];
    this.broadcastState();
    await this.delay(500);

    // Deal second card to each player
    for (const player of this.state.players) {
      if (player.status === 'playing') {
        player.hand.push(this.drawCard(player.userId));
        
        // Check for blackjack
        if (this.calculateHandValue(player.hand).total === 21) {
          player.status = 'blackjack';
        }
      }
    }
    this.broadcastState();
    await this.delay(500);

    // Deal second card to dealer (hidden)
    this.state.dealerHand.push({ ...this.drawCard('dealer'), hidden: true });
    this.broadcastState();
    await this.delay(500);

    // Start player turns
    this.startPlayerTurns();
  }

  private startPlayerTurns(): void {
    this.state.phase = 'player_turn';
    
    // Find first active player (lowest seatId)
    const activePlayers = this.state.players
      .filter((p) => p.status === 'playing')
      .sort((a, b) => a.seatId - b.seatId);
    
    if (activePlayers.length === 0) {
      // No active players, go to dealer
      this.startDealerTurn();
    } else {
      this.state.currentTurnSeatId = activePlayers[0].seatId;
      this.startTurnTimer();
    }

    this.broadcastState();
  }

  private startTurnTimer(): void {
    // Auto-stand after 30 seconds if no action
    this.turnTimer = setTimeout(() => {
      if (this.state.phase === 'player_turn' && this.state.currentTurnSeatId) {
        this.stand(this.getPlayerBySeat(this.state.currentTurnSeatId)?.userId || '');
      }
    }, 30000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /* -----------------------------------------------------------------
   * Player actions
   * ---------------------------------------------------------------- */

  async hit(userId: string): Promise<boolean> {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    this.clearTurnTimer();

    // Draw card with RTP bias
    player.hand.push(this.drawCard(userId));
    
    const { total } = this.calculateHandValue(player.hand);
    
    if (total > 21) {
      player.status = 'bust';
      await this.nextTurn();
    } else if (total === 21) {
      // Auto-stand on 21
      await this.nextTurn();
    } else {
      // Continue turn (restart timer)
      this.startTurnTimer();
    }

    this.broadcastState();
    return true;
  }

  async stand(userId: string): Promise<boolean> {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    this.clearTurnTimer();
    player.status = 'stand';
    await this.nextTurn();
    this.broadcastState();
    return true;
  }

  async double(userId: string): Promise<boolean> {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    // Can only double on first two cards
    if (player.hand.length !== 2) {
      return false;
    }

    this.clearTurnTimer();

    // Double the bet
    player.bet *= 2;
    player.status = 'doubled';

    // Draw one card
    player.hand.push(this.drawCard(userId));
    
    const { total } = this.calculateHandValue(player.hand);
    if (total > 21) {
      player.status = 'bust';
    }

    await this.nextTurn();
    this.broadcastState();
    return true;
  }

  private async nextTurn(): Promise<void> {
    const currentSeat = this.state.currentTurnSeatId;
    if (!currentSeat) return;

    // Find next active player with higher seatId
    const activePlayers = this.state.players
      .filter((p) => p.status === 'playing')
      .sort((a, b) => a.seatId - b.seatId);

    const currentIndex = activePlayers.findIndex((p) => p.seatId === currentSeat);
    const nextPlayer = activePlayers[currentIndex + 1];

    if (nextPlayer) {
      this.state.currentTurnSeatId = nextPlayer.seatId;
      this.startTurnTimer();
    } else {
      // No more players, dealer's turn
      this.startDealerTurn();
    }
  }

  /* -----------------------------------------------------------------
   * Dealer turn
   * ---------------------------------------------------------------- */

  private async startDealerTurn(): Promise<void> {
    this.clearTurnTimer();
    this.state.phase = 'dealer_turn';
    this.state.currentTurnSeatId = null;

    // Reveal hidden card
    this.state.dealerHand = this.state.dealerHand.map((c) => ({ ...c, hidden: false }));
    this.broadcastState();

    await this.delay(1000);
    await this.playDealerHand();
  }

  private async playDealerHand(): Promise<void> {
    const { total } = this.calculateHandValue(this.state.dealerHand, true);
    logger.info({ total, handSize: this.state.dealerHand.length, standOn: this.config.dealerStandOn }, 'Dealer hand calculation');

    if (total < this.config.dealerStandOn) {
      // Dealer hits
      this.state.dealerHand.push(this.drawCard('dealer'));
      this.broadcastState();
      await this.delay(1000);
      await this.playDealerHand();
    } else {
      // Dealer stands
      await this.settleRound();
    }
  }

  /* -----------------------------------------------------------------
   * Settlement
   * ---------------------------------------------------------------- */

  private async settleRound(): Promise<void> {
    this.state.phase = 'settling';
    this.broadcastState();

    const dealerValue = this.calculateHandValue(this.state.dealerHand, true).total;
    const dealerBust = dealerValue > 21;
    const dealerBlackjack = this.isBlackjack(this.state.dealerHand);

    for (const player of this.state.players) {
      const playerValue = this.calculateHandValue(player.hand).total;
      const playerBust = player.status === 'bust';
      const playerBlackjack = player.status === 'blackjack';

      let result: 'win' | 'lose' | 'push' | 'blackjack' = 'lose';
      let payout = 0;

      if (playerBust) {
        result = 'lose';
        payout = 0;
      } else if (playerBlackjack && !dealerBlackjack) {
        result = 'blackjack';
        payout = player.bet * 2.5; // 3:2 payout
      } else if (dealerBlackjack && !playerBlackjack) {
        result = 'lose';
        payout = 0;
      } else if (dealerBust) {
        result = 'win';
        payout = player.bet * 2;
      } else if (playerValue > dealerValue) {
        result = 'win';
        payout = player.bet * 2;
      } else if (playerValue === dealerValue) {
        result = 'push';
        payout = player.bet;
      } else {
        result = 'lose';
        payout = 0;
      }

      // Process payout
      const bet: Bet = {
        id: `bj_bet_${player.userId}_${this.state.roundId}`,
        userId: player.userId,
        gameId: this.state.roundId,
        roundId: this.state.roundId,
        amount: player.bet,
        state: 'active',
        placedAt: Date.now(),
        metadata: { gameType: 'blackjack', mode: 'multi', result },
      };

      try {
        if (payout > 0) {
          await bettingPipeline.processPayout(bet, payout, false);
        } else if (result === 'push') {
          await bettingPipeline.processPayout(bet, player.bet, false);
        } else {
          await bettingPipeline.processLoss(bet);
        }

        // Save game round
        await prisma.gameRound.create({
          data: {
            id: `${this.state.roundId}_${player.userId}`,
            gameType: 'blackjack',
            state: 'completed',
            serverSeedHash: 'card_game_no_seed', // Blackjack doesn't use provably-fair seed system
            startedAt: new Date(),
            endedAt: new Date(),
            metadata: { mode: 'multi', betAmount: player.bet, roomId: this.roomId },
            result: {
              result,
              payout,
              playerHand: JSON.parse(JSON.stringify(player.hand)),
              dealerHand: JSON.parse(JSON.stringify(this.state.dealerHand)),
              playerValue,
              dealerValue,
            } as any,
          },
        }).catch((err) => logger.warn(err, 'Failed to record blackjack round'));

        // Record outcome for RTP
        // await rtpEngine.recordOutcome(player.userId, player.bet, payout);

      } catch (err) {
        logger.error({ err, userId: player.userId }, 'Failed to settle blackjack bet');
      }
    }

    // Reset for next round
    await this.delay(3000);
    this.resetForNextRound();
  }

  private resetForNextRound(): void {
    this.state.phase = 'waiting';
    this.state.countdown = this.config.countdownSeconds;
    this.state.dealerHand = [];
    this.state.currentTurnSeatId = null;
    this.state.roundId = '';

    for (const player of this.state.players) {
      player.hand = [];
      player.status = 'waiting';
    }

    // Auto-start if players still present
    if (this.state.players.length > 0) {
      this.startCountdown();
    }

    this.broadcastState();
  }

  private resetGame(): void {
    this.stopCountdown();
    this.clearTurnTimer();
    this.state = {
      roomId: this.roomId,
      phase: 'waiting',
      countdown: this.config.countdownSeconds,
      dealerHand: [],
      players: [],
      currentTurnSeatId: null,
      roundId: '',
    };
  }

  /* -----------------------------------------------------------------
   * Card utilities with RTP bias
   * ---------------------------------------------------------------- */

  private createDeck(): Card[] {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Card[] = [];
    
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }
    
    return this.shuffle(deck);
  }

  private shuffle(deck: Card[]): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private drawCard(userId: string): Card {
    // Apply RTP bias based on user
    const biasPromise = userId === 'dealer' 
      ? 0 // rtpEngine.getGlobalBias() 
      : 0; // rtpEngine.getBiasFor(userId);

    // For simplicity, we draw from deck but bias affects the "quality" of card
    // In a full implementation, bias would weight the probability space
    const card = this.deck.pop()!;
    
    // Async bias fetch (fire and forget for RTP tracking)
    biasPromise.catch(() => {});
    
    return card;
  }

  private calculateHandValue(hand: Card[], includeHidden = false): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.hidden && !includeHidden) continue;
      
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
  }

  private isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && this.calculateHandValue(hand).total === 21;
  }

  private getPlayerBySeat(seatId: number): Player | undefined {
    return this.state.players.find((p) => p.seatId === seatId);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* -----------------------------------------------------------------
   * Broadcasting
   * ---------------------------------------------------------------- */

  private broadcastState(): void {
    // Strip sensitive data before broadcasting
    const sanitizedPlayers = this.state.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      seatId: p.seatId,
      hand: p.hand.map((c) => ({ suit: c.suit, rank: c.rank, hidden: c.hidden })),
      bet: p.bet,
      status: p.status,
    }));

    const sanitizedDealerHand = this.state.dealerHand.map((c) => ({
      suit: c.suit,
      rank: c.rank,
      hidden: c.hidden,
    }));

    const broadcast = {
      type: 'bj:state',
      payload: {
        roomId: this.roomId,
        phase: this.state.phase,
        countdown: this.state.countdown,
        dealerHand: sanitizedDealerHand,
        players: sanitizedPlayers,
        currentTurnSeatId: this.state.currentTurnSeatId,
        roundId: this.state.roundId,
      },
      timestamp: Date.now(),
    };

    // Broadcast to all connections in the room
    for (const player of this.state.players) {
      wsManager.sendToUser(player.userId, broadcast);
    }

    this.emit('state', this.state);
  }

  /* -----------------------------------------------------------------
   * Public getters
   * ---------------------------------------------------------------- */

  getState(): BlackjackState {
    return { ...this.state };
  }

  getPlayer(userId: string): Player | undefined {
    return this.state.players.find((p) => p.userId === userId);
  }

  destroy(): void {
    this.stopCountdown();
    this.clearTurnTimer();
    this.removeAllListeners();
  }
}

// Room manager for multiplayer blackjack
export class BlackjackRoomManager {
  private rooms = new Map<string, BlackjackEngine>();

  getOrCreateRoom(roomId: string): BlackjackEngine {
    if (!this.rooms.has(roomId)) {
      const engine = new BlackjackEngine(roomId);
      this.rooms.set(roomId, engine);
      
      engine.on('state', () => {
        // Cleanup empty rooms
        if (engine.getState().players.length === 0 && engine.getState().phase === 'waiting') {
          setTimeout(() => {
            if (engine.getState().players.length === 0) {
              engine.destroy();
              this.rooms.delete(roomId);
            }
          }, 60000); // Cleanup after 1 minute of inactivity
        }
      });
    }
    return this.rooms.get(roomId)!;
  }

  getRoom(roomId: string): BlackjackEngine | undefined {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.destroy();
      this.rooms.delete(roomId);
    }
  }
}

export const blackjackRoomManager = new BlackjackRoomManager();
