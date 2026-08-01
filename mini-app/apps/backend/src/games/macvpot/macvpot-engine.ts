import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { provablyFair } from '../../game-engine/provably-fair.js';
import { bettingPipeline } from '../../game-engine/betting-pipeline.js';
import { gameConfig } from '../../services/game-config.js';
import { prisma } from '../../lib/prisma.js';
import { wsManager } from '../../lib/websocket-manager.js';
import { logger } from '../../utils/logger.js';
import { createEvent } from '@casino/shared';
import type { Bet } from '../../game-engine/types.js';

export type MacvpotPhase = 'betting' | 'delay' | 'spinning' | 'completed';

export interface MacvpotParticipant {
  betId: string;
  userId: string;
  amount: number;
  ticketStart: number;
  ticketEnd: number;
  chance: number; // Percentage (e.g. 75.5)
  placedAt: number;
  user: {
    firstName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
}

export interface MacvpotHistoryRow {
  roundId: string;
  totalPot: number;
  playerCount: number;
  winningTicket: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  winner: {
    userId: string;
    name: string;
    photoUrl: string | null;
    betAmount: number;
    chance: number;
    payout: number;
  } | null;
  endedAt: number;
}

export interface MacvpotLiveSnapshot {
  roundId: string;
  phase: MacvpotPhase;
  totalPot: number;
  playerCount: number;
  bets: MacvpotParticipant[];
  winningTicket: number | null;
  winner: MacvpotHistoryRow['winner'] | null;
  phaseEndsAt: number | null;
  serverSeedHash: string;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: number;
  spinStartedAt?: number | null;
  spinDurationMs: number;
  history: MacvpotHistoryRow[];
  timestamp: number;
}

export class MacvpotEngine extends EventEmitter {
  private roundId: string = '';
  private phase: MacvpotPhase = 'betting';
  private totalPot: number = 0;
  private bets: MacvpotParticipant[] = [];
  private winningTicket: number | null = null;
  private winner: MacvpotHistoryRow['winner'] | null = null;
  
  private serverSeed: string = '';
  private serverSeedHash: string = '';
  private clientSeed: string = '0000000000000000';
  private nonce: number = 1;

  private phaseEndsAt: number | null = null;
  private spinStartedAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private history: MacvpotHistoryRow[] = [];
  private isProcessingPhase: boolean = false;

  constructor() {
    super();
  }

  /**
   * Initialize engine and start perpetual Jackpot loop
   */
  async init(): Promise<void> {
    logger.info('Initializing MacvPot game engine...');
    await this.loadHistory();
    await this.startNewRound();
  }

  /**
   * Get public live snapshot for clients
   */
  getSnapshot(): MacvpotLiveSnapshot {
    const config = gameConfig.getCachedOrDefault('macvpot');
    const rollDuration = ((config.extras?.rollDuration as number) || 12) * 1000;

    return {
      roundId: this.roundId,
      phase: this.phase,
      totalPot: this.totalPot,
      playerCount: this.bets.length,
      bets: this.bets,
      winningTicket: this.winningTicket,
      winner: this.winner,
      phaseEndsAt: this.phaseEndsAt,
      serverSeedHash: this.serverSeedHash,
      serverSeed: this.phase === 'completed' ? this.serverSeed : null,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      spinStartedAt: this.spinStartedAt,
      spinDurationMs: rollDuration,
      history: this.history.slice(0, 20),
      timestamp: Date.now(),
    };
  }

  /**
   * Broadcast state update to all clients in macvpot_main room
   */
  private broadcastState(): void {
    const snapshot = this.getSnapshot();
    const event = createEvent('macvpot:state', snapshot as any);
    wsManager.broadcastToRoom('macvpot_main', event);
  }

