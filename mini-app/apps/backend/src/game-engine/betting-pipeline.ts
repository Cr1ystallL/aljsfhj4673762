import { PrismaClient, Prisma } from '@prisma/client';
import { balanceService } from '../services/balance-service.js';
import { transactionService } from '../services/transaction-service.js';
import { gameConfig, type GameType } from '../services/game-config.js';
import { rtpEngine } from '../services/rtp-engine.js';
import { logger } from '../utils/logger.js';
import { isAdminTelegramIdAsync } from '../middleware/auth.js';
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

function cycleBounds(t: { startAtGmt1: Date; durationHours: number; repeatType?: string }, now = Date.now()) {
  const offsetMs = 60 * 60 * 1000;
  const firstStartUtc = t.startAtGmt1.getTime() - offsetMs;
  const durationMs = t.durationHours * 3600 * 1000;

  if (t.repeatType === 'once') {
    return { startsAt: firstStartUtc, endsAt: firstStartUtc + durationMs };
  }

  const dayMs = 24 * 3600 * 1000;
  if (now <= firstStartUtc) return { startsAt: firstStartUtc, endsAt: firstStartUtc + durationMs };
  const daysPassed = Math.floor((now - firstStartUtc) / dayMs);
  const currentStart = firstStartUtc + daysPassed * dayMs;
  const currentEnd = currentStart + durationMs;
  if (now <= currentEnd) return { startsAt: currentStart, endsAt: currentEnd };
  const nextStart = currentStart + dayMs;
  return { startsAt: nextStart, endsAt: nextStart + durationMs };
}

async function ensureCycle(t: { id: string; startAtGmt1: Date; durationHours: number; prizePool: Prisma.Decimal; repeatType?: string }) {
  const { startsAt, endsAt } = cycleBounds(t);
  let cycle = await (prisma as any).tournamentCycle.findFirst({
    where: { tournamentId: t.id, startsAt: new Date(startsAt) },
  });
  const now = Date.now();
  if (!cycle) {
    cycle = await (prisma as any).tournamentCycle.findFirst({
      where: { tournamentId: t.id, state: { in: ['live', 'waiting'] } },
      orderBy: { startsAt: 'desc' },
    });
  }

  if (!cycle) {
    cycle = await (prisma as any).tournamentCycle.create({
      data: {
        tournamentId: t.id,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        prizePool: t.prizePool,
        state: now < startsAt ? 'waiting' : (now > endsAt ? 'ended' : 'live'),
      },
    });
  } else {
    const updates: Record<string, any> = {};
    if (Number(cycle.prizePool) !== Number(t.prizePool)) {
      updates.prizePool = t.prizePool;
    }
    const expectedEnd = new Date(cycle.startsAt.getTime() + (t.durationHours * 3600 * 1000));
    if (cycle.endsAt.getTime() !== expectedEnd.getTime()) {
      updates.endsAt = expectedEnd;
    }
    if (cycle.state === 'waiting' && now >= cycle.startsAt.getTime() && now <= expectedEnd.getTime()) {
      updates.state = 'live';
    } else if (cycle.state === 'ended' && now <= expectedEnd.getTime()) {
      updates.state = 'live';
    } else if (cycle.state === 'live' && now > expectedEnd.getTime()) {
      updates.state = 'ended';
    }
    if (Object.keys(updates).length > 0) {
      cycle = await (prisma as any).tournamentCycle.update({
        where: { id: cycle.id },
        data: updates,
      });
    }
  }
  return cycle as { id: string; startsAt: Date; endsAt: Date; prizePool: Prisma.Decimal; state: string };
}

export function getGameTypeFromBet(bet: Bet): GameType | string {
  if (bet.metadata?.gameType) {
    const metaGt = String(bet.metadata.gameType).toLowerCase();
    return metaGt === 'bj' ? 'blackjack' : metaGt;
  }
  const raw = bet.gameId ? bet.gameId.split('_')[0].toLowerCase() : '';
  if (raw === 'bj') return 'blackjack';
  return raw || 'blackjack';
}

