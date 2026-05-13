import { PrismaClient } from '@prisma/client';
import { balanceService } from '../services/balance-service.js';
import { transactionService } from '../services/transaction-service.js';
import { logger } from '../utils/logger.js';
import type { Bet, BetState } from './types.js';

/**
 * Unified Betting Pipeline
 * Handles bet processing, balance deduction, and payout distribution
 * 
 * CRITICAL: Server-authoritative, transactional, rollback-safe
 */

const prisma = new PrismaClient();

export class BettingPipeline {
  /**
   * Process bet placement
   * Deducts balance and creates bet record
   */
  async processBet(bet: Bet, demoMode: boolean = false): Promise<void> {
    try {
      // Get current balance
      const balance = await balanceService.getBalance(bet.userId, demoMode);

      if (balance.amount < bet.amount) {
        throw new Error('Insufficient balance');
      }

      // Deduct bet amount
      const newBalance = balance.amount - bet.amount;

      if (demoMode) {
        await balanceService.updateDemoBalance(bet.userId, newBalance);
      } else {
        // In real mode, this would sync with Python bot
        // For now, just invalidate cache to force refresh
        await balanceService.invalidateCache(bet.userId);
      }

      // Record transaction
      await transactionService.recordTransactionReference(
        bet.userId,
        'bet',
        -bet.amount,
        {
          betId: bet.id,
          gameId: bet.gameId,
          roundId: bet.roundId,
        }
      );

      // Store bet in database
      await prisma.bet.create({
        data: {
          id: bet.id,
          userId: bet.userId,
          gameType: bet.gameId.split('_')[0],
          roundId: bet.roundId,
          amount: bet.amount,
          state: bet.state,
          placedAt: new Date(bet.placedAt),
          metadata: bet.metadata || {},
        },
      });

      logger.info({ betId: bet.id, userId: bet.userId, amount: bet.amount }, 'Bet processed');
    } catch (error) {
      logger.error(error, 'Failed to process bet');
      throw error;
    }
  }

