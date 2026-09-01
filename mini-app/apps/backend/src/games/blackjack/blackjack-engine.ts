import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';
import { wsManager } from '../../lib/websocket-manager.js';
import type { Bet } from '../../game-engine/types.js';
import {
  loadTables,
  mergeTableLists,
  persistTables,
  sortTables,
  type SlimBlackjackTable,
} from './table-directory.js';
import { gameConfig } from '../../services/game-config.js';
import { rtpEngine } from '../../services/rtp-engine.js';

export const BJ_MAX_SEATS = 5;

export interface BlackjackChatMessage {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  avatar?: string;
  text: string;
  emoji?: string;
  seatId?: number | null;
  timestamp: number;
}

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
  betMetadata?: Record<string, any>;
  extraBetId?: string;
  lastActionAt?: number;
}

export interface BlackjackRoundHistoryItem {
  roundId: string;
  endedAt: number;
  dealerHand: Card[];
  dealerValue: number;
  dealerBust: boolean;
  players: Array<{
    userId: string;
    name: string;
    avatar?: string;
    seatId: number;
    bet: number;
    payout: number;
    result: 'win' | 'lose' | 'push' | 'blackjack';
    playerValue: number;
    hand: Card[];
  }>;
}

export type GamePhase = 'waiting' | 'countdown' | 'dealing' | 'player_turn' | 'dealer_turn' | 'settling' | 'finished';

export interface BlackjackState {
  roomId: string;
  phase: GamePhase;
  countdown: number;
  turnCountdown?: number;
  dealerHand: Card[];
  players: Player[];
  currentTurnSeatId: number | null;
  roundId: string;
  history?: BlackjackRoundHistoryItem[];
}

interface GameConfig {
  minBet: number;
  maxBet: number;
  countdownSeconds: number;
  dealerStandOn: number;
}

