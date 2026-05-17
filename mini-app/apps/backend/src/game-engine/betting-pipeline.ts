import { PrismaClient, Prisma } from '@prisma/client';
import { balanceService } from '../services/balance-service.js';
import { transactionService } from '../services/transaction-service.js';
import { gameConfig, type GameType } from '../services/game-config.js';
import { rtpEngine } from '../services/rtp-engine.js';
import { logger } from '../utils/logger.js';
import type { Bet, BetState } from './types.js';

/**
 * Unified Betting Pipeline
 * Handles bet processing, balance deduction, and payout distribution
 *
 * CRITICAL: Server-authoritative, transactional, rollback-safe.
 *
 * REAL MODE:
 *   - All balance changes go through atomic SQL on the shared `balances` table
 *     (same table the Python bot writes to via DatabasePostgres adapter).
 *   - The deduct query uses `WHERE amount >= $bet` so concurrent calls cannot
 *     overdraw the balance.
 *   - Bet record is created in the same Prisma transaction as the balance
 *     update, so we never have ghost bets without a debit.
 *
 * DEMO MODE:
 *   - Operates on the same `balances` row but with `demo_mode = true`.
 *   - Same atomic semantics as real mode.
 */

const prisma = new PrismaClient();

const TWO_DP = (n: number) => Math.round(n * 100) / 100;

