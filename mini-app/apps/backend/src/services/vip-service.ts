import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';
import {
  VIP_RANKS,
  VIP_XP_PER_ZL,
  getVipTierByXp,
  calculateVipProgress,
  type VipStatusDto,
  type CashbackStatusDto,
  type VipTierConfig,
} from '@casino/shared';

// System launch date epoch: all past historical stats before this moment are strictly ignored (fresh start)
// Official fresh start launch: 02.09.2026 19:00:00 MSK (UTC+3) -> 2026-09-02T16:00:00.000Z
export const VIP_FRESH_START_EPOCH = new Date('2026-09-02T16:00:00.000Z');

export class VipService {
  private tablesEnsured = false;

  constructor() {
    void this.ensureTables();
  }

  async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    try {
      await prisma.$executeRaw`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
      `;
      await prisma.$executeRaw`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_level INT DEFAULT 0;
      `;
      await prisma.$executeRaw`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_vip_rewards INT[] DEFAULT '{}';
      `;
      await prisma.$executeRaw`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_cashback_claimed_at TIMESTAMP WITH TIME ZONE;
      `;
      this.tablesEnsured = true;

      // Auto-run fresh start wipe of all past XP and cashback claims
      try {
        const redis = (await import('../lib/redis.js')).redisClient.getClient();
        if (redis) {
          const done = await redis.get('vip:fresh_start_clean_v10');
          if (!done) {
            await this.recalculateAllUsersVipAndResetCashback();
            await redis.set('vip:fresh_start_clean_v10', '1');
          }
        }
      } catch (e) {
        logger.warn({ e }, 'VIP fresh start auto reset in Redis');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to ensure VIP columns in users table');
    }
  }

  /**
   * Recalculates VIP XP and ranks strictly from VIP_FRESH_START_EPOCH (02.09.2026 19:00 MSK).
   * Filters claimed_vip_rewards so no user retains claims for ranks higher than their legitimate vip_level.
   */
  async recalculateAllUsersVipAndResetCashback(): Promise<{ updatedUsers: number }> {
    await this.ensureTables();
    try {
      logger.info('Performing fresh start reset for VIP XP, ranks, and cashback...');

      // 1. Reset all users to 0 XP, Rank 0, null cashback claim
      const res = await prisma.$executeRaw`
        UPDATE users 
        SET xp = 0,
            vip_level = 0,
            last_cashback_claimed_at = NULL;
      `;

      // 2. Fetch only new bets placed on or after the fresh start epoch (02.09.2026 19:00 MSK)
      const betTotals = await prisma.$queryRaw<Array<{ user_id: string; total_wager: number | string }>>`
        SELECT user_id, COALESCE(SUM(amount), 0) as total_wager
        FROM bets
        WHERE state != 'cancelled' 
          AND (metadata->>'demoMode')::boolean IS NOT TRUE 
          AND (metadata->>'isTournament')::boolean IS NOT TRUE
          AND metadata->>'tournamentId' IS NULL
          AND metadata->>'freebetId' IS NULL
          AND placed_at >= ${VIP_FRESH_START_EPOCH}
        GROUP BY user_id
      `;

      if (betTotals.length > 0) {
        for (const row of betTotals) {
          const wager = Number(row.total_wager || 0);
          const xp = Math.floor(wager * VIP_XP_PER_ZL);
          const tier = getVipTierByXp(xp);
          await prisma.$executeRaw`
            UPDATE users
            SET xp = ${xp},
                vip_level = ${tier.level}
            WHERE id = ${row.user_id}
          `;
        }
      }

      // 3. Clean up claimed_vip_rewards so nobody keeps claims for ranks higher than their legitimate vip_level
      await prisma.$executeRaw`
        UPDATE users
        SET claimed_vip_rewards = ARRAY(
          SELECT x FROM unnest(claimed_vip_rewards) x WHERE x <= vip_level
        )
        WHERE array_length(claimed_vip_rewards, 1) > 0;
      `;

      logger.info({ affectedUsers: Number(res || 0), updatedWithBets: betTotals.length }, 'Fresh start VIP reset and recalculation completed');
      return { updatedUsers: betTotals.length };
    } catch (err) {
      logger.error({ err }, 'Failed to recalculate VIP XP and reset cashback');
      throw err;
    }
  }