async function findTournamentContext(userId: string, gameType: string) {
  const normGameType = gameType === 'bj' ? 'blackjack' : gameType;
  const now = new Date();

  // 1. Direct match: Active participant in a current cycle for this gameType
  try {
    const activeParticipant = await (prisma as any).tournamentParticipant.findFirst({
      where: {
        userId,
        cycle: {
          startsAt: { lte: now },
          endsAt: { gte: now },
          tournament: { active: true, gameType: { in: [normGameType, gameType] } },
        },
      },
      include: { cycle: { include: { tournament: true } } },
    });

    if (activeParticipant) {
      return {
        tournament: activeParticipant.cycle.tournament,
        cycle: activeParticipant.cycle,
        participant: activeParticipant,
      };
    }
  } catch (err) {
    logger.warn({ err, userId, gameType }, 'Error looking up active tournament participant');
  }

  // 2. Fallback: Find active tournament and ensure current cycle
  try {
    const t = await (prisma as any).tournament.findFirst({
      where: { active: true, gameType: { in: [normGameType, gameType] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!t) return null;
    const cycle = await ensureCycle(t);
    if (cycle.state !== 'live') return null;
    const nowTs = Date.now();
    if (nowTs < cycle.startsAt.getTime() || nowTs > cycle.endsAt.getTime()) return null;
    const participant = await (prisma as any).tournamentParticipant.findUnique({
      where: { cycleId_userId: { cycleId: cycle.id, userId } },
    });
    if (!participant) return null;
    return { tournament: t as any, cycle, participant };
  } catch (err) {
    logger.warn({ err, userId, gameType }, 'Error checking tournament cycle fallback');
    return null;
  }
}

export async function isTournamentActive(userId: string, gameType: string): Promise<boolean> {
  const ctx = await findTournamentContext(userId, gameType);
  return ctx !== null;
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

    const gt = getGameTypeFromBet(bet);
    const supported: GameType[] = ['crash', 'mines', 'coinflip', 'wheel', 'blackjack', 'macvpot'];
    if (supported.includes(gt as GameType)) {
      const cfg = await gameConfig.get(gt as GameType);
      if (cfg.paused) {
        throw new Error('Игра временно приостановлена администратором');
      }
      if (amount < cfg.minBet && !bet.metadata?.freeCase) {
        throw new Error(`Минимальная ставка ${cfg.minBet}`);
      }
      if (amount > cfg.maxBet) {
        throw new Error(`Максимальная ставка ${cfg.maxBet}`);
      }
    }

    try {
      const tournamentCtx = await findTournamentContext(bet.userId, gt);

      if (tournamentCtx) {
        bet.isTournament = true;
        bet.metadata = {
          ...(bet.metadata || {}),
          isTournament: true,
          tournamentId: tournamentCtx.tournament.id,
          tournamentCycleId: tournamentCtx.cycle.id,
        };

        await prisma.$transaction(async (tx) => {
          const userRows = await tx.$queryRaw<
            Array<{ is_blocked: boolean; telegram_id: bigint }>
          >`SELECT is_blocked, telegram_id FROM users WHERE id::text = ${bet.userId}::text LIMIT 1`;
          let blocked = userRows[0]?.is_blocked;
          if (blocked && userRows[0]?.telegram_id) {
            if (await isAdminTelegramIdAsync(Number(userRows[0].telegram_id))) {
              blocked = false;
            }
          }
          if (blocked) {
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
              gameType: gt,
              roundId: bet.roundId,
              amount,
              state: bet.state,
              placedAt: new Date(bet.placedAt),
              metadata: bet.metadata,
            },
          });
        });

        logger.info({ betId: bet.id, userId: bet.userId, amount, tournament: tournamentCtx.tournament.id }, 'Tournament bet processed');
        await balanceService.syncBalance(bet.userId);
        return true;
      }

      const newBalance = await prisma.$transaction(async (tx) => {
        // Block flagged accounts before touching the balance row.
        // We use a Prisma raw query so this works even when the client
        // hasn't been regenerated yet on the server (legacy build).
        const userRows = await tx.$queryRaw<
          Array<{ is_blocked: boolean; telegram_id: bigint }>
        >`SELECT is_blocked, telegram_id FROM users WHERE id::text = ${bet.userId}::text LIMIT 1`;
        let blocked = userRows[0]?.is_blocked;
        if (blocked && userRows[0]?.telegram_id) {
          if (await isAdminTelegramIdAsync(Number(userRows[0].telegram_id))) {
            blocked = false;
          }
        }
        if (blocked) {
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
            gameType: gt,
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
            gameType: gt,
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
      await balanceService.syncBalance(bet.userId);

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
   * player can't drain the entire give-budget on one huge hit. Engines
   * that need to display a downgraded multiplier should
   * call `rtpEngine.capPayoutForGive` themselves and pass the capped
   * payout in here. This second call is a defensive belt-and-braces.
   */
  async processPayout(bet: Bet, payout: number, demoMode = false, wagerQualifying = true): Promise<void> {
    const grossCredit = TWO_DP(payout);
    const stake = TWO_DP(bet.amount);

    const meta = (bet.metadata || {}) as Record<string, any>;
    let tournamentCycleId = meta.tournamentCycleId as string | undefined;

    if (!tournamentCycleId) {
      try {
        const dbBet = await prisma.bet.findUnique({
          where: { id: bet.id },
          select: { metadata: true },
        });
        const dbMeta = (dbBet?.metadata || {}) as Record<string, any>;
        if (dbMeta.tournamentCycleId) {
          tournamentCycleId = dbMeta.tournamentCycleId;
          bet.metadata = { ...(bet.metadata || {}), ...dbMeta };
        }
      } catch {}
    }

    // Tournaments use virtual balance and do not affect the casino's P&L
    // or give/earn budget. Skip RTP capping entirely.
    if (tournamentCycleId) {
      const credit = grossCredit; // Full un-capped credit

      try {
        await prisma.$transaction(async (tx) => {
          if (credit > 0) {
            await (tx as any).tournamentParticipant.updateMany({
              where: { cycleId: tournamentCycleId, userId: bet.userId },
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

        logger.info({ betId: bet.id, userId: bet.userId, payout: credit, tournamentCycleId }, 'Tournament payout processed');
        await balanceService.syncBalance(bet.userId);
        return;
      } catch (error) {
        logger.error(error, 'Failed to process tournament payout');
        throw error;
      }
    }

    // Defensive cap for give-mode budget. In off / earn modes this is
    // a pass-through.
    const capped = await rtpEngine.capPayoutForGive(
      bet.userId,
      stake,
      grossCredit
    );
    const credit = TWO_DP(capped);

    try {
      const gt = getGameTypeFromBet(bet);
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
              gameType: gt,
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
            const curRows = await tx.$queryRaw<Array<{ amount: string }>>`SELECT amount FROM balances WHERE user_id = ${bet.userId} AND demo_mode = ${demoMode} LIMIT 1`;
            balanceAfter = curRows[0] ? Number(curRows[0].amount) : 0;
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
        
        const b = await tx.balance.findFirst({
          where: { userId: bet.userId, demoMode },
        });
        
        if (b) {
          balanceAfter = Number(b.amount);
          let { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress } = b;
          let needsUpdate = false;

          if (balanceAfter < 0.10 && !demoMode) {
            wagerTarget = new Prisma.Decimal(0);
            wagerProgress = new Prisma.Decimal(0);
            autoRtpTarget = new Prisma.Decimal(0);
            autoRtpProgress = new Prisma.Decimal(0);
            needsUpdate = true;
          } else if (!demoMode && wagerQualifying) {
            const cfg = gameConfig.getCachedOrDefault(gt as GameType);
            const addedProgress = bet.amount * (cfg.wagerContribution ?? 1.0);
            
            if (Number(wagerProgress) < Number(wagerTarget)) {
              wagerProgress = new Prisma.Decimal(Math.min(Number(wagerProgress) + addedProgress, Number(wagerTarget)));
              needsUpdate = true;
            }
            if (Number(autoRtpProgress) < Number(autoRtpTarget)) {
              autoRtpProgress = new Prisma.Decimal(Math.min(Number(autoRtpProgress) + bet.amount, Number(autoRtpTarget)));
              needsUpdate = true;
            }
          }

          if (needsUpdate && b.id) {
            await tx.balance.update({
              where: { id: b.id },
              data: { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress }
            });
          }
        }

        return balanceAfter;
      });

      await balanceService.syncBalance(bet.userId);

      // Tell the auto-RTP controller about the outcome so it can
      // tighten / loosen the next bias.
      await rtpEngine.recordOutcome(bet.userId, stake, credit);

      // Handle Win Streak and Session Tracking
      await this.handleWinStreakAndSession(
        bet.userId,
        stake,
        credit,
        newBalance,
        demoMode,
        gt
      );

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
  async processLoss(bet: Bet, demoMode = false, wagerQualifying = true): Promise<void> {
    try {
      const meta = (bet.metadata || {}) as Record<string, any>;
      let tournamentCycleId = meta.tournamentCycleId as string | undefined;

      if (!tournamentCycleId) {
        try {
          const dbBet = await prisma.bet.findUnique({
            where: { id: bet.id },
            select: { metadata: true },
          });
          const dbMeta = (dbBet?.metadata || {}) as Record<string, any>;
          if (dbMeta.tournamentCycleId) {
            tournamentCycleId = dbMeta.tournamentCycleId;
            bet.metadata = { ...(bet.metadata || {}), ...dbMeta };
          }
        } catch {}
      }

      if (tournamentCycleId) {
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            state: 'lost',
            payout: 0,
            resolvedAt: new Date(),
          },
        });
        logger.info({ betId: bet.id, userId: bet.userId, tournamentCycleId }, 'Tournament bet lost');
        await balanceService.syncBalance(bet.userId);
        return;
      }

      let finalBalance = 0;
      const gt = getGameTypeFromBet(bet) as GameType;
      await prisma.$transaction(async (tx) => {
        await tx.bet.update({
          where: { id: bet.id },
          data: {
            state: 'lost',
            payout: 0,
            resolvedAt: new Date(),
          },
        });

        const b = await tx.balance.findFirst({
          where: { userId: bet.userId, demoMode },
        });
        
        if (b) {
          let { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress } = b;
          let needsUpdate = false;
          const balanceAfter = Number(b.amount);
          finalBalance = balanceAfter;

          if (balanceAfter < 0.10 && !demoMode) {
            wagerTarget = new Prisma.Decimal(0);
            wagerProgress = new Prisma.Decimal(0);
            autoRtpTarget = new Prisma.Decimal(0);
            autoRtpProgress = new Prisma.Decimal(0);
            needsUpdate = true;
          } else if (!demoMode && wagerQualifying) {
            const cfg = gameConfig.getCachedOrDefault(gt);
            const addedProgress = bet.amount * (cfg.wagerContribution ?? 1.0);
            
            if (Number(wagerProgress) < Number(wagerTarget)) {
              wagerProgress = new Prisma.Decimal(Math.min(Number(wagerProgress) + addedProgress, Number(wagerTarget)));
              needsUpdate = true;
            }
            if (Number(autoRtpProgress) < Number(autoRtpTarget)) {
              autoRtpProgress = new Prisma.Decimal(Math.min(Number(autoRtpProgress) + bet.amount, Number(autoRtpTarget)));
              needsUpdate = true;
            }
          }

          if (needsUpdate && b.id) {
            await tx.balance.update({
              where: { id: b.id },
              data: { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress }
            });
          }
        }
      });

      // Casino kept the full stake — record it for the controller,
      // but only if it's real money.
      if (!meta.demoMode) {
        await balanceService.syncBalance(bet.userId);
        await rtpEngine.recordOutcome(bet.userId, Number(bet.amount), 0);
        
        // Handle Win Streak and Session Tracking
        await this.handleWinStreakAndSession(
          bet.userId,
          Number(bet.amount),
          0,
          finalBalance,
          demoMode,
          gt
        );
      }
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
    demoMode = false,
    wagerQualifying = true
  ): Promise<void> {
    const grossCredit = TWO_DP(cashoutAmount);
    const stake = TWO_DP(bet.amount);

    const meta = (bet.metadata || {}) as Record<string, any>;
    const tournamentCycleId = meta.tournamentCycleId as string | undefined;

    if (tournamentCycleId) {
      const credit = grossCredit; // Full un-capped credit

      try {
        await prisma.$transaction(async (tx) => {
          if (credit > 0) {
            await (tx as any).tournamentParticipant.updateMany({
              where: { cycleId: tournamentCycleId, userId: bet.userId },
              data: {
                balance: { increment: credit },
                reachedAt: new Date(),
              },
            });
          }

          await tx.bet.update({
            where: { id: bet.id },
            data: {
              state: 'cashed_out',
              payout: credit,
              multiplier,
              resolvedAt: new Date(),
            },
          });
        });

        logger.info({ betId: bet.id, userId: bet.userId, payout: credit, tournamentCycleId }, 'Tournament cashout processed');
        await balanceService.syncBalance(bet.userId);
        return;
      } catch (error) {
        logger.error(error, 'Failed to process tournament cashout');
        throw error;
      }
    }

    const capped = await rtpEngine.capPayoutForGive(
      bet.userId,
      stake,
      grossCredit
    );
    const credit = TWO_DP(capped);

    try {
      const newBalance = await prisma.$transaction(async (tx) => {
        let balanceAfter = await this.creditBalance(tx, bet.userId, credit, demoMode);

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
        
        const b = await tx.balance.findFirst({
          where: { userId: bet.userId, demoMode },
        });
        
        if (b) {
          balanceAfter = Number(b.amount);
          let { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress } = b;
          let needsUpdate = false;

          if (balanceAfter < 0.10 && !demoMode) {
            wagerTarget = new Prisma.Decimal(0);
            wagerProgress = new Prisma.Decimal(0);
            autoRtpTarget = new Prisma.Decimal(0);
            autoRtpProgress = new Prisma.Decimal(0);
            needsUpdate = true;
          } else if (!demoMode && wagerQualifying) {
            const gt = bet.gameId.split('_')[0] as GameType;
            const cfg = gameConfig.getCachedOrDefault(gt);
            const addedProgress = toNumber(bet.amount) * (cfg.wagerContribution ?? 1.0);
            
            if (Number(wagerProgress) < Number(wagerTarget)) {
              wagerProgress = new Prisma.Decimal(Math.min(Number(wagerProgress) + addedProgress, Number(wagerTarget)));
              needsUpdate = true;
            }
            if (Number(autoRtpProgress) < Number(autoRtpTarget)) {
              autoRtpProgress = new Prisma.Decimal(Math.min(Number(autoRtpProgress) + toNumber(bet.amount), Number(autoRtpTarget)));
              needsUpdate = true;
            }
          }

          if (needsUpdate && b.id) {
            await tx.balance.update({
              where: { id: b.id },
              data: { wagerTarget, wagerProgress, autoRtpTarget, autoRtpProgress }
            });
          }
        }

        return balanceAfter;
      });

      await balanceService.invalidateCache(bet.userId);
      await balanceService.syncBalance(bet.userId);

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

      await balanceService.syncBalance(bet.userId);

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

  /**
   * Handle Win Streak and Game Session logic
   */
  async handleWinStreakAndSession(
    userId: string,
    stake: number,
    credit: number,
    balanceAfter: number,
    demoMode: boolean,
    gameType: string
  ): Promise<void> {
    if (demoMode) return;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, currentWinStreak: true, winStreakActive: true, username: true }
      });

      if (!user) return;

      const isWin = credit > stake;

      // 1. Session tracking
      let session = await prisma.gameSession.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      const now = new Date();
      if (!session || (now.getTime() - session.lastActivityAt.getTime() > 20 * 60 * 1000)) {
        // Start a new session if none exists or last activity > 20 mins
        // Note: Start balance is the balance before this bet (+ stake since balanceAfter is after deduction)
        session = await prisma.gameSession.create({
          data: {
            userId,
            startBalance: balanceAfter, // Approximated
            lastActivityAt: now,
          }
        });
      } else {
        // Update activity
        session = await prisma.gameSession.update({
          where: { id: session.id },
          data: { lastActivityAt: now }
        });

        // Check if balance exceeded 2x
        if (balanceAfter > Number(session.startBalance) * 2 && Number(session.startBalance) > 0) {
          // They doubled their money! Update startBalance to prevent spam
          const oldStartBalance = Number(session.startBalance);
          session = await prisma.gameSession.update({
            where: { id: session.id },
            data: { startBalance: balanceAfter }
          });
          
          const { getAllAdminTelegramIds } = await import('../middleware/auth.js');
          const { telegramApi } = await import('../lib/telegram-api.js');
          const { redisClient } = await import('../lib/redis.js');
          const redis = redisClient.getClient();
          
          const adminIds = await getAllAdminTelegramIds();
          const alertKey = `sec:alert:${user.id}:${session.id}`;
          const currentCount = await redis.incr(alertKey);
          
          if (currentCount === 1) {
            // First time they doubled
            await redis.expire(alertKey, 24 * 60 * 60); // 24 hours expire
            for (const adminId of adminIds) {
              const msgId = await telegramApi.sendMessageAndGetId(
                adminId,
                `🚨 <b>СЕКЬЮРИТИ: ИГРОК УДВОИЛ БАЛАНС В СЕССИИ</b> 🚨\n\n` +
                `Игрок: <code>${user.id}</code>${user.username ? ` (@${user.username})` : ''}\n` +
                `Старт сессии: <b>${oldStartBalance} PLN</b>\n` +
                `Текущий баланс: <b>${balanceAfter} PLN</b>\n` +
                `Игра: ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`
              );
              if (msgId) {
                await redis.set(`${alertKey}:${adminId}:msgId`, msgId.toString(), 'EX', 24 * 60 * 60);
              }
            }
          } else {
            // Doubled again!
            for (const adminId of adminIds) {
              const msgIdStr = await redis.get(`${alertKey}:${adminId}:msgId`);
              if (msgIdStr) {
                const msgId = parseInt(msgIdStr, 10);
                await telegramApi.editMessageText(
                  adminId,
                  msgId,
                  `🚨 <b>СЕКЬЮРИТИ: ИГРОК УДВОИЛ БАЛАНС В СЕССИИ (x${currentCount})</b> 🚨\n\n` +
                  `Игрок: <code>${user.id}</code>${user.username ? ` (@${user.username})` : ''}\n` +
                  `Старт сессии: <b>${oldStartBalance} PLN</b>\n` +
                  `Текущий баланс: <b>${balanceAfter} PLN</b>\n` +
                  `Последняя игра: ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`
                );
              } else {
                // Fallback if msgId expired or failed to save
                const msgId = await telegramApi.sendMessageAndGetId(
                  adminId,
                  `🚨 <b>СЕКЬЮРИТИ: ИГРОК УДВОИЛ БАЛАНС В СЕССИИ (x${currentCount})</b> 🚨\n\n` +
                  `Игрок: <code>${user.id}</code>${user.username ? ` (@${user.username})` : ''}\n` +
                  `Старт сессии: <b>${oldStartBalance} PLN</b>\n` +
                  `Текущий баланс: <b>${balanceAfter} PLN</b>\n` +
                  `Игра: ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`
                );
                if (msgId) {
                  await redis.set(`${alertKey}:${adminId}:msgId`, msgId.toString(), 'EX', 24 * 60 * 60);
                }
              }
            }
          }

          // Trigger strict RTP by setting the autoRtpTarget on the balance.
          // This ensures rtpEngine.getBiasFor immediately returns 1.0.
          const b = await prisma.balance.findFirst({ where: { userId, demoMode: false } });
          if (b) {
            await prisma.balance.update({
              where: { id: b.id },
              data: {
                autoRtpTarget: balanceAfter * 2,
                autoRtpProgress: 0,
              }
            });
          }
        }
      }

      // 2. Win Streak Tracking
      let nextStreak = isWin ? user.currentWinStreak + 1 : 0;
      let streakActive = isWin ? user.winStreakActive : false;

      if (isWin) {
        if (nextStreak === 3 && !streakActive) {
          // Trigger Auto-RTP on 3rd win by updating balance.autoRtpTarget
          let nextTarget = balanceAfter * 1.5;

          const b = await prisma.balance.findFirst({ where: { userId, demoMode: false } });
          if (b) {
            if (Number(b.autoRtpTarget) > Number(b.autoRtpProgress)) {
              // Already active? Increase it heavily
              nextTarget = Number(b.autoRtpTarget) * 2.5;
            }
            await prisma.balance.update({
              where: { id: b.id },
              data: {
                autoRtpTarget: nextTarget,
                autoRtpProgress: 0,
              }
            });
          }

          streakActive = true;
        }

        if (nextStreak >= 5 && nextStreak % 5 === 0) {
          // Send Telegram notification to admins
          const { getAllAdminTelegramIds } = await import('../middleware/auth.js');
          const { telegramApi } = await import('../lib/telegram-api.js');
          
          const adminIds = await getAllAdminTelegramIds();
          for (const adminId of adminIds) {
            await telegramApi.sendMessage(
              adminId,
              `🔥 <b>ИГРОК ПРОДОЛЖАЕТ ВИН СТРИК!</b> 🔥\n\n` +
              `Игрок: <code>${user.id}</code>${user.username ? ` (@${user.username})` : ''}\n` +
              `Побед подряд: <b>${nextStreak}</b>\n` +
              `Выигрыш в этом раунде: <b>${credit} PLN</b>\n` +
              `Игра: ${gameType}\n` +
              `Текущий баланс: <b>${balanceAfter} PLN</b>\n`
            );
          }
        }
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          currentWinStreak: nextStreak,
          winStreakActive: streakActive
        }
      });

    } catch (err) {
      logger.error(err, 'Failed to handle win streak and session logic');
    }
  }
}

export const bettingPipeline = new BettingPipeline();