export class BettingPipeline {
  /**
   * Atomically deduct funds from the user's balance.
   * Returns the new balance, or null if there were insufficient funds.
   */
  private async debitBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    demoMode: boolean
  ): Promise<number | null> {
    // Conditional UPDATE - only succeeds if amount is sufficient.
    // RETURNING gives us the new balance in one round-trip.
    const rows = await tx.$queryRaw<Array<{ amount: string | number }>>(
      Prisma.sql`
        UPDATE balances
        SET amount = amount - ${amount}::numeric,
            updated_at = NOW(),
            last_synced_at = NOW(),
            version = version + 1
        WHERE user_id = ${userId}
          AND demo_mode = ${demoMode}
          AND amount >= ${amount}::numeric
        RETURNING amount
      `
    );

    if (rows.length === 0) return null;
    return Number(rows[0].amount);
  }

  /**
   * Atomically credit funds to the user's balance.
   * Creates the row if it doesn't exist (defensive, shouldn't happen for
   * users that already placed a bet, but safe to be robust).
   */
  private async creditBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    demoMode: boolean
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ amount: string | number }>>(
      Prisma.sql`
        UPDATE balances
        SET amount = amount + ${amount}::numeric,
            updated_at = NOW(),
            last_synced_at = NOW(),
            version = version + 1
        WHERE user_id = ${userId}
          AND demo_mode = ${demoMode}
        RETURNING amount
      `
    );

    if (rows.length === 0) {
      // Row missing - create it. Shouldn't happen in normal flow.
      const created = await tx.balance.create({
        data: {
          userId,
          amount,
          currency: 'PLN',
          demoMode,
        },
      });
      return Number(created.amount);
    }

    return Number(rows[0].amount);
  }

  /**
   * Process bet placement.
   * Atomically: debits balance, creates bet record, records bet transaction.
   * Throws 'Insufficient balance' if funds are not enough.
   */
  async processBet(bet: Bet, demoMode: boolean = false): Promise<void> {
    const amount = TWO_DP(bet.amount);

    // Honour admin-controlled limits and pause flag. The engine knows
    // its game-type from `bet.gameId` (e.g. "crash_main_..." → "crash").
    const gt = bet.gameId.split('_')[0];
    const supported: GameType[] = ['crash', 'mines', 'plinko', 'coinflip'];
    if (supported.includes(gt as GameType)) {
      const cfg = await gameConfig.get(gt as GameType);
      if (cfg.paused) {
        throw new Error('Игра временно приостановлена администратором');
      }
      if (amount < cfg.minBet) {
        throw new Error(`Минимальная ставка ${cfg.minBet}`);
      }
      if (amount > cfg.maxBet) {
        throw new Error(`Максимальная ставка ${cfg.maxBet}`);
      }
    }

    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        // Block flagged accounts before touching the balance row.
        // We use a Prisma raw query so this works even when the client
        // hasn't been regenerated yet on the server (legacy build).
        const userRows = await tx.$queryRaw<
          Array<{ is_blocked: boolean }>
        >`SELECT is_blocked FROM users WHERE id = ${bet.userId} LIMIT 1`;
        if (userRows[0]?.is_blocked) {
          throw new Error('Аккаунт заблокирован администратором');
        }

        const updated = await this.debitBalance(tx, bet.userId, amount, demoMode);
        if (updated === null) {
          throw new Error('Insufficient balance');
        }

        await tx.bet.create({
          data: {
            id: bet.id,
            userId: bet.userId,
            gameType: bet.gameId.split('_')[0],
            roundId: bet.roundId,
            amount,
            state: bet.state,
            placedAt: new Date(bet.placedAt),
            metadata: bet.metadata || {},
          },
        });

        await tx.transaction.create({
          data: {
            userId: bet.userId,
            type: 'bet',
            amount: -amount,
            balanceBefore: updated + amount,
            balanceAfter: updated,
            gameType: bet.gameId.split('_')[0],
            gameRoundId: bet.roundId || null,
            metadata: {
              betId: bet.id,
              gameId: bet.gameId,
              roundId: bet.roundId,
              demoMode,
            },
          },
        });

        return updated;
      });

      // Push fresh balance out to clients
      await balanceService.invalidateCache(bet.userId);
      await balanceService.notifyBalance(bet.userId, newBalance, demoMode);

      logger.info(
        { betId: bet.id, userId: bet.userId, amount, newBalance, demoMode },
        'Bet processed'
      );
    } catch (error) {
      logger.error(error, 'Failed to process bet');
      throw error;
    }
  }

  /**
   * Resolve the configured house edge for a bet's game type.
   * Returns 0 when the game type is outside the supported set.
   */
  private async edgeFor(gameId: string): Promise<number> {
    const gt = gameId.split('_')[0];
    const supported: GameType[] = ['crash', 'mines', 'plinko', 'coinflip'];
    if (!supported.includes(gt as GameType)) return 0;
    const cfg = await gameConfig.get(gt as GameType);
    const edge = Number(cfg.houseEdge);
    if (!Number.isFinite(edge)) return 0;
    return Math.max(0, Math.min(0.5, edge));
  }

  /**
   * Process bet payout.
   * Credits payout (if any), updates bet record. Atomic.
   * NOTE: payout is the GROSS amount returned to the player (e.g. bet 1$ at
   * multiplier 2x => payout 2$). Multiplier < 1 still credits a partial
   * payout (e.g. 0.5x => 0.5$) since plinko uses gross multipliers per bucket.
   *
   * The configured house edge is applied centrally here. Engines compute
   * their natural payout and the pipeline scales it down by `(1 - edge)`,
   * with the player's stake protected — we never haircut the original
   * bet, only winnings above it. So a 1$ bet at 2x with a 5% edge pays
   * out 1.95$ (1$ stake returned + 0.95$ profit), not 1.90$.
   */
  async processPayout(bet: Bet, payout: number, demoMode: boolean = false): Promise<void> {
    const grossCredit = TWO_DP(payout);
    const stake = TWO_DP(bet.amount);
    const baseEdge = await this.edgeFor(bet.gameId);
    const bias = await rtpEngine.getEdgeBias(bet.userId);
    const edge = Math.max(0, Math.min(0.95, baseEdge + bias));

    // Apply edge only to the profit portion (gross credit > stake).
    let credit = grossCredit;
    if (edge > 0 && grossCredit > stake) {
      const profit = grossCredit - stake;
      credit = TWO_DP(stake + profit * (1 - edge));
    }

    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        let balanceAfter = 0;

        if (credit > 0) {
          balanceAfter = await this.creditBalance(tx, bet.userId, credit, demoMode);

          await tx.transaction.create({
            data: {
              userId: bet.userId,
              type: 'win',
              amount: credit,
              balanceBefore: balanceAfter - credit,
              balanceAfter,
              gameType: bet.gameId.split('_')[0],
              gameRoundId: bet.roundId || null,
              metadata: {
                betId: bet.id,
                gameId: bet.gameId,
                roundId: bet.roundId,
                multiplier: bet.multiplier,
                gross: grossCredit,
                edgeApplied: edge,
                demoMode,
              },
            },
          });
        } else {
          // No payout - read current balance for return value
          const b = await tx.balance.findFirst({
            where: { userId: bet.userId, demoMode },
            select: { amount: true },
          });
          balanceAfter = b ? Number(b.amount) : 0;
        }

        await tx.bet.update({
          where: { id: bet.id },
          data: {
            state: credit > 0 ? 'won' : 'lost',
            payout: credit,
            multiplier: bet.multiplier,
            resolvedAt: new Date(),
          },
        });

        return balanceAfter;
      });

      await balanceService.invalidateCache(bet.userId);
      await balanceService.notifyBalance(bet.userId, newBalance, demoMode);

      // Tell the auto-RTP controller about the outcome so it can
      // tighten / loosen the next bias.
      await rtpEngine.recordOutcome(bet.userId, stake, credit);

      logger.info(
        {
          betId: bet.id,
          userId: bet.userId,
          payout: credit,
          gross: grossCredit,
          edge,
          multiplier: bet.multiplier,
          newBalance,
          demoMode,
        },
        'Payout processed'
      );
    } catch (error) {
      logger.error(error, 'Failed to process payout');
      throw error;
    }
  }

  /**
   * Process bet loss (no payout).
   * Sets state to 'lost' and timestamps it.
   */
  async processLoss(bet: Bet): Promise<void> {
    try {
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          state: 'lost',
          payout: 0,
          resolvedAt: new Date(),
        },
      });
      // Casino kept the full stake — record it for the controller.
      await rtpEngine.recordOutcome(bet.userId, Number(bet.amount), 0);
      logger.info({ betId: bet.id, userId: bet.userId }, 'Bet lost');
    } catch (error) {
      logger.error(error, 'Failed to process loss');
      throw error;
    }
  }

  /**
   * Process cashout - partial winnings credited, bet closed.
   *
   * Same edge rule as `processPayout`: the user's stake is always
   * returned untouched, but the profit portion is scaled by `(1 - edge)`
   * before crediting. Engines pass in their natural cashout amount —
   * the pipeline owns the casino margin.
   */
  async processCashout(
    bet: Bet,
    cashoutAmount: number,
    multiplier: number,
    demoMode: boolean = false
  ): Promise<void> {
    const grossCredit = TWO_DP(cashoutAmount);
    const stake = TWO_DP(bet.amount);
    const baseEdge = await this.edgeFor(bet.gameId);
    const bias = await rtpEngine.getEdgeBias(bet.userId);
    const edge = Math.max(0, Math.min(0.95, baseEdge + bias));

    let credit = grossCredit;
    if (edge > 0 && grossCredit > stake) {
      const profit = grossCredit - stake;
      credit = TWO_DP(stake + profit * (1 - edge));
    }

    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        const balanceAfter = await this.creditBalance(tx, bet.userId, credit, demoMode);

        await tx.transaction.create({
          data: {
            userId: bet.userId,
            type: 'cashout',
            amount: credit,
            balanceBefore: balanceAfter - credit,
            balanceAfter,
            gameType: bet.gameId.split('_')[0],
            gameRoundId: bet.roundId || null,
            metadata: {
              betId: bet.id,
              gameId: bet.gameId,
              roundId: bet.roundId,
              multiplier,
              gross: grossCredit,
              edgeApplied: edge,
              demoMode,
            },
          },
        });

        await tx.bet.update({
          where: { id: bet.id },
          data: {
            state: 'cashed_out',
            payout: credit,
            multiplier,
            resolvedAt: new Date(),
          },
        });

        return balanceAfter;
      });

      await balanceService.invalidateCache(bet.userId);
      await balanceService.notifyBalance(bet.userId, newBalance, demoMode);

      await rtpEngine.recordOutcome(bet.userId, stake, credit);

      logger.info(
        {
          betId: bet.id,
          userId: bet.userId,
          cashoutAmount: credit,
          gross: grossCredit,
          edge,
          multiplier,
          newBalance,
        },
        'Cashout processed'
      );
    } catch (error) {
      logger.error(error, 'Failed to process cashout');
      throw error;
    }
  }

  /**
   * Rollback bet - refunds bet amount.
   * Used when an error occurs after the bet was debited but before resolution.
   */
  async rollbackBet(bet: Bet, demoMode: boolean = false): Promise<void> {
    const refund = TWO_DP(bet.amount);

    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        const balanceAfter = await this.creditBalance(tx, bet.userId, refund, demoMode);

        await tx.transaction.create({
          data: {
            userId: bet.userId,
            type: 'refund',
            amount: refund,
            balanceBefore: balanceAfter - refund,
            balanceAfter,
            gameType: bet.gameId.split('_')[0],
            gameRoundId: bet.roundId || null,
            metadata: {
              betId: bet.id,
              gameId: bet.gameId,
              roundId: bet.roundId,
              reason: 'rollback',
              demoMode,
            },
          },
        });

        await tx.bet.update({
          where: { id: bet.id },
          data: {
            state: 'cancelled',
            resolvedAt: new Date(),
          },
        });

        return balanceAfter;
      });

      await balanceService.invalidateCache(bet.userId);
      await balanceService.notifyBalance(bet.userId, newBalance, demoMode);

      logger.info(
        { betId: bet.id, userId: bet.userId, amount: refund, newBalance },
        'Bet rolled back'
      );
    } catch (error) {
      logger.error(error, 'Failed to rollback bet');
      throw error;
    }
  }

  /**
   * Get bet by ID.
   */
  async getBet(betId: string): Promise<Bet | null> {
    try {
      const bet = await prisma.bet.findUnique({
        where: { id: betId },
      });

      if (!bet) return null;

      return {
        id: bet.id,
        userId: bet.userId,
        gameId: bet.gameType,
        roundId: bet.roundId,
        amount: Number(bet.amount),
        state: bet.state as BetState,
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
   * Get user's active bets.
   */
  async getActiveBets(userId: string): Promise<Bet[]> {
    try {
      const bets = await prisma.bet.findMany({
        where: {
          userId,
          state: { in: ['pending', 'active'] },
        },
        orderBy: { placedAt: 'desc' },
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