  /**
   * Process bet payout
   * Credits winnings to user balance
   */
  async processPayout(bet: Bet, payout: number, demoMode: boolean = false): Promise<void> {
    try {
      // Get current balance
      const balance = await balanceService.getBalance(bet.userId, demoMode);

      // Add payout
      const newBalance = balance.amount + payout;

      if (demoMode) {
        await balanceService.updateDemoBalance(bet.userId, newBalance);
      } else {
        // In real mode, sync with Python bot
        await balanceService.invalidateCache(bet.userId);
      }

      // Record transaction
      await transactionService.recordTransactionReference(
        bet.userId,
        'win',
        payout,
        {
          betId: bet.id,
          gameId: bet.gameId,
          roundId: bet.roundId,
          multiplier: bet.multiplier,
        }
      );

      // Update bet record
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          state: 'won',
          payout,
          multiplier: bet.multiplier,
          resolvedAt: new Date(),
        },
      });

      logger.info(
        { betId: bet.id, userId: bet.userId, payout, multiplier: bet.multiplier },
        'Payout processed'
      );
    } catch (error) {
      logger.error(error, 'Failed to process payout');
      throw error;
    }
  }

  /**
   * Process bet loss
   * Updates bet state to lost
   */
  async processLoss(bet: Bet): Promise<void> {
    try {
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          state: 'lost',
          resolvedAt: new Date(),
        },
      });

      logger.info({ betId: bet.id, userId: bet.userId }, 'Bet lost');
    } catch (error) {
      logger.error(error, 'Failed to process loss');
      throw error;
    }
  }

  /**
   * Process cashout
   * Credits partial winnings and closes bet
   */
  async processCashout(
    bet: Bet,
    cashoutAmount: number,
    multiplier: number,
    demoMode: boolean = false
  ): Promise<void> {
    try {
      // Get current balance
      const balance = await balanceService.getBalance(bet.userId, demoMode);

      // Add cashout amount
      const newBalance = balance.amount + cashoutAmount;

      if (demoMode) {
        await balanceService.updateDemoBalance(bet.userId, newBalance);
      } else {
        await balanceService.invalidateCache(bet.userId);
      }

      // Record transaction
      await transactionService.recordTransactionReference(
        bet.userId,
        'cashout',
        cashoutAmount,
        {
          betId: bet.id,
          gameId: bet.gameId,
          roundId: bet.roundId,
          multiplier,
        }
      );

      // Update bet record
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          state: 'cashed_out',
          payout: cashoutAmount,
          multiplier,
          resolvedAt: new Date(),
        },
      });

      logger.info(
        { betId: bet.id, userId: bet.userId, cashoutAmount, multiplier },
        'Cashout processed'
      );
    } catch (error) {
      logger.error(error, 'Failed to process cashout');
      throw error;
    }
  }

  /**
   * Rollback bet (in case of error)
   * Refunds bet amount to user
   */
  async rollbackBet(bet: Bet, demoMode: boolean = false): Promise<void> {
    try {
      // Get current balance
      const balance = await balanceService.getBalance(bet.userId, demoMode);

      // Refund bet amount
      const newBalance = balance.amount + bet.amount;

      if (demoMode) {
        await balanceService.updateDemoBalance(bet.userId, newBalance);
      } else {
        await balanceService.invalidateCache(bet.userId);
      }

      // Record refund transaction
      await transactionService.recordTransactionReference(
        bet.userId,
        'refund',
        bet.amount,
        {
          betId: bet.id,
          gameId: bet.gameId,
          roundId: bet.roundId,
          reason: 'rollback',
        }
      );

      // Update bet record
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          state: 'cancelled',
          resolvedAt: new Date(),
        },
      });

      logger.info({ betId: bet.id, userId: bet.userId, amount: bet.amount }, 'Bet rolled back');
    } catch (error) {
      logger.error(error, 'Failed to rollback bet');
      throw error;
    }
  }

  /**
   * Get bet by ID
   */
  async getBet(betId: string): Promise<Bet | null> {
    try {
      const bet = await prisma.bet.findUnique({
        where: { id: betId },
      });

      if (!bet) {
        return null;
      }

      return {
        id: bet.id,
        userId: bet.userId,
        gameId: bet.gameType,
        roundId: bet.roundId,
        amount: Number(bet.amount),
        state: bet.state as any,
        placedAt: bet.placedAt.getTime(),
        resolvedAt: bet.resolvedAt?.getTime(),
        payout: bet.payout ? Number(bet.payout) : undefined,
        multiplier: bet.multiplier ? Number(bet.multiplier) : undefined,
        metadata: bet.metadata as any,
      };
    } catch (error) {
      logger.error(error, 'Failed to get bet');
      return null;
    }
  }

  /**
   * Get user's active bets
   */
  async getActiveBets(userId: string): Promise<Bet[]> {
    try {
      const bets = await prisma.bet.findMany({
        where: {
          userId,
          state: {
            in: ['pending', 'active'],
          },
        },
        orderBy: {
          placedAt: 'desc',
        },
      });

      return bets.map((bet) => ({
        id: bet.id,
        userId: bet.userId,
        gameId: bet.gameType,
        roundId: bet.roundId || '',
        amount: Number(bet.amount),
        state: bet.state as BetState,
        placedAt: bet.placedAt.getTime(),
        resolvedAt: bet.resolvedAt?.getTime(),
        payout: bet.payout ? Number(bet.payout) : undefined,
        multiplier: bet.multiplier ? Number(bet.multiplier) : undefined,
        metadata: bet.metadata as any,
      }));
    } catch (error) {
      logger.error(error, 'Failed to get active bets');
      return [];
    }
  }
}

export const bettingPipeline = new BettingPipeline();