  /**
   * Load history of finished rounds from DB
   */
  private async loadHistory(): Promise<void> {
    try {
      const rounds = await prisma.gameRound.findMany({
        where: { gameType: 'macvpot', state: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      this.history = rounds.map((r) => {
        const res = (r.result as any) || {};
        return {
          roundId: r.id,
          totalPot: res.totalPot || 0,
          playerCount: res.playerCount || 0,
          winningTicket: res.winningTicket || 0,
          serverSeed: r.serverSeed || '',
          serverSeedHash: r.serverSeedHash,
          clientSeed: r.clientSeed || '',
          nonce: r.nonce,
          winner: res.winner || null,
          endedAt: r.endedAt ? r.endedAt.getTime() : r.createdAt.getTime(),
        };
      });
    } catch (err) {
      logger.error({ err }, 'Failed to load MacvPot history');
    }
  }

  /**
   * Start a new Jackpot round
   */
  private async startNewRound(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);

    this.isProcessingPhase = false;
    this.roundId = randomUUID();
    this.phase = 'betting';
    this.totalPot = 0;
    this.bets = [];
    this.winningTicket = null;
    this.winner = null;
    this.spinStartedAt = null;

    this.serverSeed = provablyFair.generateServerSeed();
    this.serverSeedHash = provablyFair.hashServerSeed(this.serverSeed);
    this.clientSeed = provablyFair.generateClientSeed();
    this.nonce = 1;

    const config = await gameConfig.get('macvpot');
    this.phaseEndsAt = null; // Timer starts on 1st bet placement

    try {
      await prisma.gameRound.create({
        data: {
          id: this.roundId,
          gameType: 'macvpot',
          state: 'betting',
          serverSeedHash: this.serverSeedHash,
          serverSeed: this.serverSeed,
          clientSeed: this.clientSeed,
          nonce: this.nonce,
          startedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to create MacvPot GameRound in DB');
    }

    this.broadcastState();
  }

  /**
   * End betting phase and evaluate round state
   */
  private async endBettingPhase(): Promise<void> {
    if (this.isProcessingPhase) return;
    this.isProcessingPhase = true;

    if (this.timer) clearTimeout(this.timer);

    // If 0 players: keep phaseEndsAt null until first bet
    if (this.bets.length === 0) {
      this.phaseEndsAt = null;
      this.broadcastState();
      this.isProcessingPhase = false;
      return;
    }

    // If only 1 player: refund bet and reset round
    if (this.bets.length === 1) {
      logger.info({ roundId: this.roundId, bet: this.bets[0] }, 'MacvPot: Only 1 player at timer end. Refunding bet.');
      const singleBet = this.bets[0];
      try {
        const dbBet = await bettingPipeline.getBet(singleBet.betId);
        if (dbBet) {
          await bettingPipeline.rollbackBet(dbBet, false);
        }
      } catch (err) {
        logger.error({ err, singleBet }, 'Failed to refund single MacvPot player');
      }

      const refundEvent = createEvent('macvpot:refund', {
        roundId: this.roundId,
        userId: singleBet.userId,
        amount: singleBet.amount,
        reason: 'SOLO_PLAYER',
      });
      wsManager.broadcastToRoom('macvpot_main', refundEvent);

      try {
        await prisma.gameRound.update({
          where: { id: this.roundId },
          data: { state: 'cancelled', endedAt: new Date() },
        });
      } catch {}

      this.isProcessingPhase = false;
      this.timer = setTimeout(() => {
        void this.startNewRound();
      }, 1500);
      return;
    }

    // 2+ players: spin immediately without delay phase!
    this.isProcessingPhase = false;
    void this.startSpinningPhase();
  }

  /**
   * Start spinning phase and resolve winner using Provably Fair RNG
   */
  private async startSpinningPhase(): Promise<void> {
    if (this.isProcessingPhase) return;
    this.isProcessingPhase = true;

    if (this.timer) clearTimeout(this.timer);

    this.phase = 'spinning';
    this.spinStartedAt = Date.now();

    const config = await gameConfig.get('macvpot');
    const rollDurationSec = (config.extras?.rollDuration as number) || 12;
    this.phaseEndsAt = Date.now() + rollDurationSec * 1000;

    // Provably Fair computation
    this.clientSeed = this.bets[0]?.userId || 'macvpot_seed';
    const resultHash = provablyFair.generateResult(this.serverSeed, this.clientSeed, this.nonce);
    const float = provablyFair.hashToFloat(resultHash);

    // Calculate winning ticket (0 .. totalPot - 1)
    this.winningTicket = Math.min(this.totalPot - 1, Math.floor(float * this.totalPot));

    // Find winner corresponding to ticket range
    const winningParticipant = this.bets.find(
      (b) => this.winningTicket! >= b.ticketStart && this.winningTicket! <= b.ticketEnd
    ) || this.bets[0];

    const winnerName = winningParticipant.user?.firstName || winningParticipant.user?.username || 'Игрок';

    this.winner = {
      userId: winningParticipant.userId,
      name: winnerName,
      photoUrl: winningParticipant.user?.photoUrl || null,
      betAmount: winningParticipant.amount,
      chance: winningParticipant.chance,
      payout: this.totalPot,
    };

    this.broadcastState();

    this.isProcessingPhase = false;
    this.timer = setTimeout(() => {
      void this.completeRound(winningParticipant);
    }, rollDurationSec * 1000);
  }

  /**
   * Complete round, execute payouts via bettingPipeline, update DB & history
   */
  private async completeRound(winningParticipant: MacvpotParticipant): Promise<void> {
    if (this.isProcessingPhase) return;
    this.isProcessingPhase = true;

    if (this.timer) clearTimeout(this.timer);
    this.phase = 'completed';

    // Credit winner 100% of the pot
    try {
      const winnerDbBet = await bettingPipeline.getBet(winningParticipant.betId);
      if (winnerDbBet) {
        await bettingPipeline.processPayout(winnerDbBet, this.totalPot, false, true);
      }
    } catch (err) {
      logger.error({ err, winningParticipant }, 'Error processing MacvPot win payout');
    }

    // Process losses for other participants
    for (const p of this.bets) {
      if (p.betId === winningParticipant.betId) continue;
      try {
        const loserDbBet = await bettingPipeline.getBet(p.betId);
        if (loserDbBet) {
          await bettingPipeline.processLoss(loserDbBet, false, true);
        }
      } catch (err) {
        logger.error({ err, bet: p }, 'Error processing MacvPot loss');
      }
    }

    // Update GameRound in DB
    const roundResult = {
      totalPot: this.totalPot,
      playerCount: this.bets.length,
      winningTicket: this.winningTicket,
      winner: this.winner,
      bets: this.bets,
    };

    try {
      await prisma.gameRound.update({
        where: { id: this.roundId },
        data: {
          state: 'completed',
          result: roundResult as any,
          endedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to save completed MacvPot GameRound in DB');
    }

    // Add to history
    this.history.unshift({
      roundId: this.roundId,
      totalPot: this.totalPot,
      playerCount: this.bets.length,
      winningTicket: this.winningTicket!,
      serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      winner: this.winner,
      endedAt: Date.now(),
    });

    this.broadcastState();

    this.isProcessingPhase = false;
    // Wait 5 seconds to show winner celebration, then start new round
    this.timer = setTimeout(() => {
      void this.startNewRound();
    }, 5000);
  }

  /**
   * User places a bet in active Jackpot round
   */
  async placeBet(
    userId: string,
    amount: number,
    demoMode: boolean = false
  ): Promise<{ success: boolean; error?: string; participant?: MacvpotParticipant }> {
    const config = await gameConfig.get('macvpot');

    if (config.paused) {
      return { success: false, error: 'Игра временно приостановлена' };
    }

    if (this.phase !== 'betting') {
      return { success: false, error: 'Сбор ставок завершен' };
    }

    if (amount < config.minBet) {
      return { success: false, error: `Минимальная ставка: ${config.minBet} монет` };
    }

    if (amount > config.maxBet) {
      return { success: false, error: `Максимальная ставка: ${config.maxBet} монет` };
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return { success: false, error: 'Ставка должна быть целым положительным числом' };
    }

    // Check single bet restriction per user
    if (this.bets.some((b) => b.userId === userId)) {
      return { success: false, error: 'Вы уже сделали ставку в этом раунде' };
    }

    // Fetch user details for display
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, username: true, photoUrl: true },
    });

    const betId = randomUUID();
    const dummyBet: Bet = {
      id: betId,
      userId,
      gameId: 'macvpot',
      roundId: this.roundId,
      amount,
      state: 'pending',
      placedAt: Date.now(),
      metadata: { gameType: 'macvpot' },
    };

    // Transactional debit from user balance
    let betSuccess = false;
    let lastError = 'Недостаточно средств на балансе';
    try {
      await bettingPipeline.processBet(dummyBet, demoMode);
      betSuccess = true;
    } catch (error: any) {
      lastError = error?.message || lastError;
      // If primary mode failed due to balance, attempt alternate balance mode
      try {
        await bettingPipeline.processBet(dummyBet, !demoMode);
        betSuccess = true;
      } catch (subErr: any) {
        lastError = subErr?.message || lastError;
      }
    }

    if (!betSuccess) {
      return { success: false, error: lastError };
    }

    // Allocate ticket range
    const ticketStart = this.totalPot;
    const ticketEnd = this.totalPot + amount - 1;
    this.totalPot += amount;

    const newParticipant: MacvpotParticipant = {
      betId,
      userId,
      amount,
      ticketStart,
      ticketEnd,
      chance: 0, // Recalculated below
      placedAt: Date.now(),
      user: user || null,
    };

    this.bets.push(newParticipant);

    // Trigger 25-second countdown ONLY when at least 2 players are in the pot!
    if (this.bets.length >= 2 && !this.phaseEndsAt) {
      if (this.timer) clearTimeout(this.timer);
      const config = await gameConfig.get('macvpot');
      const bettingDurationSec = (config.extras?.bettingDuration as number) || 25;
      this.phaseEndsAt = Date.now() + bettingDurationSec * 1000;
      this.timer = setTimeout(() => {
        void this.endBettingPhase();
      }, bettingDurationSec * 1000);
    }

    // Recalculate real-time win chances for all participants
    this.recalculateChances();

    // Broadcast bet placed event & full state
    const betPlacedEvent = createEvent('macvpot:bet_placed', {
      roundId: this.roundId,
      participant: newParticipant,
      totalPot: this.totalPot,
    });
    wsManager.broadcastToRoom('macvpot_main', betPlacedEvent);
    this.broadcastState();

    return { success: true, participant: newParticipant };
  }

  /**
   * User cancels bet during betting phase
   */
  async cancelBet(userId: string, demoMode: boolean = false): Promise<{ success: boolean; error?: string }> {
    if (this.phase !== 'betting') {
      return { success: false, error: 'Отмена ставки возможна только во время сбора ставок' };
    }

    const participantIndex = this.bets.findIndex((b) => b.userId === userId);
    if (participantIndex === -1) {
      return { success: false, error: 'Ставка не найдена' };
    }

    const participant = this.bets[participantIndex];

    try {
      const dbBet = await bettingPipeline.getBet(participant.betId);
      if (dbBet) {
        await bettingPipeline.rollbackBet(dbBet, demoMode);
      }
    } catch (err) {
      logger.error({ err, participant }, 'Failed to rollback MacvPot bet on cancel');
      return { success: false, error: 'Ошибка отмены ставки' };
    }

    // Remove from active bets list
    this.bets.splice(participantIndex, 1);

    // Re-index ticket ranges and update total pot
    let currentTicket = 0;
    this.totalPot = 0;
    for (const b of this.bets) {
      b.ticketStart = currentTicket;
      b.ticketEnd = currentTicket + b.amount - 1;
      currentTicket += b.amount;
      this.totalPot += b.amount;
    }

    this.recalculateChances();

    if (this.bets.length < 2) {
      if (this.timer) clearTimeout(this.timer);
      this.phaseEndsAt = null;
    }

    const cancelEvent = createEvent('macvpot:bet_cancelled', {
      roundId: this.roundId,
      userId,
      totalPot: this.totalPot,
    });
    wsManager.broadcastToRoom('macvpot_main', cancelEvent);
    this.broadcastState();

    return { success: true };
  }

  /**
   * Recalculate percentage chances for all active bets
   */
  private recalculateChances(): void {
    if (this.totalPot === 0) return;
    for (const b of this.bets) {
      const rawChance = (b.amount / this.totalPot) * 100;
      b.chance = Math.round(rawChance * 100) / 100; // 2 decimal places
    }
  }
}
