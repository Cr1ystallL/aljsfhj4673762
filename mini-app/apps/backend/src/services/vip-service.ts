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

      // Auto-run one-time recalculation of VIP XP and reset premature cashback claims
      try {
        const redis = (await import('../lib/redis.js')).redisClient.getClient();
        if (redis) {
          const done = await redis.get('vip:recalculated_v2');
          if (!done) {
            await this.recalculateAllUsersVipAndResetCashback();
            await redis.set('vip:recalculated_v2', '1');
          }
        }
      } catch (e) {
        logger.warn({ e }, 'VIP one-time auto recalculation skipped / failed in Redis');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to ensure VIP columns in users table');
    }
  }

  /**
   * Resets invalid premature cashback claims and recalculates true XP & VIP levels from real bets.
   */
  async recalculateAllUsersVipAndResetCashback(): Promise<{ updatedUsers: number }> {
    await this.ensureTables();
    try {
      logger.info('Starting full VIP XP recalculation and cashback reset...');

      // 1. Reset all premature cashback claims
      await prisma.$executeRaw`
        UPDATE users SET last_cashback_claimed_at = NULL;
      `;

      // 2. Fetch all real bet amounts grouped by user
      const betTotals = await prisma.$queryRaw<Array<{ user_id: string; total_wager: number | string }>>`
        SELECT user_id, COALESCE(SUM(amount), 0) as total_wager
        FROM bets
        WHERE state != 'cancelled' 
          AND (metadata->>'demoMode')::boolean IS NOT TRUE 
          AND metadata->>'tournamentId' IS NULL
        GROUP BY user_id
      `;

      const wagerMap = new Map<string, number>();
      for (const row of betTotals) {
        wagerMap.set(row.user_id, Number(row.total_wager || 0));
      }

      // 3. Fetch all users
      const allUsers = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users
      `;

      for (const u of allUsers) {
        const wager = wagerMap.get(u.id) || 0;
        const xp = Math.floor(wager * VIP_XP_PER_ZL);
        const tier = getVipTierByXp(xp);

        await prisma.$executeRaw`
          UPDATE users
          SET xp = ${xp},
              vip_level = ${tier.level}
          WHERE id = ${u.id}
        `;
      }

      logger.info({ totalUsers: allUsers.length }, 'VIP XP recalculation and cashback reset completed successfully');
      return { updatedUsers: allUsers.length };
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

      const startDate = new Date('2026-09-07T00:00:00.000Z');
      const isBeforeLaunch = Date.now() < startDate.getTime();

      if (isBeforeLaunch) {
        return {
          available: false,
          amount: 0,
          cashbackPercent: tier.cashbackPercent,
          netLoss: 0,
          totalWagered: 0,
          totalWon: 0,
          nextClaimAvailableAt: startDate.toISOString(),
          lastClaimedAt: lastClaimedAt ? lastClaimedAt.toISOString() : null,
          rankName: tier.nameRu,
        };
      }

      // Calculation window strictly starts from September 7, 2026 or last claim date
      const sinceDate = new Date(Math.max(
        startDate.getTime(),
        lastClaimedAt ? lastClaimedAt.getTime() : startDate.getTime(),
        Date.now() - 7 * 24 * 3600 * 1000
      ));

      // Check stats for the window
      const statsRows = await prisma.$queryRaw<
        Array<{ total_wagered: string | null; total_won: string | null }>
      >`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM bets WHERE user_id = ${userId} AND state != 'cancelled' AND placed_at >= ${sinceDate}) as total_wagered,
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ${userId} AND type IN ('win', 'payout') AND created_at >= ${sinceDate}) as total_won
      `;

      const totalWagered = Number(statsRows[0]?.total_wagered || 0);
      const totalWon = Number(statsRows[0]?.total_won || 0);
      const netLoss = Math.max(0, totalWagered - totalWon);
      const amount = Math.round(netLoss * (tier.cashbackPercent / 100) * 100) / 100;

      // Next claim available: either never claimed or 7 days after last claim
      const cooldownMs = 7 * 24 * 3600 * 1000;
      let available = false;
      let nextClaimAvailableAt: string | null = null;

      if (!lastClaimedAt) {
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
}

export const vipService = new VipService();