  /**
   * Adds XP when a real-money bet is placed.
   */
  async addXp(userId: string, betAmountZl: number, txClient?: PrismaClient | Prisma.TransactionClient): Promise<void> {
    if (betAmountZl <= 0) return;
    await this.ensureTables();
    const db = txClient || prisma;
    const gainedXp = Math.max(1, Math.floor(betAmountZl * VIP_XP_PER_ZL));

    try {
      const rows = await db.$queryRaw<Array<{ xp: number; vip_level: number }>>`
        UPDATE users
        SET xp = COALESCE(xp, 0) + ${gainedXp}
        WHERE id = ${userId}
        RETURNING xp, vip_level
      `;

      if (rows && rows.length > 0) {
        const currentXp = Number(rows[0].xp || 0);
        const currentLevel = Number(rows[0].vip_level || 0);
        const newTier = getVipTierByXp(currentXp);

        if (newTier.level > currentLevel) {
          await db.$executeRaw`
            UPDATE users
            SET vip_level = ${newTier.level}
            WHERE id = ${userId}
          `;
          logger.info({ userId, oldLevel: currentLevel, newLevel: newTier.level, newTier: newTier.name }, 'User VIP level upgraded');
        }
      }
    } catch (err) {
      logger.error({ err, userId, betAmountZl }, 'Failed to add XP to user');
    }
  }