const DEFAULT_CONFIG: GameConfig = {
  minBet: 1,
  maxBet: 500,
  countdownSeconds: 12,
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
 * - Live table chat for seated players and spectators
 */
export class BlackjackEngine extends EventEmitter {
  private roomId: string;
  private config: GameConfig;
  private state: BlackjackState;
  private dealLock = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private soloAfkTimer: NodeJS.Timeout | null = null;
  private deck: Card[] = [];
  private chatHistory: BlackjackChatMessage[] = [];
  private history: BlackjackRoundHistoryItem[] = [];
  private currentSeeds = {
    serverSeed: '',
    serverSeedHash: '',
    clientSeed: '',
    nonce: 1,
    startedAt: 0,
  };

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
      history: [],
    };
  }

  /* -----------------------------------------------------------------
   * Player management
   * ---------------------------------------------------------------- */

  join(userId: string, name: string, avatar: string | undefined, seatId: number, bet: number = 0): boolean {
    // Check if seat is already taken
    const existingPlayer = this.state.players.find((p) => p.seatId === seatId);
    if (existingPlayer) {
      if (existingPlayer.userId === userId) {
        if (name && name !== 'Игрок') existingPlayer.name = name;
        if (avatar) existingPlayer.avatar = avatar;
        this.broadcastState();
        return true; // Already in this seat
      }
      // If the occupant is a guest/anonymous or inactive with 0 bet, allow real user to claim the seat
      if (
        existingPlayer.userId.startsWith('guest_') ||
        existingPlayer.userId.startsWith('anon_') ||
        (existingPlayer.status === 'waiting' && existingPlayer.bet === 0)
      ) {
        logger.info({ seatId, oldUser: existingPlayer.userId, newUser: userId }, 'Replacing inactive/guest player in seat');
        this.state.players = this.state.players.filter((p) => p.seatId !== seatId);
      } else {
        return false; // Taken by an active player
      }
    }

    // Remove from old seat if switching
    this.state.players = this.state.players.filter((p) => p.userId !== userId);

    if (this.state.players.length >= BJ_MAX_SEATS) {
      return false;
    }

    const player: Player = {
      userId,
      name,
      avatar,
      seatId,
      hand: [],
      bet: bet >= 10 ? Math.min(this.config.maxBet, bet) : 0,
      status: 'waiting',
      isReady: false,
    };
    (player as any).consecutiveAfkRounds = 0;

    this.state.players.push(player);
    this.broadcastState();

    // Start countdown if at least one player has placed a valid bet >= 10 in waiting phase
    if (this.state.players.some((p) => p.bet >= 10) && this.state.phase === 'waiting') {
      this.startCountdown();
    } else {
      this.checkSoloAfkTimer();
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
      return;
    }

    if (this.state.phase === 'countdown' && !this.state.players.some((p) => p.bet >= 10)) {
      this.stopCountdown();
      this.state.phase = 'waiting';
      this.state.countdown = this.config.countdownSeconds;
    } else if (
      (this.state.phase === 'waiting' || this.state.phase === 'countdown') &&
      this.allBettingReadyToDeal()
    ) {
      this.stopCountdown();
      void this.startRound();
      return;
    }

    this.checkSoloAfkTimer();
    this.broadcastState();
  }

  updateBet(userId: string, bet: number): boolean {
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || (this.state.phase !== 'waiting' && this.state.phase !== 'countdown')) {
      return false;
    }
    player.bet = bet >= 10 ? Math.min(this.config.maxBet, bet) : 0;
    if (player.bet > 0) {
      (player as any).consecutiveAfkRounds = 0;
      this.clearSoloAfkTimer();
    }

    if (
      (this.state.phase === 'waiting' || this.state.phase === 'countdown') &&
      this.allBettingReadyToDeal()
    ) {
      this.stopCountdown();
      void this.startRound();
      return true;
    }

    // Start countdown if at least one player has bet >= 10 in waiting phase
    if (this.state.players.some((p) => p.bet >= 10) && this.state.phase === 'waiting') {
      this.startCountdown();
    } else if (this.state.phase === 'countdown' && !this.state.players.some((p) => p.bet >= 10)) {
      // If all players reset bet to 0 during countdown, cancel countdown
      this.stopCountdown();
      this.state.phase = 'waiting';
      this.state.countdown = this.config.countdownSeconds;
      this.broadcastState();
    } else {
      this.broadcastState();
    }

    return true;
  }

  readyToDeal(userId: string, isReady?: boolean, bet?: number): boolean {
    if (this.state.phase !== 'waiting' && this.state.phase !== 'countdown') {
      return false;
    }

    const player = this.state.players.find((p) => p.userId === userId);
    if (!player) return false;

    // Apply bet synchronously if passed
    if (bet !== undefined && bet >= 10) {
      player.bet = Math.min(this.config.maxBet, bet);
      (player as any).consecutiveAfkRounds = 0;
      this.clearSoloAfkTimer();
    }

    // Toggle or set ready state
    player.isReady = isReady !== undefined ? isReady : !player.isReady;
    logger.info({ userId, isReady: player.isReady, bet: player.bet, roomId: this.roomId }, 'Player voted ready to deal');

    if (this.allBettingReadyToDeal()) {
      logger.info(
        { roomId: this.roomId, betting: this.state.players.filter((p) => p.bet >= 10).length },
        'All betting players ready — skip countdown and deal immediately'
      );
      this.stopCountdown();
      this.dealLock = false;
      void this.startRound();
      return true;
    }

    if (this.state.players.some((p) => p.bet >= 10) && this.state.phase === 'waiting') {
      this.startCountdown();
    } else {
      this.broadcastState();
    }
    return true;
  }

  private checkSoloAfkTimer(): void {
    this.clearSoloAfkTimer();
    if (this.state.players.length === 1 && this.state.phase === 'waiting') {
      const soloPlayer = this.state.players[0];
      if (soloPlayer.bet === 0) {
        this.soloAfkTimer = setTimeout(() => {
          if (this.state.players.length === 1 && this.state.players[0]?.bet === 0 && this.state.phase === 'waiting') {
            logger.info({ userId: soloPlayer.userId }, 'Kicking solo inactive player after 30s with 0 bet');
            this.leave(soloPlayer.userId);
          }
        }, 30000);
      }
    }
  }

  private clearSoloAfkTimer(): void {
    if (this.soloAfkTimer) {
      clearTimeout(this.soloAfkTimer);
      this.soloAfkTimer = null;
    }
  }

  /* -----------------------------------------------------------------
   * Game flow
   * ---------------------------------------------------------------- */

  /** Seated players who already staked ≥ 10 and all of them pressed Ready. */
  private allBettingReadyToDeal(): boolean {
    const seated = this.state.players;
    if (seated.length === 0) return false;
    const betting = seated.filter((p) => p.bet >= 10);
    return betting.length > 0 && betting.every((p) => p.isReady);
  }

  private startCountdown(): void {
    if (this.state.phase !== 'waiting') return;
    this.stopCountdown();
    this.clearSoloAfkTimer();

    this.state.phase = 'countdown';
    this.state.countdown = this.config.countdownSeconds;
    this.broadcastState();

    this.countdownTimer = setInterval(() => {
      if (this.state.countdown > 0) {
        this.state.countdown--;
        this.broadcastState();
      }

      if (this.state.countdown <= 0) {
        this.stopCountdown();
        this.dealLock = false;
        void this.startRound();
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
    if (this.dealLock) {
      logger.info({ roomId: this.roomId }, 'startRound ignored: dealLock is true');
      return;
    }
    this.dealLock = true;
    this.stopCountdown();
    this.clearSoloAfkTimer();

    try {
      if (this.state.players.length === 0) {
        this.state.phase = 'waiting';
        this.broadcastState();
        return;
      }

      // Check which players placed a valid bet >= 10
      const bettingPlayers = this.state.players.filter((p) => p.bet >= 10);
      if (bettingPlayers.length === 0) {
        // No one placed a bet — kick any 2-round AFK players and reset to waiting
        for (const p of [...this.state.players]) {
          (p as any).consecutiveAfkRounds = ((p as any).consecutiveAfkRounds || 0) + 1;
          if ((p as any).consecutiveAfkRounds >= 2) {
            logger.info({ userId: p.userId }, 'Kicking player for 2 consecutive 0-bet rounds');
            this.leave(p.userId);
          }
        }
        this.state.phase = 'waiting';
        this.state.countdown = this.config.countdownSeconds;
        this.checkSoloAfkTimer();
        this.broadcastState();
        return;
      }

      const serverSeed = provablyFair.generateServerSeed();
      const serverSeedHash = provablyFair.hashServerSeed(serverSeed);
      const clientSeed = `${this.roomId}_${Date.now()}`;
      this.currentSeeds = {
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: 1,
        startedAt: Date.now(),
      };

      this.state.phase = 'dealing';
      this.state.roundId = `blackjack_${Date.now()}_${randomUUID()}`;
      this.state.dealerHand = [];
      
      // Create deterministic cryptographically shuffled deck
      this.deck = provablyFair.generateBlackjackDeck(serverSeed, clientSeed, 1, 6);

      // Process bets first
      for (const player of [...this.state.players]) {
        if (player.bet < 10) {
          player.status = 'waiting';
          player.hand = [];
          (player as any).consecutiveAfkRounds = ((player as any).consecutiveAfkRounds || 0) + 1;
          if ((player as any).consecutiveAfkRounds >= 2) {
            this.leave(player.userId);
          }
          continue;
        }

        const bet: Bet = {
          id: `bj_bet_${player.userId}_${this.state.roundId}`,
          userId: player.userId,
          gameId: 'blackjack',
          roundId: this.state.roundId,
          amount: player.bet,
          state: 'pending',
          placedAt: Date.now(),
          metadata: { gameType: 'blackjack', mode: 'multi', roomId: this.roomId },
        };

        if (!player.userId.startsWith('guest_') && !player.userId.startsWith('anon_')) {
          try {
            await bettingPipeline.processBet(bet, false);
            player.status = 'playing';
            player.betMetadata = { ...(bet.metadata || {}) };
            (player as any).consecutiveAfkRounds = 0;
          } catch (error) {
            logger.error({ error, userId: player.userId }, 'Failed to process blackjack bet');
            player.status = 'waiting';
            player.hand = [];
            player.bet = 0;
            (player as any).consecutiveAfkRounds = ((player as any).consecutiveAfkRounds || 0) + 1;
            if ((player as any).consecutiveAfkRounds >= 2) {
              this.leave(player.userId);
            }
          }
        } else {
          // Guest / Demo player
          player.status = 'playing';
          player.betMetadata = { gameType: 'blackjack', mode: 'multi', roomId: this.roomId, demoMode: true };
          (player as any).consecutiveAfkRounds = 0;
        }
      }

      const activePlayers = this.state.players
        .filter((p) => p.status === 'playing')
        .sort((a, b) => a.seatId - b.seatId);
      if (activePlayers.length === 0) {
        this.state.phase = 'waiting';
        this.state.countdown = this.config.countdownSeconds;
        this.broadcastState();
        return;
      }

      this.broadcastState();

      // Deal first round of cards (1 to each player, 1 to dealer)
      await this.delay(600);
      for (const player of activePlayers) {
        player.hand.push(await this.drawCard(player.userId, player.hand, 'deal_player'));
        this.broadcastState();
        await this.delay(300);
      }

      // Dealer first card (visible)
      this.state.dealerHand.push(await this.drawCard('dealer', [], 'deal_dealer_up'));
      this.broadcastState();
      await this.delay(400);

      // Deal second round of cards (1 to each player, 1 hidden to dealer)
      for (const player of activePlayers) {
        player.hand.push(await this.drawCard(player.userId, player.hand, 'deal_player'));
        
        // Check for natural blackjack
        if (this.isBlackjack(player.hand)) {
          player.status = 'blackjack';
        }
        
        this.broadcastState();
        await this.delay(300);
      }

      // Dealer second card (hidden)
      const hiddenDealerCard = await this.drawCard('dealer', this.state.dealerHand, 'deal_dealer_hole');
      hiddenDealerCard.hidden = true;
      this.state.dealerHand.push(hiddenDealerCard);
      this.broadcastState();
      await this.delay(500);

      // Move to player turns
      this.startPlayerTurns();
    } catch (err) {
      logger.error({ err, roomId: this.roomId }, 'Critical error in startRound — resetting to waiting');
      this.state.phase = 'waiting';
      this.state.countdown = this.config.countdownSeconds;
      this.broadcastState();
    } finally {
      this.dealLock = false;
    }
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
    this.clearTurnTimer();
    this.state.turnCountdown = 30;
    this.broadcastState();

    this.turnTimer = setInterval(() => {
      if (this.state.phase !== 'player_turn' || !this.state.currentTurnSeatId) {
        this.clearTurnTimer();
        return;
      }

      if (this.state.turnCountdown !== undefined && this.state.turnCountdown > 0) {
        this.state.turnCountdown--;
        this.broadcastState();

        if (this.state.turnCountdown <= 0) {
          this.clearTurnTimer();
          if (this.state.currentTurnSeatId) {
            const player = this.getPlayerBySeat(this.state.currentTurnSeatId);
            if (player) {
              void this.stand(player.userId);
            }
          }
        }
      }
    }, 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
    this.state.turnCountdown = undefined;
  }

  /* -----------------------------------------------------------------
   * Player actions
   * ---------------------------------------------------------------- */

  private isProcessingTurnAction = false;

  async hit(userId: string): Promise<boolean> {
    if (this.isProcessingTurnAction) return false;
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    const now = Date.now();
    if (player.lastActionAt && now - player.lastActionAt < 350) {
      return false;
    }
    player.lastActionAt = now;

    this.isProcessingTurnAction = true;
    try {
      this.clearTurnTimer();

      // Draw card with RTP bias
      player.hand.push(await this.drawCard(userId, player.hand, 'player_hit'));
      
      const { total } = this.calculateHandValue(player.hand);
      
      if (total > 21) {
        player.status = 'bust';
        await this.nextTurn();
      } else if (total === 21) {
        // Auto-stand on 21
        player.status = 'stand';
        await this.nextTurn();
      } else {
        // Continue turn (restart timer)
        this.startTurnTimer();
      }

      this.broadcastState();
      return true;
    } finally {
      this.isProcessingTurnAction = false;
    }
  }

  async stand(userId: string): Promise<boolean> {
    if (this.isProcessingTurnAction) return false;
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    const now = Date.now();
    if (player.lastActionAt && now - player.lastActionAt < 350) {
      return false;
    }
    player.lastActionAt = now;

    this.isProcessingTurnAction = true;
    try {
      this.clearTurnTimer();
      player.status = 'stand';
      await this.nextTurn();
      this.broadcastState();
      return true;
    } finally {
      this.isProcessingTurnAction = false;
    }
  }

  async double(userId: string): Promise<boolean> {
    if (this.isProcessingTurnAction) return false;
    const player = this.state.players.find((p) => p.userId === userId);
    if (!player || player.seatId !== this.state.currentTurnSeatId || this.state.phase !== 'player_turn') {
      return false;
    }

    const now = Date.now();
    if (player.lastActionAt && now - player.lastActionAt < 350) {
      return false;
    }
    player.lastActionAt = now;

    // Can only double on first two cards
    if (player.hand.length !== 2) {
      return false;
    }

    this.isProcessingTurnAction = true;
    try {
      const extraBet: Bet = {
        id: `bj_double_${player.userId}_${this.state.roundId}`,
        userId: player.userId,
        gameId: this.state.roundId,
        roundId: this.state.roundId,
        amount: player.bet,
        state: 'pending',
        placedAt: Date.now(),
        metadata: {
          ...(player.betMetadata || {}),
          gameType: 'blackjack',
          mode: 'multi',
          roomId: this.roomId,
          action: 'double',
        },
      };

      if (!player.userId.startsWith('guest_') && !player.userId.startsWith('anon_')) {
        try {
          await bettingPipeline.processBet(extraBet, false);
          player.extraBetId = extraBet.id;
        } catch (err) {
          logger.warn({ err, userId: player.userId }, 'Failed to process double bet');
          wsManager.sendToUser(player.userId, {
            type: 'error',
            message: (err as Error)?.message || 'Недостаточно средств для удвоения',
          });
          return false;
        }
      }

      this.clearTurnTimer();

      player.bet *= 2;
      player.status = 'doubled';

      // Draw exactly one card
      player.hand.push(await this.drawCard(userId, player.hand, 'player_double'));
      
      const { total } = this.calculateHandValue(player.hand);
      if (total > 21) {
        player.status = 'bust';
      }

      await this.nextTurn();
      this.broadcastState();
      return true;
    } finally {
      this.isProcessingTurnAction = false;
    }
  }

  private getCardRankValue(rank: Rank): number {
    if (rank === 'A') return 11;
    if (['K', 'Q', 'J', '10'].includes(rank)) return 10;
    return parseInt(rank, 10) || 0;
  }

  private async nextTurn(): Promise<void> {
    this.clearTurnTimer();
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

    this.broadcastState();
  }

  /* -----------------------------------------------------------------
   * Dealer AI
   * ---------------------------------------------------------------- */

  private async startDealerTurn(): Promise<void> {
    this.clearTurnTimer();
    this.state.phase = 'dealer_turn';
    this.state.currentTurnSeatId = null;
    
    // Reveal hidden card
    if (this.state.dealerHand.length > 1 && this.state.dealerHand[1].hidden) {
      this.state.dealerHand[1].hidden = false;
      this.broadcastState();
      await this.delay(800);
    }

    // Dealer hits until standOn (17)
    let { total } = this.calculateHandValue(this.state.dealerHand);
    
    while (total < this.config.dealerStandOn) {
      await this.delay(800);
      this.state.dealerHand.push(await this.drawCard('dealer', this.state.dealerHand, 'dealer_hit'));
      total = this.calculateHandValue(this.state.dealerHand).total;
      this.broadcastState();
    }

    await this.delay(800);
    this.settleRound();
  }

  /* -----------------------------------------------------------------
   * Settlement & Payouts
   * ---------------------------------------------------------------- */

  private async settleRound(): Promise<void> {
    this.state.phase = 'settling';
    this.broadcastState();

    const activePlayers = this.state.players.filter((p) => p.status !== 'waiting' && p.hand.length > 0);
    const dealerValue = this.calculateHandValue(this.state.dealerHand).total;
    const dealerBust = dealerValue > 21;
    const dealerBJ = this.isBlackjack(this.state.dealerHand);

    for (const player of this.state.players) {
      if (player.status === 'waiting' || player.hand.length === 0) continue;

      const playerValue = this.calculateHandValue(player.hand).total;
      const playerBust = player.status === 'bust' || playerValue > 21;
      const playerBJ = player.status === 'blackjack' || this.isBlackjack(player.hand);

      let result: 'win' | 'lose' | 'push' | 'blackjack';
      let payout = 0;

      if (playerBust) {
        result = 'lose';
        payout = 0;
      } else if (playerBJ && !dealerBJ) {
        result = 'blackjack';
        payout = player.bet * 2.5; // 3:2 payout
      } else if (dealerBJ && !playerBJ) {
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
      const betMetadata = {
        ...(player.betMetadata || {}),
        gameType: 'blackjack',
        mode: 'multi',
        roomId: this.roomId,
        result,
      };

      const bet: Bet = {
        id: `bj_bet_${player.userId}_${this.state.roundId}`,
        userId: player.userId,
        gameId: 'blackjack',
        roundId: this.state.roundId,
        amount: player.bet,
        multiplier: player.bet > 0 ? payout / player.bet : 0,
        state: 'active',
        placedAt: Date.now(),
        metadata: betMetadata,
      };

      if (!player.userId.startsWith('guest_') && !player.userId.startsWith('anon_')) {
        try {
          if (payout > 0) {
            await bettingPipeline.processPayout(bet, payout, false);
          } else if (result === 'push') {
            await bettingPipeline.processPayout(bet, player.bet, false);
          } else {
            await bettingPipeline.processLoss(bet);
          }

          if (player.extraBetId) {
            try {
              await prisma.bet.update({
                where: { id: player.extraBetId },
                data: {
                  state: payout > 0 ? 'won' : (result === 'push' ? 'push' : 'lost'),
                  resolvedAt: new Date(),
                },
              });
            } catch {}
          }

          // Force balance broadcast to all user clients
          try {
            const { balanceService } = await import('../../services/balance-service.js');
            await balanceService.syncBalance(player.userId);
          } catch {}

          // Save game round
          await prisma.gameRound.create({
            data: {
              id: `${this.state.roundId}_${player.userId}`,
              gameType: 'blackjack',
              state: 'completed',
              serverSeedHash: this.currentSeeds.serverSeedHash,
              serverSeed: this.currentSeeds.serverSeed,
              clientSeed: this.currentSeeds.clientSeed,
              nonce: 1,
              startedAt: new Date(this.currentSeeds.startedAt || Date.now()),
              endedAt: new Date(),
              metadata: { mode: 'multi', betAmount: player.bet, roomId: this.roomId },
              result: {
                result,
                payout,
                playerHand: JSON.parse(JSON.stringify(player.hand)),
                dealerHand: JSON.parse(JSON.stringify(this.state.dealerHand)),
                playerValue,
                dealerValue,
                serverSeed: this.currentSeeds.serverSeed,
                serverSeedHash: this.currentSeeds.serverSeedHash,
                clientSeed: this.currentSeeds.clientSeed,
              } as any,
            },
          }).catch((err) => logger.warn(err, 'Failed to record blackjack round'));

        } catch (err) {
          logger.error({ err, userId: player.userId }, 'Failed to settle blackjack bet');
        }
      }
    }

    // Record round in memory history
    const historyItem: BlackjackRoundHistoryItem = {
      roundId: this.state.roundId,
      endedAt: Date.now(),
      dealerHand: JSON.parse(JSON.stringify(this.state.dealerHand)),
      dealerValue,
      dealerBust,
      players: activePlayers.map((p) => {
        const pVal = this.calculateHandValue(p.hand).total;
        const pBJ = this.isBlackjack(p.hand);
        const pBust = pVal > 21;
        let res: 'win' | 'lose' | 'push' | 'blackjack' = 'lose';
        let pay = 0;
        if (pBJ && !dealerBJ) {
          res = 'blackjack';
          pay = p.bet * 2.5;
        } else if (pBJ && dealerBJ) {
          res = 'push';
          pay = p.bet;
        } else if (pBust) {
          res = 'lose';
          pay = 0;
        } else if (dealerBJ && !pBJ) {
          res = 'lose';
          pay = 0;
        } else if (dealerBust) {
          res = 'win';
          pay = p.bet * 2;
        } else if (pVal > dealerValue) {
          res = 'win';
          pay = p.bet * 2;
        } else if (pVal === dealerValue) {
          res = 'push';
          pay = p.bet;
        }
        return {
          userId: p.userId,
          name: p.name,
          avatar: p.avatar,
          seatId: p.seatId,
          bet: p.bet,
          payout: pay,
          result: res,
          playerValue: pVal,
          hand: JSON.parse(JSON.stringify(p.hand)),
        };
      }),
    };

    this.history.unshift(historyItem);
    if (this.history.length > 25) {
      this.history.pop();
    }
    this.state.history = this.history;
    this.broadcastState();

    // Reset for next round
    await this.delay(3500);
    this.resetForNextRound();
  }

  public getHistory(): BlackjackRoundHistoryItem[] {
    return this.history;
  }

  private resetForNextRound(): void {
    this.clearTurnTimer();
    this.dealLock = false;
    this.state.phase = 'waiting';
    this.state.countdown = this.config.countdownSeconds;
    this.state.dealerHand = [];
    this.state.currentTurnSeatId = null;
    this.state.roundId = '';

    for (const player of this.state.players) {
      player.hand = [];
      player.extraBetId = undefined;
      player.status = 'waiting';
      player.bet = 0; // Point #12: bet resets to 0 for next round
      player.isReady = false;
    }

    this.broadcastState();
    this.checkSoloAfkTimer();
  }

  private resetGame(): void {
    this.stopCountdown();
    this.clearTurnTimer();
    this.clearSoloAfkTimer();
    this.dealLock = false;
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
   * Card utilities & Intelligent Dealing Engine
   * ---------------------------------------------------------------- */

  /**
   * Analyzes recent rounds to prevent unfair dealer win streaks (20/21)
   * and regulate the dealer bust rate to stay near theoretical (~28-30%).
   */
  private analyzeDealerHistory(): {
    recent20_21Rate: number;
    recentBustRate: number;
    consecutive20_21: number;
    consecutiveNoBust: number;
    totalRounds: number;
  } {
    const totalRounds = this.history.length;
    if (totalRounds === 0) {
      return {
        recent20_21Rate: 0.28,
        recentBustRate: 0.28,
        consecutive20_21: 0,
        consecutiveNoBust: 0,
        totalRounds: 0,
      };
    }

    const window = this.history.slice(0, 15);
    const recent20_21Count = window.filter(
      (h) => !h.dealerBust && (h.dealerValue === 20 || h.dealerValue === 21)
    ).length;
    const recentBustCount = window.filter((h) => h.dealerBust).length;

    let consecutive20_21 = 0;
    for (const h of this.history) {
      if (!h.dealerBust && (h.dealerValue === 20 || h.dealerValue === 21)) {
        consecutive20_21++;
      } else {
        break;
      }
    }

    let consecutiveNoBust = 0;
    for (const h of this.history) {
      if (!h.dealerBust) {
        consecutiveNoBust++;
      } else {
        break;
      }
    }

    return {
      recent20_21Rate: recent20_21Count / window.length,
      recentBustRate: recentBustCount / window.length,
      consecutive20_21,
      consecutiveNoBust,
      totalRounds,
    };
  }

  private async drawCard(
    recipient: string,
    currentHand?: Card[],
    context?: 'deal_player' | 'deal_dealer_up' | 'deal_dealer_hole' | 'player_hit' | 'player_double' | 'dealer_hit'
  ): Promise<Card> {
    if (this.deck.length < 15) {
      this.currentSeeds.nonce++;
      const freshShoe = provablyFair.generateBlackjackDeck(
        this.currentSeeds.serverSeed,
        this.currentSeeds.clientSeed,
        this.currentSeeds.nonce,
        6
      );
      this.deck.push(...freshShoe);
    }

    // Default uniform fallback if no context or empty hand
    if (!context) {
      return this.deck.pop()!;
    }

    try {
      const hist = this.analyzeDealerHistory();

      if (recipient === 'dealer') {
        let globalBias = 0;
        try {
          // Average bias of active betting players
          const activeBetting = this.state.players.filter((p) => p.bet >= 10 && !p.userId.startsWith('guest_'));
          if (activeBetting.length > 0) {
            const biases = await Promise.all(activeBetting.map((p) => rtpEngine.getBiasFor(p.userId)));
            globalBias = biases.reduce((a, b) => a + b, 0) / biases.length;
          } else {
            globalBias = await rtpEngine.getGlobalBias();
          }
        } catch {
          globalBias = 0;
        }

        // Subcase 1: Dealer Hole Card (2nd card dealt face-down)
        if (context === 'deal_dealer_hole' && currentHand && currentHand.length > 0) {
          const upcard = currentHand[0];
          const upcardVal = this.getCardRankValue(upcard.rank);
          const weights: number[] = [];

          for (const card of this.deck) {
            const cardVal = this.getCardRankValue(card.rank);
            const isNaturalBJ = (upcardVal === 11 && cardVal === 10) || (upcardVal === 10 && cardVal === 11);
            const isTwenty = upcardVal === 10 && cardVal === 10;
            let w = 1.0;

            if (isNaturalBJ) {
              // Theoretical natural BJ is ~4.75%
              w = 0.0475;
              if (hist.consecutive20_21 >= 1 || hist.recent20_21Rate > 0.32) {
                w *= 0.15; // Anti-streak suppression: don't let dealer get back-to-back Blackjacks
              }
              if (globalBias < 0) {
                w *= 0.2;
              }
            } else if (isTwenty) {
              // Two 10s is ~9.5%
              w = 0.095;
              if (hist.consecutive20_21 >= 1 || hist.recent20_21Rate > 0.32) {
                w *= 0.25; // Suppress consecutive 20s
              }
              if (globalBias < 0) {
                w *= 0.4;
              }
            } else {
              // Other hole cards (makes starting totals 12-19)
              w = 0.85;
              if (hist.consecutiveNoBust >= 3) {
                // Favor stiff upcard totals (12-16) so dealer can naturally bust later
                const handTot = upcardVal + cardVal;
                if (handTot >= 12 && handTot <= 16) {
                  w *= 1.4;
                }
              }
            }
            weights.push(Math.max(0.001, w));
          }

          return this.pickWeightedFromDeck(weights);
        }

        // Subcase 2: Dealer Hit (Drawing while total < 17)
        if (context === 'dealer_hit' && currentHand) {
          const weights: number[] = [];

          for (const card of this.deck) {
            const simHand = [...currentHand, card];
            const simTotal = this.calculateHandValue(simHand).total;
            let w = 1.0;

            if (simTotal > 21) {
              // Target dealer bust rate is ~28.5%
              w = 0.285;
              // If dealer hasn't busted recently, boost bust probability so history looks natural
              if (hist.consecutiveNoBust >= 4 || (hist.totalRounds >= 5 && hist.recentBustRate < 0.20)) {
                w *= 2.8;
              } else if (hist.consecutiveNoBust >= 2) {
                w *= 1.6;
              }
              if (hist.consecutive20_21 >= 1) {
                w *= 1.8;
              }
              if (globalBias < 0) {
                w *= 1 + Math.abs(globalBias) * 1.5;
              }
              if (hist.totalRounds >= 5 && hist.recentBustRate > 0.38) {
                w *= 0.55; // Prevent over-busting if dealer already busted a lot
              }
            } else if (simTotal === 17) {
              w = 0.145;
              if (hist.consecutive20_21 >= 2) w *= 1.6;
            } else if (simTotal === 18) {
              w = 0.138;
              if (hist.consecutive20_21 >= 2) w *= 1.5;
            } else if (simTotal === 19) {
              w = 0.132;
              if (hist.consecutive20_21 >= 2) w *= 1.4;
            } else if (simTotal === 20) {
              w = 0.175;
              if (hist.consecutive20_21 >= 1) w *= 0.30;
              if (hist.consecutive20_21 >= 2 || (hist.totalRounds >= 5 && hist.recent20_21Rate > 0.32)) {
                w *= 0.12;
              }
              if (globalBias < 0) w *= 0.35;
            } else if (simTotal === 21) {
              w = 0.125;
              if (hist.consecutive20_21 >= 1) w *= 0.25;
              if (hist.consecutive20_21 >= 2 || (hist.totalRounds >= 5 && hist.recent20_21Rate > 0.32)) {
                w *= 0.08;
              }
              if (globalBias < 0) w *= 0.30;
            } else {
              // simTotal < 17 (Dealer will draw again)
              w = 0.25;
            }

            weights.push(Math.max(0.001, w));
          }

          return this.pickWeightedFromDeck(weights);
        }

        // Subcase 3: Dealer first upcard (fair initial deal)
        return this.deck.pop()!;
      }

      // Recipient is a Player
      const isGuest = recipient.startsWith('guest_') || recipient.startsWith('anon_');
      let playerBias = 0;
      if (!isGuest) {
        try {
          playerBias = await rtpEngine.getBiasFor(recipient);
        } catch {
          playerBias = 0;
        }
      }

      // Player hitting or doubling
      if ((context === 'player_hit' || context === 'player_double') && currentHand) {
        const curVal = this.calculateHandValue(currentHand).total;
        const weights: number[] = [];

        for (const card of this.deck) {
          const simHand = [...currentHand, card];
          const simTotal = this.calculateHandValue(simHand).total;
          let w = 1.0;

          if (context === 'player_double' && (curVal === 10 || curVal === 11)) {
            // Player doubled on 10/11 -> standard ~60% chance of 19, 20, 21
            if (simTotal === 20 || simTotal === 21) {
              w = 0.40;
              if (playerBias < 0) w *= 1.6;
            } else if (simTotal === 19) {
              w = 0.25;
              if (playerBias < 0) w *= 1.3;
            } else {
              w = 0.35;
              if (playerBias > 0) w *= 1.3;
            }
          } else if (curVal >= 12 && curVal <= 16) {
            // Stiff hand hit
            if (simTotal <= 21) {
              w = 0.50;
              if (playerBias < 0) w *= 1 + Math.abs(playerBias) * 1.5;
            } else {
              // Bust card
              w = 0.50;
              if (playerBias < 0) w *= Math.max(0.2, 1 - Math.abs(playerBias) * 0.7);
              if (playerBias > 0) w *= 1 + playerBias * 0.5;
            }
          }

          weights.push(Math.max(0.001, w));
        }

        return this.pickWeightedFromDeck(weights);
      }

      // Default deal card
      return this.deck.pop()!;
    } catch (err) {
      logger.warn({ err }, 'Error in smart drawCard, falling back to top of deck');
      return this.deck.pop()!;
    }
  }

  private pickWeightedFromDeck(weights: number[]): Card {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let randomVal = Math.random() * totalWeight;

    for (let i = 0; i < this.deck.length; i++) {
      randomVal -= weights[i];
      if (randomVal <= 0) {
        const [chosen] = this.deck.splice(i, 1);
        return chosen;
      }
    }

    return this.deck.pop()!;
  }

  calculateHandValue(hand: Card[], includeHidden = false): { total: number; soft: boolean } {
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
      isReady: !!p.isReady,
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
        history: this.history,
      },
      timestamp: Date.now(),
    };

    // Broadcast to room subscribers (both seated players & spectators)
    wsManager.broadcastToRoom(`bj_${this.roomId}`, broadcast);
    wsManager.broadcastToRoom(this.roomId, broadcast);
    for (const player of this.state.players) {
      wsManager.sendToUser(player.userId, broadcast);
    }

    this.emit('state', this.state);
  }

  /* -----------------------------------------------------------------
   * Table Chat
   * ---------------------------------------------------------------- */

  addChatMessage(
    userId: string,
    name: string,
    avatar: string | undefined,
    text: string,
    emoji?: string
  ): BlackjackChatMessage {
    const player = this.state.players.find((p) => p.userId === userId);
    const msg: BlackjackChatMessage = {
      id: `bj_msg_${Date.now()}_${randomUUID().slice(0, 6)}`,
      roomId: this.roomId,
      userId,
      name: name || 'Игрок',
      avatar,
      text: text.slice(0, 200),
      emoji,
      seatId: player ? player.seatId : null,
      timestamp: Date.now(),
    };

    this.chatHistory.push(msg);
    if (this.chatHistory.length > 50) {
      this.chatHistory.shift();
    }

    const broadcast = {
      type: 'blackjack:chat:message',
      payload: msg,
      timestamp: Date.now(),
    };

    wsManager.broadcastToRoom(`bj_${this.roomId}`, broadcast);
    wsManager.broadcastToRoom(this.roomId, broadcast);
    for (const p of this.state.players) {
      wsManager.sendToUser(p.userId, broadcast);
    }

    return msg;
  }

  getChatHistory(): BlackjackChatMessage[] {
    return [...this.chatHistory];
  }

  /* -----------------------------------------------------------------
   * Public getters
   * ---------------------------------------------------------------- */

  getRoomId(): string {
    return this.roomId;
  }

  getState(): BlackjackState {
    return { ...this.state };
  }

  /** JSON-safe snapshot for HTTP (no betMetadata / history bloat). */
  getPublicState(): Omit<BlackjackState, 'history'> {
    const raw = this.getState();
    return {
      roomId: raw.roomId,
      phase: raw.phase,
      countdown: raw.countdown,
      turnCountdown: raw.turnCountdown,
      dealerHand: Array.isArray(raw.dealerHand) ? raw.dealerHand.map((c) => ({ ...c })) : [],
      players: Array.isArray(raw.players)
        ? raw.players.map((p) => ({
            userId: p.userId,
            name: p.name,
            avatar: p.avatar,
            seatId: p.seatId,
            hand: Array.isArray(p.hand) ? p.hand.map((c) => ({ ...c })) : [],
            bet: p.bet,
            status: p.status,
            isReady: p.isReady,
          }))
        : [],
      currentTurnSeatId: raw.currentTurnSeatId,
      roundId: raw.roundId,
    };
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

export interface BlackjackTableSummary {
  roomId: string;
  phase: GamePhase;
  playersCount: number;
  maxSeats: number;
  countdown: number;
  turnCountdown?: number;
  dealerHand: Card[];
  dealerScore: number;
  players: Player[];
  chatCount: number;
}

// Room manager for multiplayer blackjack
export class BlackjackRoomManager {
  private rooms = new Map<string, BlackjackEngine>();

  private seatedCount(engine: BlackjackEngine): number {
    const players = engine.getState()?.players;
    return Array.isArray(players) ? players.length : 0;
  }

  private hasFreeSeat(engine: BlackjackEngine): boolean {
    return this.seatedCount(engine) < BJ_MAX_SEATS;
  }

  /** Keep one completely empty table so players can switch even when table 1 has free seats. */
  ensureSpareEmptyTable(known?: SlimBlackjackTable[]): void {
    this.getOrCreateRoom('bj_table_1');
    const occupancy = known ?? this.localSlim();
    if (occupancy.some((t) => t.playersCount === 0)) return;

    let index = 1;
    while (
      this.rooms.has(`bj_table_${index}`) ||
      occupancy.some((t) => t.roomId === `bj_table_${index}`)
    ) {
      index += 1;
    }
    const newRoomId = `bj_table_${index}`;
    logger.info({ newRoomId, fullTables: occupancy.length }, 'Opened spare blackjack table because others are full');
    this.getOrCreateRoom(newRoomId);
    this.publishLobby(this.localSlim());
  }

  private localSlim(): SlimBlackjackTable[] {
    return sortTables(
      [...this.rooms.values()].map((engine) => {
        const state = engine.getState();
        return {
          roomId: engine.getRoomId() || 'bj_table_1',
          phase: state?.phase || 'waiting',
          playersCount: Array.isArray(state?.players) ? state.players.length : 0,
          maxSeats: BJ_MAX_SEATS,
          countdown: state?.countdown ?? 12,
        };
      })
    );
  }

  private publishLobby(tables: SlimBlackjackTable[]): void {
    const msg = {
      type: 'bj:tables',
      payload: { tables },
      timestamp: Date.now(),
    };
    for (const engine of this.rooms.values()) {
      const id = engine.getRoomId();
      wsManager.broadcastToRoom(id, msg);
      wsManager.broadcastToRoom(`bj_${id}`, msg);
    }
    void persistTables(tables);
  }

  getPublicTableList(): SlimBlackjackTable[] {
    return this.localSlim();
  }

  getOrCreateRoom(roomId: string): BlackjackEngine {
    const cleanId = roomId || 'bj_table_1';
    if (!this.rooms.has(cleanId)) {
      const engine = new BlackjackEngine(cleanId);
      this.rooms.set(cleanId, engine);

      engine.on('state', () => {
        const seated = this.seatedCount(engine);
        this.ensureSpareEmptyTable();
        if (cleanId !== 'bj_table_1' && seated === 0 && engine.getState().phase === 'waiting') {
          setTimeout(() => {
            if (this.seatedCount(engine) !== 0 || !this.rooms.has(cleanId)) return;
            const otherEmpty = [...this.rooms.entries()].some(
              ([id, other]) => id !== cleanId && this.seatedCount(other) === 0
            );
            if (!otherEmpty) return;
            engine.destroy();
            this.rooms.delete(cleanId);
            this.publishLobby(this.localSlim());
          }, 300000);
        }
        this.publishLobby(this.localSlim());
      });
    }
    return this.rooms.get(cleanId)!;
  }

  getRoom(roomId: string): BlackjackEngine | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): BlackjackEngine[] {
    this.getOrCreateRoom('bj_table_1');
    return Array.from(this.rooms.values());
  }

  isTableFull(engine: BlackjackEngine): boolean {
    return !this.hasFreeSeat(engine);
  }

  /**
   * Never return a full table. If every occupied table is 5/5, open a new empty one.
   * A seated player is only kept on their table when that table still has a free seat
   * (they already have a chair). Auto-search / join of a packed table goes to the spare.
   */
  findAvailableTable(userId?: string): BlackjackEngine {
    try {
      this.getOrCreateRoom('bj_table_1');

      if (userId) {
        for (const engine of this.rooms.values()) {
          const state = engine.getState();
          if (
            state &&
            Array.isArray(state.players) &&
            state.players.some((p) => p.userId === userId) &&
            this.hasFreeSeat(engine)
          ) {
            return engine;
          }
        }
      }

      for (const engine of this.rooms.values()) {
        if (this.hasFreeSeat(engine)) return engine;
      }

      this.ensureSpareEmptyTable();
      for (const engine of this.rooms.values()) {
        if (this.hasFreeSeat(engine)) return engine;
      }

      let index = 1;
      while (this.rooms.has(`bj_table_${index}`)) index += 1;
      return this.getOrCreateRoom(`bj_table_${index}`);
    } catch (err) {
      logger.error({ err }, 'Error finding available table, opening a fresh empty table');
      let index = 1;
      while (this.rooms.has(`bj_table_${index}`)) index += 1;
      return this.getOrCreateRoom(`bj_table_${index}`);
    }
  }

  async getAllTablesSummary(): Promise<BlackjackTableSummary[]> {
    try {
      this.getOrCreateRoom('bj_table_1');
      const remote = await loadTables();
      const merged = mergeTableLists(this.localSlim(), remote);
      this.ensureSpareEmptyTable(merged);
      const overlay = mergeTableLists(this.localSlim(), remote);
      void persistTables(overlay);

      const fatById = new Map(
        Array.from(this.rooms.values()).map((engine) => {
          const state = engine.getState() || {
            phase: 'waiting' as const,
            players: [] as BlackjackState['players'],
            dealerHand: [] as BlackjackState['dealerHand'],
            countdown: 12,
            roundId: '',
            currentTurnSeatId: null,
            roomId: engine.getRoomId(),
          };
          const dealerHand = Array.isArray(state.dealerHand) ? state.dealerHand : [];
          let dealerScore = 0;
          try {
            if (dealerHand.length > 0) {
              dealerScore = engine.calculateHandValue(dealerHand).total;
            }
          } catch {}
          const slim = overlay.find((t) => t.roomId === engine.getRoomId());
          const players = Array.isArray(state.players)
            ? state.players.map((p) => ({
                userId: p.userId,
                name: p.name,
                avatar: p.avatar,
                seatId: p.seatId,
                hand: p.hand,
                bet: p.bet,
                status: p.status,
                isReady: p.isReady,
              }))
            : [];
          return [
            engine.getRoomId() || 'bj_table_1',
            {
              roomId: engine.getRoomId() || 'bj_table_1',
              phase: (slim?.phase as BlackjackTableSummary['phase']) || state.phase || 'waiting',
              playersCount: Math.max(players.length, slim?.playersCount ?? 0),
              maxSeats: BJ_MAX_SEATS,
              countdown: slim?.countdown ?? state.countdown ?? 12,
              turnCountdown: state.turnCountdown ?? 30,
              dealerHand,
              dealerScore,
              players,
              chatCount: Array.isArray(engine.getChatHistory()) ? engine.getChatHistory().length : 0,
            } satisfies BlackjackTableSummary,
          ] as const;
        })
      );

      for (const row of overlay) {
        if (!fatById.has(row.roomId)) {
          fatById.set(row.roomId, {
            roomId: row.roomId,
            phase: (row.phase as BlackjackTableSummary['phase']) || 'waiting',
            playersCount: row.playersCount,
            maxSeats: row.maxSeats || BJ_MAX_SEATS,
            countdown: row.countdown,
            turnCountdown: 30,
            players: [],
            dealerHand: [],
            dealerScore: 0,
            chatCount: 0,
          });
        }
      }

      return sortTables([...fatById.values()]);
    } catch (err) {
      logger.error({ err }, 'Error in getAllTablesSummary');
      try {
        this.getOrCreateRoom('bj_table_1');
        this.ensureSpareEmptyTable();
        return this.localSlim().map((row) => ({
          ...row,
          phase: (row.phase as GamePhase) || 'waiting',
          turnCountdown: 30,
          dealerHand: [],
          dealerScore: 0,
          players: [],
          chatCount: 0,
        }));
      } catch {
        return [];
      }
    }
  }

  leaveAllRooms(userId: string): void {
    for (const engine of this.rooms.values()) {
      engine.leave(userId);
    }
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
