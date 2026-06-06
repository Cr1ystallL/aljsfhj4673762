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
const toNumber = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);

/* -------------------------------------------------------------------------- */
/* Tournament helpers (daily 10h cycles, shared with routes)                   */
/* -------------------------------------------------------------------------- */

const PERCENT_PAYOUTS = [20, 16, 13, 11, 9, 8, 7, 6, 5, 5];

function cycleBounds(t: { startAtGmt1: Date; durationHours: number }, now = Date.now()) {
  const offsetMs = 60 * 60 * 1000;
  const firstStartUtc = t.startAtGmt1.getTime() - offsetMs;
  const dayMs = 24 * 3600 * 1000;
  const durationMs = t.durationHours * 3600 * 1000;
  if (now <= firstStartUtc) return { startsAt: firstStartUtc, endsAt: firstStartUtc + durationMs };
  const daysPassed = Math.floor((now - firstStartUtc) / dayMs);
  const currentStart = firstStartUtc + daysPassed * dayMs;
  const currentEnd = currentStart + durationMs;
  if (now <= currentEnd) return { startsAt: currentStart, endsAt: currentEnd };
  const nextStart = currentStart + dayMs;
  return { startsAt: nextStart, endsAt: nextStart + durationMs };
}

async function ensureCycle(t: { id: string; startAtGmt1: Date; durationHours: number; prizePool: Prisma.Decimal }) {
  const { startsAt, endsAt } = cycleBounds(t);
  let cycle = await (prisma as any).tournamentCycle.findFirst({
    where: { tournamentId: t.id, startsAt: new Date(startsAt) },
  });
  if (!cycle) {
    cycle = await (prisma as any).tournamentCycle.create({
      data: {
        tournamentId: t.id,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        prizePool: t.prizePool,
        state: 'live',
      },
    });
  }
  return cycle as { id: string; startsAt: Date; endsAt: Date; prizePool: Prisma.Decimal };
}

async function findTournamentContext(userId: string, gameType: string) {
  const t = await (prisma as any).tournament.findFirst({ where: { active: true, gameType }, orderBy: { createdAt: 'desc' } });
  if (!t) return null;
  const cycle = await ensureCycle(t);
  const now = Date.now();
  if (now < cycle.startsAt.getTime() || now > cycle.endsAt.getTime()) return null;
  const participant = await (prisma as any).tournamentParticipant.findUnique({
    where: { cycleId_userId: { cycleId: cycle.id, userId } },
  });
  if (!participant) return null;
  return { tournament: t as any, cycle, participant };
}

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
        WHERE user_id::text = ${userId}::text
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
        WHERE user_id::text = ${userId}::text
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
  async processBet(bet: Bet, demoMode: boolean = false): Promise<boolean> {
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
      const tournamentCtx = await findTournamentContext(bet.userId, gt);

      if (tournamentCtx) {
        await prisma.$transaction(async (tx) => {
          const userRows = await tx.$queryRaw<
            Array<{ is_blocked: boolean }>
          >`SELECT is_blocked FROM users WHERE id::text = ${bet.userId}::text LIMIT 1`;
          if (userRows[0]?.is_blocked) {
            throw new Error('Аккаунт заблокирован администратором');
          }

          const updatedRows = await tx.$queryRaw<Array<{ balance: string | number }>>`
            UPDATE tournament_participants
            SET balance = balance - ${amount}::numeric,
                reached_at = NOW()
            WHERE id::text = ${tournamentCtx.participant.id}::text
              AND balance >= ${amount}::numeric
            RETURNING balance
          `;
          if (updatedRows.length === 0) {
            throw new Error('Недостаточно турнирного баланса');
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
              metadata: {
                ...(bet.metadata || {}),
                tournamentId: tournamentCtx.tournament.id,
                tournamentCycleId: tournamentCtx.cycle.id,
              },
            },
          });
        });

        logger.info({ betId: bet.id, userId: bet.userId, amount, tournament: tournamentCtx.tournament.id }, 'Tournament bet processed');
        return true;
      }

      const newBalance = await prisma.$transaction(async (tx) => {
        // Block flagged accounts before touching the balance row.
        // We use a Prisma raw query so this works even when the client
        // hasn't been regenerated yet on the server (legacy build).
        const userRows = await tx.$queryRaw<
          Array<{ is_blocked: boolean }>
        >`SELECT is_blocked FROM users WHERE id::text = ${bet.userId}::text LIMIT 1`;
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
      return false;
    } catch (error) {
      logger.error(error, 'Failed to process bet');
      throw error;
    }
  }

  /**
   * Process bet payout.
   * Credits the player. The pipeline NO LONGER trims winnings —
   * outcomes are biased pre-fact in the engines; the gross payout that
   * arrives here is what the player gets.
   *
   * The only adjustment applied here is the `give`-mode payout cap: in
   * give mode the controller may shrink a single huge win so that one
   * player can't drain the entire give-budget on one ×1000 hit. Engines
   * that need to display a downgraded multiplier (e.g. plinko) should
   * call `rtpEngine.capPayoutForGive` themselves and pass the capped
   * payout in here. This second call is a defensive belt-and-braces.
   */
  async processPayout(bet: Bet, payout: number, demoMode: boolean = false): Promise<void> {
    const grossCredit = TWO_DP(payout);
    const stake = TWO_DP(bet.amount);

    // Defensive cap for give-mode budget. In off / earn modes this is
    // a pass-through.
    const capped = await rtpEngine.capPayoutForGive(
      bet.userId,
      stake,
      grossCredit
    );
    const credit = TWO_DP(capped);

    try {
      const meta = (bet.metadata || {}) as Record<string, any>;
      const tournamentCycleId = meta.tournamentCycleId as string | undefined;

      if (tournamentCycleId) {
        await prisma.$transaction(async (tx) => {
          const participant = await (tx as any).tournamentParticipant.findUnique({
            where: { cycleId_userId: { cycleId: tournamentCycleId, userId: bet.userId } },
          });
          if (!participant) return;

          if (credit > 0) {
            await (tx as any).tournamentParticipant.update({
              where: { id: participant.id },
              data: {
                balance: { increment: credit },
                reachedAt: new Date(),
              },
            });
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
        });

        // RTP controller still needs the outcome for earning/giving decisions.
        await rtpEngine.recordOutcome(bet.userId, stake, credit);

        logger.info({ betId: bet.id, userId: bet.userId, payout: credit, tournamentCycleId }, 'Tournament payout processed');
        return;
      }

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
                givecap: credit !== grossCredit,
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
  /**
   * Process cashout — partial winnings credited, bet closed.
   *
   * Same rules as `processPayout`: bias is pre-fact, payouts are not
   * trimmed; the only cap is the give-mode budget defence.
   */
  async processCashout(
    bet: Bet,
    cashoutAmount: number,
    multiplier: number,
    demoMode: boolean = false
  ): Promise<void> {
    const grossCredit = TWO_DP(cashoutAmount);
    const stake = TWO_DP(bet.amount);

    const capped = await rtpEngine.capPayoutForGive(
      bet.userId,
      stake,
      grossCredit
    );
    const credit = TWO_DP(capped);

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
              givecap: credit !== grossCredit,
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