  /**
   * Retrieves full VIP status for a player.
   */
  async getVipStatus(userId: string): Promise<VipStatusDto> {
    await this.ensureTables();
    try {
      const rows = await prisma.$queryRaw<
        Array<{ xp: number | null; vip_level: number | null; claimed_vip_rewards: number[] | null }>
      >`
        SELECT xp, vip_level, claimed_vip_rewards
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;

      const xp = Number(rows[0]?.xp || 0);
      const claimed = (rows[0]?.claimed_vip_rewards || []).map((n) => Number(n));
      const progress = calculateVipProgress(xp);

      const unclaimedLevels: number[] = [];
      for (let lvl = 1; lvl <= progress.currentTier.level; lvl++) {
        if (!claimed.includes(lvl)) {
          unclaimedLevels.push(lvl);
        }
      }

      return {
        xp,
        level: progress.currentTier.level,
        currentTier: progress.currentTier,
        nextTier: progress.nextTier,
        progressPercent: progress.progressPercent,
        xpNeededForNext: progress.xpNeededForNext,
        claimedLevels: claimed,
        unclaimedLevels,
      };
    } catch (err) {
      logger.error({ err, userId }, 'Failed to fetch VIP status');
      const defTier = VIP_RANKS[0];
      return {
        xp: 0,
        level: 0,
        currentTier: defTier,
        nextTier: VIP_RANKS[1],
        progressPercent: 0,
        xpNeededForNext: 500,
        claimedLevels: [],
        unclaimedLevels: [],
      };
    }
  }

  /**
   * Claims reward for reaching a VIP level.
   */
  async claimVipReward(userId: string, targetLevel: number): Promise<{ success: boolean; message: string; tier: VipTierConfig }> {
    await this.ensureTables();
    const tier = VIP_RANKS.find((r) => r.level === targetLevel);
    if (!tier || targetLevel <= 0) {
      throw new Error('Некорректный уровень ранга');
    }

    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ xp: number | null; vip_level: number | null; claimed_vip_rewards: number[] | null; telegram_id: bigint }>
      >`
        SELECT xp, vip_level, claimed_vip_rewards, telegram_id
        FROM users
        WHERE id = ${userId}
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new Error('Пользователь не найден');
      }

      const userRow = rows[0];
      const xp = Number(userRow.xp || 0);
      const claimed = (userRow.claimed_vip_rewards || []).map((n) => Number(n));

      if (xp < tier.minXp) {
        throw new Error(`Для получения ранга "${tier.nameRu}" необходимо ${tier.minXp} XP (у вас ${xp} XP)`);
      }

      if (claimed.includes(targetLevel)) {
        throw new Error('Награда за этот ранг уже была получена');
      }

      // Grant rewards based on level
      if (tier.rewardType === 'free_case') {
        // Grant 1 free starter case
        const balRows = await tx.$queryRaw<Array<{ free_cases: number; free_cases_json: any }>>`
          SELECT free_cases, free_cases_json FROM balances WHERE user_id = ${userId} FOR UPDATE
        `;
        const currentFree = Number(balRows[0]?.free_cases || 0);
        const json = (balRows[0]?.free_cases_json as Record<string, { count: number; wager: number }>) || {};
        const starter = json.starter || { count: 0, wager: 0 };
        starter.count = (starter.count || 0) + 1;
        json.starter = starter;

        await tx.$executeRaw`
          UPDATE balances
          SET free_cases = ${currentFree + 1},
              free_cases_json = ${JSON.stringify(json)}::jsonb,
              updated_at = NOW()
          WHERE user_id = ${userId}
        `;
      } else if (tier.rewardType === 'balance') {
        const bonusAmount = tier.rewardBalance || 0;
        if (bonusAmount > 0) {
          const curRows = await tx.$queryRaw<Array<{ amount: string }>>`
            SELECT amount FROM balances WHERE user_id = ${userId} AND demo_mode = false FOR UPDATE
          `;
          const currentBal = curRows[0] ? Number(curRows[0].amount) : 0;
          await tx.$executeRaw`
            UPDATE balances
            SET amount = amount + ${bonusAmount}::numeric,
                updated_at = NOW()
            WHERE user_id = ${userId} AND demo_mode = false
          `;
          await tx.transaction.create({
            data: {
              userId,
              type: 'bonus',
              amount: bonusAmount,
              balanceBefore: currentBal,
              balanceAfter: currentBal + bonusAmount,
              metadata: {
                reason: `VIP Rank Reward (${tier.nameRu})`,
                level: tier.level,
              },
            },
          });
        }
      } else if (tier.rewardType === 'balance_and_case') {
        const bonusAmount = tier.rewardBalance || 0;
        const curRows = await tx.$queryRaw<Array<{ amount: string; free_cases: number; free_cases_json: any }>>`
          SELECT amount, free_cases, free_cases_json FROM balances WHERE user_id = ${userId} AND demo_mode = false FOR UPDATE
        `;
        const currentBal = curRows[0] ? Number(curRows[0].amount) : 0;
        const currentFree = Number(curRows[0]?.free_cases || 0);
        const json = (curRows[0]?.free_cases_json as Record<string, { count: number; wager: number }>) || {};
        const starter = json.starter || { count: 0, wager: 0 };
        starter.count = (starter.count || 0) + 1;
        json.starter = starter;

        await tx.$executeRaw`
          UPDATE balances
          SET amount = amount + ${bonusAmount}::numeric,
              free_cases = ${currentFree + 1},
              free_cases_json = ${JSON.stringify(json)}::jsonb,
              updated_at = NOW()
          WHERE user_id = ${userId} AND demo_mode = false
        `;
        await tx.transaction.create({
          data: {
            userId,
            type: 'bonus',
            amount: bonusAmount,
            balanceBefore: currentBal,
            balanceAfter: currentBal + bonusAmount,
            metadata: {
              reason: `VIP Rank Reward (${tier.nameRu})`,
              level: tier.level,
            },
          },
        });
      } else if (tier.rewardType === 'freebet') {
        const fbAmount = tier.rewardFreebetAmount || 50;
        const exp = new Date(Date.now() + 14 * 24 * 3600 * 1000);
        await tx.$executeRaw`
          INSERT INTO user_freebets (id, user_id, amount, min_odds, max_odds, min_legs, payout_type, status, expires_at, created_at)
          VALUES (
            ${'fb_vip_' + targetLevel + '_' + userId.slice(0, 8)},
            ${userId},
            ${fbAmount}::numeric,
            1.50,
            35.00,
            1,
            'net_win',
            'available',
            ${exp},
            NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }

      // Add to claimed array
      const nextClaimed = [...claimed, targetLevel];
      await tx.$executeRaw`
        UPDATE users
        SET claimed_vip_rewards = ${nextClaimed}
        WHERE id = ${userId}
      `;

      logger.info({ userId, level: targetLevel, tier: tier.name }, 'VIP Reward claimed successfully');

      // Send telegram notification
      if (userRow.telegram_id) {
        const msg = `👑 <b>Поздравляем с новым VIP Рангом!</b>\n\nВы достигли ранга <b>${tier.nameRu}</b> (Уровень ${tier.level})!\n🎁 Награда: <b>${tier.rewardDescription}</b> успешно начислена на ваш аккаунт.`;
        telegramApi.sendMessage(Number(userRow.telegram_id), msg).catch(() => {});
      }

      return {
        success: true,
        message: `Награда за ранг "${tier.nameRu}" успешно получена!`,
        tier,
      };
    });
  }

  /**
   * Calculates weekly cashback status.
   */
  async getCashbackStatus(userId: string): Promise<CashbackStatusDto> {
    await this.ensureTables();
    try {
      const userRows = await prisma.$queryRaw<
        Array<{ xp: number | null; vip_level: number | null; last_cashback_claimed_at: Date | null }>
      >`
        SELECT xp, vip_level, last_cashback_claimed_at
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;

      const xp = Number(userRows[0]?.xp || 0);
      const tier = getVipTierByXp(xp);
      const lastClaimedAt = userRows[0]?.last_cashback_claimed_at ? new Date(userRows[0].last_cashback_claimed_at) : null;

      // Calculation window: strictly on or after VIP_FRESH_START_EPOCH (ignoring past history)
      const sinceDate = lastClaimedAt
        ? new Date(Math.max(lastClaimedAt.getTime(), VIP_FRESH_START_EPOCH.getTime(), Date.now() - 7 * 24 * 3600 * 1000))
        : new Date(Math.max(VIP_FRESH_START_EPOCH.getTime(), Date.now() - 7 * 24 * 3600 * 1000));

      // Check stats for the window strictly for real-money non-tournament bets and wins
      const statsRows = await prisma.$queryRaw<
        Array<{ total_wagered: string | null; total_won: string | null }>
      >`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM bets 
           WHERE user_id = ${userId} 
             AND state != 'cancelled' 
             AND (metadata->>'demoMode')::boolean IS NOT TRUE
             AND (metadata->>'isTournament')::boolean IS NOT TRUE
             AND metadata->>'tournamentId' IS NULL
             AND metadata->>'freebetId' IS NULL
             AND placed_at >= ${sinceDate}) as total_wagered,
          (SELECT COALESCE(SUM(amount), 0) FROM transactions 
           WHERE user_id = ${userId} 
             AND type IN ('win', 'payout') 
             AND (metadata->>'demoMode')::boolean IS NOT TRUE
             AND (metadata->>'isTournament')::boolean IS NOT TRUE
             AND metadata->>'tournamentId' IS NULL
             AND metadata->>'freebetId' IS NULL
             AND created_at >= ${sinceDate}) as total_won
      `;

      const totalWagered = Number(statsRows[0]?.total_wagered || 0);
      const totalWon = Number(statsRows[0]?.total_won || 0);
      const netLoss = Math.max(0, totalWagered - totalWon);
      const amount = Math.round(netLoss * (tier.cashbackPercent / 100) * 100) / 100;

      // Next claim available: launch date 7 September 2026 or 7 days after last claim
      const startDate = new Date('2026-09-07T00:00:00.000Z');
      const isBeforeLaunch = Date.now() < startDate.getTime();
      const cooldownMs = 7 * 24 * 3600 * 1000;
      let available = false;
      let nextClaimAvailableAt: string | null = null;

      if (isBeforeLaunch) {
        available = false;
        nextClaimAvailableAt = startDate.toISOString();
      } else if (!lastClaimedAt) {
        available = amount >= 0.50;
      } else {
        const nextTime = lastClaimedAt.getTime() + cooldownMs;
        if (Date.now() >= nextTime) {
          available = amount >= 0.50;
        } else {
          nextClaimAvailableAt = new Date(nextTime).toISOString();
        }
      }

      return {
        available,
        amount,
        cashbackPercent: tier.cashbackPercent,
        netLoss,
        totalWagered,
        totalWon,
        nextClaimAvailableAt,
        lastClaimedAt: lastClaimedAt ? lastClaimedAt.toISOString() : null,
        rankName: tier.nameRu,
      };
    } catch (err) {
      logger.error({ err, userId }, 'Failed to compute cashback status');
      return {
        available: false,
        amount: 0,
        cashbackPercent: 2,
        netLoss: 0,
        totalWagered: 0,
        totalWon: 0,
        nextClaimAvailableAt: '2026-09-07T00:00:00.000Z',
        lastClaimedAt: null,
        rankName: 'Без ранга',
      };
    }
  }

  /**
   * Retrieves dynamic VIP & Cashback admin configuration.
   */
  async getAdminConfig() {
    await this.ensureTables();
    try {
      const redis = (await import('../lib/redis.js')).redisClient.getClient();
      const raw = await redis.get('vip:admin_config');
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    return {
      xpPerZl: VIP_XP_PER_ZL,
      cashbackStartDate: '2026-09-07T00:00:00.000Z',
      tiers: VIP_RANKS,
    };
  }

  /**
   * Updates dynamic VIP & Cashback admin configuration.
   */
  async updateAdminConfig(configData: any) {
    await this.ensureTables();
    try {
      const redis = (await import('../lib/redis.js')).redisClient.getClient();
      await redis.set('vip:admin_config', JSON.stringify(configData));
      logger.info({ configData }, 'Admin updated VIP & Cashback configuration');
      return { ok: true, config: configData };
    } catch (err) {
      logger.error({ err }, 'Failed to save VIP admin config');
      throw err;
    }
  }

  /**
   * Claims weekly cashback.
   */
  async claimCashback(userId: string): Promise<{ success: boolean; amount: number; message: string }> {
    await this.ensureTables();
    const status = await this.getCashbackStatus(userId);
    if (!status.available || status.amount <= 0) {
      throw new Error('Кэшбэк пока недоступен для получения (старт программы с 7 сентября, либо минимальная сумма 0.50 zł)');
    }

    const claimAmount = status.amount;

    return await prisma.$transaction(async (tx) => {
      const curRows = await tx.$queryRaw<Array<{ amount: string; telegram_id: bigint }>>`
        SELECT b.amount, u.telegram_id
        FROM balances b
        JOIN users u ON u.id = b.user_id
        WHERE b.user_id = ${userId} AND b.demo_mode = false
        FOR UPDATE
      `;

      if (!curRows || curRows.length === 0) {
        throw new Error('Баланс не найден');
      }

      const currentBal = Number(curRows[0].amount);
      const telegramId = curRows[0].telegram_id;

      await tx.$executeRaw`
        UPDATE balances
        SET amount = amount + ${claimAmount}::numeric,
            updated_at = NOW()
        WHERE user_id = ${userId} AND demo_mode = false
      `;

      await tx.$executeRaw`
        UPDATE users
        SET last_cashback_claimed_at = NOW()
        WHERE id = ${userId}
      `;

      await tx.transaction.create({
        data: {
          userId,
          type: 'bonus',
          amount: claimAmount,
          balanceBefore: currentBal,
          balanceAfter: currentBal + claimAmount,
          metadata: {
            reason: `Weekly Cashback (${status.cashbackPercent}%)`,
            netLoss: status.netLoss,
          },
        },
      });

      logger.info({ userId, amount: claimAmount }, 'Weekly cashback claimed');

      if (telegramId) {
        const msg = `💸 <b>Еженедельный кэшбэк начислен!</b>\n\nСумма: <b>+${claimAmount.toFixed(2)} zł</b> (${status.cashbackPercent}% от чистого проигрыша)\nСредства зачислены на ваш баланс.`;
        telegramApi.sendMessage(Number(telegramId), msg).catch(() => {});
      }

      return {
        success: true,
        amount: claimAmount,
        message: `Кэшбэк +${claimAmount.toFixed(2)} zł успешно зачислен на баланс!`,
      };
    });
  }

  /**
   * Rolls back all VIP rewards that were claimed wrongfully based on inflated ranks.
   * Ranks and XP are recalculated strictly from VIP_FRESH_START_EPOCH (02.09.2026 19:00 MSK).
   * Wrongful balance additions are deducted (with shortfalls moved to hiddenDebt).
   * Wrongful freebets are cancelled or deleted.
   * Wrongful free cases are deducted.
   * claimed_vip_rewards is pruned down to legitimate levels.
   */
  async rollbackIllegitimateVipRewards(): Promise<{
    processedUsers: number;
    usersRolledBack: number;
    totalBalanceDeducted: number;
    totalHiddenDebtAdded: number;
    totalFreebetsCancelled: number;
    totalCasesDeducted: number;
    details: Array<{
      userId: string;
      username: string | null;
      legitXp: number;
      legitLevel: number;
      claimedLevels: number[];
      illegitimateLevels: number[];
      balanceDeducted: number;
      hiddenDebtAdded: number;
      freebetsCancelled: number;
      casesDeducted: number;
    }>;
  }> {
    await this.ensureTables();
    logger.info({ epoch: VIP_FRESH_START_EPOCH }, 'Starting rollback of illegitimate VIP rewards...');

    // 1. Find all users who have claimed rewards, non-zero XP, non-zero level, or received recent VIP bonuses
    const candidateUsers = await prisma.$queryRaw<
      Array<{
        id: string;
        telegram_id: bigint;
        username: string | null;
        xp: number | null;
        vip_level: number | null;
        claimed_vip_rewards: number[] | null;
        hidden_debt: string | number;
      }>
    >`
      SELECT DISTINCT u.id, u.telegram_id, u.username, u.xp, u.vip_level, u.claimed_vip_rewards, u.hidden_debt
      FROM users u
      LEFT JOIN transactions t ON t.user_id = u.id 
        AND t.type = 'bonus' 
        AND (t.metadata->>'reason' LIKE 'VIP Rank Reward%' OR (t.metadata->>'level')::int IN (1, 2, 3, 4, 5))
      LEFT JOIN user_freebets fb ON fb.user_id = u.id AND fb.id LIKE 'fb_vip_%'
      WHERE (u.claimed_vip_rewards IS NOT NULL AND array_length(u.claimed_vip_rewards, 1) > 0)
         OR u.xp > 0
         OR u.vip_level > 0
         OR t.id IS NOT NULL
         OR fb.id IS NOT NULL
    `;

    logger.info({ candidateCount: candidateUsers.length }, 'Candidate users found for VIP inspection');

    let usersRolledBack = 0;
    let totalBalanceDeducted = 0;
    let totalHiddenDebtAdded = 0;
    let totalFreebetsCancelled = 0;
    let totalCasesDeducted = 0;
    const details: Array<any> = [];

    for (const user of candidateUsers) {
      // 2. Calculate legitimate wager and tier since VIP_FRESH_START_EPOCH
      const wagerRows = await prisma.$queryRaw<Array<{ total_wager: string | number }>>`
        SELECT COALESCE(SUM(amount), 0) as total_wager
        FROM bets
        WHERE user_id = ${user.id}
          AND state != 'cancelled' 
          AND (metadata->>'demoMode')::boolean IS NOT TRUE 
          AND (metadata->>'isTournament')::boolean IS NOT TRUE
          AND metadata->>'tournamentId' IS NULL
          AND metadata->>'freebetId' IS NULL
          AND placed_at >= ${VIP_FRESH_START_EPOCH}
      `;
      const legitWager = Number(wagerRows[0]?.total_wager || 0);
      const legitXp = Math.floor(legitWager * VIP_XP_PER_ZL);
      const legitTier = getVipTierByXp(legitXp);
      const legitLevel = legitTier.level;

      const rawClaimed = (user.claimed_vip_rewards || []).map(Number);

      // Also check recent bonus transactions for this user
      const txRows = await prisma.$queryRaw<Array<{ id: string; amount: string; metadata: any }>>`
        SELECT id, amount, metadata
        FROM transactions
        WHERE user_id = ${user.id}
          AND type = 'bonus'
          AND (metadata->>'reason' LIKE 'VIP Rank Reward%' OR (metadata->>'level')::int IN (1, 2, 3, 4, 5))
      `;

      // Collect all claimed levels from both column and transactions
      const allClaimedSet = new Set<number>(rawClaimed);
      for (const tx of txRows) {
        const lvl = Number(tx.metadata?.level);
        if (!isNaN(lvl) && lvl > 0) {
          allClaimedSet.add(lvl);
        }
      }
      const claimedLevels = Array.from(allClaimedSet).sort((a, b) => a - b);
      const illegitimateLevels = claimedLevels.filter((lvl) => lvl > legitLevel);
      const legitimateLevels = claimedLevels.filter((lvl) => lvl <= legitLevel);

      let balanceToDeduct = 0;
      let casesToDeduct = 0;
      let freebetsToCancel = 0;

      for (const lvl of illegitimateLevels) {
        const tierCfg = VIP_RANKS.find((r) => r.level === lvl);
        if (!tierCfg) continue;
        if (tierCfg.rewardType === 'balance' || tierCfg.rewardType === 'balance_and_case') {
          balanceToDeduct += (tierCfg.rewardBalance || 0);
        }
        if (tierCfg.rewardType === 'free_case' || tierCfg.rewardType === 'balance_and_case') {
          casesToDeduct += 1;
        }
        if (tierCfg.rewardType === 'freebet') {
          freebetsToCancel += 1;
        }
      }

      // Check if user also has any active freebet fb_vip_
      const fbRows = await prisma.$queryRaw<Array<{ id: string; status: string; bet_id: string | null }>>`
        SELECT id, status, bet_id
        FROM user_freebets
        WHERE user_id = ${user.id}
          AND (id LIKE 'fb_vip_%' OR (amount = 50 AND payout_type = 'net_win'))
      `;
      const wrongfulFbList = fbRows.filter((fb) => {
        return legitLevel < 4;
      });

      const needsRollback = illegitimateLevels.length > 0 || wrongfulFbList.length > 0;
      const needsXpUpdate = user.xp !== legitXp || user.vip_level !== legitLevel;

      if (!needsRollback && !needsXpUpdate) {
        continue;
      }

      let deductedFromBal = 0;
      let addedToDebt = 0;
      let cancelledFbCount = 0;

      await prisma.$transaction(async (tx) => {
        // A. Balance rollback
        if (balanceToDeduct > 0) {
          const balRows = await tx.$queryRaw<Array<{ amount: string }>>`
            SELECT amount FROM balances WHERE user_id = ${user.id} AND demo_mode = false FOR UPDATE
          `;
          const currentBal = Number(balRows[0]?.amount || 0);

          if (currentBal >= balanceToDeduct) {
            deductedFromBal = balanceToDeduct;
            const newBal = currentBal - balanceToDeduct;
            await tx.$executeRaw`
              UPDATE balances
              SET amount = ${newBal}::numeric,
                  updated_at = NOW()
              WHERE user_id = ${user.id} AND demo_mode = false
            `;
          } else {
            deductedFromBal = currentBal;
            addedToDebt = balanceToDeduct - currentBal;
            await tx.$executeRaw`
              UPDATE balances
              SET amount = 0::numeric,
                  updated_at = NOW()
              WHERE user_id = ${user.id} AND demo_mode = false
            `;
            await tx.$executeRaw`
              UPDATE users
              SET hidden_debt = hidden_debt + ${addedToDebt}::numeric
              WHERE id = ${user.id}
            `;
          }

          // Create audit transaction
          await tx.transaction.create({
            data: {
              userId: user.id,
              type: 'correction',
              amount: -balanceToDeduct,
              balanceBefore: currentBal,
              balanceAfter: Math.max(0, currentBal - balanceToDeduct),
              metadata: {
                reason: 'Откат неправомерной VIP награды (пересчет с 02.09 19:00)',
                illegitimateLevels,
                deductedFromBalance: deductedFromBal,
                addedToHiddenDebt: addedToDebt,
              },
            },
          });
        }

        // B. Free cases rollback
        if (casesToDeduct > 0) {
          const caseRows = await tx.$queryRaw<Array<{ free_cases: number; free_cases_json: any }>>`
            SELECT free_cases, free_cases_json FROM balances WHERE user_id = ${user.id} FOR UPDATE
          `;
          const currentCases = Number(caseRows[0]?.free_cases || 0);
          const newCases = Math.max(0, currentCases - casesToDeduct);
          const json = (caseRows[0]?.free_cases_json as Record<string, { count: number; wager: number }>) || {};
          if (json.starter) {
            json.starter.count = Math.max(0, (json.starter.count || 0) - casesToDeduct);
          }

          await tx.$executeRaw`
            UPDATE balances
            SET free_cases = ${newCases},
                free_cases_json = ${JSON.stringify(json)}::jsonb,
                updated_at = NOW()
            WHERE user_id = ${user.id}
          `;
        }

        // C. Freebets rollback
        for (const fb of wrongfulFbList) {
          if (fb.status === 'available') {
            await tx.$executeRaw`
              DELETE FROM user_freebets WHERE id = ${fb.id}
            `;
            cancelledFbCount++;
          } else if (fb.status === 'locked' || fb.status === 'used') {
            if (fb.bet_id) {
              const betRows = await tx.$queryRaw<Array<{ id: string; state: string; payout: string | null }>>`
                SELECT id, state, payout FROM bets WHERE id = ${fb.bet_id} FOR UPDATE
              `;
              const bet = betRows[0];
              if (bet && (bet.state === 'active' || bet.state === 'pending')) {
                await tx.$executeRaw`
                  UPDATE bets SET state = 'cancelled', resolved_at = NOW() WHERE id = ${bet.id}
                `;
                cancelledFbCount++;
              }
            }
          }
        }

        // D. Update user XP, Level, and claimed rewards array
        await tx.$executeRaw`
          UPDATE users
          SET xp = ${legitXp},
              vip_level = ${legitLevel},
              claimed_vip_rewards = ${legitimateLevels}
          WHERE id = ${user.id}
        `;
      });

      if (needsRollback) {
        usersRolledBack++;
        totalBalanceDeducted += balanceToDeduct;
        totalHiddenDebtAdded += addedToDebt;
        totalFreebetsCancelled += cancelledFbCount;
        totalCasesDeducted += casesToDeduct;

        details.push({
          userId: user.id,
          username: user.username,
          legitXp,
          legitLevel,
          claimedLevels,
          illegitimateLevels,
          balanceDeducted: deductedFromBal,
          hiddenDebtAdded: addedToDebt,
          freebetsCancelled: cancelledFbCount,
          casesDeducted: casesToDeduct,
        });

        logger.info(
          {
            userId: user.id,
            username: user.username,
            legitXp,
            legitLevel,
            illegitimateLevels,
            balanceDeducted: deductedFromBal,
            hiddenDebtAdded: addedToDebt,
            cancelledFbCount,
          },
          'User VIP rewards rolled back successfully'
        );
      }
    }

    logger.info(
      {
        processedUsers: candidateUsers.length,
        usersRolledBack,
        totalBalanceDeducted,
        totalHiddenDebtAdded,
        totalFreebetsCancelled,
        totalCasesDeducted,
      },
      'VIP Rollback completed successfully'
    );

    return {
      processedUsers: candidateUsers.length,
      usersRolledBack,
      totalBalanceDeducted,
      totalHiddenDebtAdded,
      totalFreebetsCancelled,
      totalCasesDeducted,
      details,
    };
  }
}

export const vipService = new VipService();

