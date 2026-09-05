import dotenv from 'dotenv';
dotenv.config();

import { prisma, disconnectPrisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';
import { VIP_FRESH_START_EPOCH, vipService } from '../services/vip-service.js';
import { VIP_RANKS, VIP_XP_PER_ZL, getVipTierByXp } from '@casino/shared';

interface DiscrepancyUser {
  userId: string;
  telegramId: string;
  username: string;
  currentXp: number;
  legitXp: number;
  currentLevel: number;
  legitLevel: number;
  currentTier: string;
  legitTier: string;
  totalWagered: number;
  totalWon: number;
  netLoss: number;
  currentCashback: number;
  expectedCashback: number;
  cashbackDiff: number;
  lastClaimedAt: string | null;
  hasPrematureClaim: boolean;
  hiddenDebt: number;
  issues: string[];
}

interface TopCashbackUser {
  rank: number;
  userId: string;
  telegramId: string;
  username: string;
  tier: string;
  cashbackPercent: number;
  totalWagered: number;
  totalWon: number;
  netLoss: number;
  cashbackAmount: number;
}

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');

  console.log('================================================================');
  console.log('       MACVBET VIP CASHBACK PRE-PAYOUT AUDIT & CHECK');
  console.log('================================================================');
  console.log(`Current Local Time:       ${new Date().toISOString()}`);
  console.log(`Cashback Launch Date:     2026-09-07T00:00:00.000Z (Monday)`);
  console.log(`VIP Fresh Start Epoch:    ${VIP_FRESH_START_EPOCH.toISOString()} (02.09.2026 19:00 MSK)`);
  console.log(`Execution Mode:           ${fixMode ? '🔧 AUTO-FIX ENABLED (--fix)' : '🔍 READ-ONLY AUDIT'}`);
  console.log('================================================================\n');

  try {
    await redisClient.connect().catch(() => {});
    await vipService.ensureTables();

    // 1. Fetch all candidate users with activity since fresh start epoch
    const candidateUsers = await prisma.$queryRaw<
      Array<{
        id: string;
        telegram_id: bigint;
        username: string | null;
        first_name: string | null;
        xp: number | null;
        vip_level: number | null;
        last_cashback_claimed_at: Date | null;
        hidden_debt: string | number;
      }>
    >`
      SELECT DISTINCT u.id, u.telegram_id, u.username, u.first_name, u.xp, u.vip_level, u.last_cashback_claimed_at, u.hidden_debt
      FROM users u
      LEFT JOIN bets b ON b.user_id = u.id AND b.placed_at >= ${VIP_FRESH_START_EPOCH}
      LEFT JOIN transactions t ON t.user_id = u.id AND t.created_at >= ${VIP_FRESH_START_EPOCH}
      WHERE b.id IS NOT NULL 
         OR t.id IS NOT NULL 
         OR u.xp > 0 
         OR u.vip_level > 0 
         OR u.last_cashback_claimed_at IS NOT NULL
      ORDER BY u.id
    `;

    console.log(`Auditing ${candidateUsers.length} users with post-launch activity...\n`);

    const discrepancies: DiscrepancyUser[] = [];
    const topEligible: TopCashbackUser[] = [];
    let totalCasinoWagered = 0;
    let totalCasinoWon = 0;
    let totalCasinoNetLoss = 0;
    let totalExpectedCashback = 0;
    let totalCurrentCashback = 0;
    let usersEligibleCount = 0;

    for (const user of candidateUsers) {
      const currentXp = Number(user.xp || 0);
      const currentLevel = Number(user.vip_level || 0);
      const currentTier = getVipTierByXp(currentXp);
      const hiddenDebt = Number(user.hidden_debt || 0);
      const lastClaimedAt = user.last_cashback_claimed_at ? new Date(user.last_cashback_claimed_at) : null;

      // Legitimate wager calculation (all settled real-money bets placed >= epoch)
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

      // Legitimate winnings calculation (all win/cashout transactions and bet payouts created >= epoch)
      const wonRows = await prisma.$queryRaw<Array<{ total_won: string | number }>>`
        SELECT COALESCE(SUM(amount), 0) as total_won
        FROM transactions
        WHERE user_id = ${user.id}
          AND type IN ('win', 'cashout', 'payout')
          AND (metadata->>'demoMode')::boolean IS NOT TRUE
          AND (metadata->>'isTournament')::boolean IS NOT TRUE
          AND metadata->>'tournamentId' IS NULL
          AND metadata->>'freebetId' IS NULL
          AND created_at >= ${VIP_FRESH_START_EPOCH}
      `;
      const wonBetRows = await prisma.$queryRaw<Array<{ total_won: string | number }>>`
        SELECT COALESCE(SUM(COALESCE(payout, 0)), 0) as total_won
        FROM bets
        WHERE user_id = ${user.id}
          AND state != 'cancelled'
          AND (metadata->>'demoMode')::boolean IS NOT TRUE
          AND (metadata->>'isTournament')::boolean IS NOT TRUE
          AND metadata->>'tournamentId' IS NULL
          AND metadata->>'freebetId' IS NULL
          AND placed_at >= ${VIP_FRESH_START_EPOCH}
      `;
      const legitWon = Math.max(Number(wonRows[0]?.total_won || 0), Number(wonBetRows[0]?.total_won || 0));

      // Deposit-based cap check
      const depRows = await prisma.$queryRaw<Array<{ deposits: string | number; withdrawals: string | number }>>`
        SELECT 
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ${user.id} AND type = 'deposit') as deposits,
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ${user.id} AND type = 'withdrawal') as withdrawals
      `;
      const totalDeposits = Number(depRows[0]?.deposits || 0);
      const totalWithdrawals = Number(depRows[0]?.withdrawals || 0);

      const balRow = await prisma.balance.findFirst({
        where: { userId: user.id, demoMode: false },
        select: { amount: true },
      });
      const liveBalance = Math.max(0, Number(balRow?.amount || 0));

      const gamingLoss = Math.max(0, legitWager - legitWon);
      const realOutOfPocketLoss = Math.max(0, totalDeposits - totalWithdrawals - liveBalance);
      const netLoss = totalDeposits > 0 ? Math.min(gamingLoss, realOutOfPocketLoss) : 0;

      const legitXp = Math.floor(legitWager * VIP_XP_PER_ZL);
      const legitTier = getVipTierByXp(legitXp);
      const legitLevel = legitTier.level;
      const expectedCashback = Math.round(netLoss * (legitTier.cashbackPercent / 100) * 100) / 100;

      // Current system calculation
      const currentStatus = await vipService.getCashbackStatus(user.id);
      const currentCashback = currentStatus.amount;
      const cashbackDiff = Math.round((currentCashback - expectedCashback) * 100) / 100;

      totalCasinoWagered += legitWager;
      totalCasinoWon += legitWon;
      totalCasinoNetLoss += netLoss;
      totalExpectedCashback += expectedCashback;
      totalCurrentCashback += currentCashback;

      if (expectedCashback >= 0.50) {
        usersEligibleCount++;
        topEligible.push({
          rank: 0,
          userId: user.id.slice(0, 8),
          telegramId: user.telegram_id ? user.telegram_id.toString() : '-',
          username: user.username || user.first_name || 'Anonymous',
          tier: legitTier.nameRu,
          cashbackPercent: legitTier.cashbackPercent,
          totalWagered: Math.round(legitWager * 100) / 100,
          totalWon: Math.round(legitWon * 100) / 100,
          netLoss: Math.round(netLoss * 100) / 100,
          cashbackAmount: expectedCashback,
        });
      }

      // Check discrepancies
      const issues: string[] = [];
      const xpMismatch = currentXp !== legitXp;
      const levelMismatch = currentLevel !== legitLevel;
      const amountMismatch = Math.abs(cashbackDiff) >= 0.01;
      const hasPrematureClaim = lastClaimedAt !== null;

      if (xpMismatch) {
        if (currentXp > legitXp) {
          issues.push(`XP завышен (+${currentXp - legitXp} XP)`);
        } else {
          issues.push(`XP занижен (${currentXp - legitXp} XP)`);
        }
      }

      if (levelMismatch) {
        issues.push(`Ранг в БД: ${currentLevel} (${currentTier.nameRu}), должен быть: ${legitLevel} (${legitTier.nameRu})`);
      }

      if (amountMismatch) {
        if (cashbackDiff > 0) {
          issues.push(`Кэшбэк завышен на +${cashbackDiff.toFixed(2)} zł! (${currentCashback.toFixed(2)} вместо ${expectedCashback.toFixed(2)})`);
        } else {
          issues.push(`Кэшбэк занижен на ${cashbackDiff.toFixed(2)} zł (${currentCashback.toFixed(2)} вместо ${expectedCashback.toFixed(2)})`);
        }
      }

      if (hasPrematureClaim) {
        issues.push(`Преждевременный клейм: ${lastClaimedAt?.toISOString()}`);
      }

      if (hiddenDebt > 0) {
        issues.push(`Скрытый долг: ${hiddenDebt.toFixed(2)} zł`);
      }

      if (issues.length > 0) {
        discrepancies.push({
          userId: user.id,
          telegramId: user.telegram_id ? user.telegram_id.toString() : '-',
          username: user.username || user.first_name || 'Anonymous',
          currentXp,
          legitXp,
          currentLevel,
          legitLevel,
          currentTier: currentTier.nameRu,
          legitTier: legitTier.nameRu,
          totalWagered: Math.round(legitWager * 100) / 100,
          totalWon: Math.round(legitWon * 100) / 100,
          netLoss: Math.round(netLoss * 100) / 100,
          currentCashback,
          expectedCashback,
          cashbackDiff,
          lastClaimedAt: lastClaimedAt ? lastClaimedAt.toISOString() : null,
          hasPrematureClaim,
          hiddenDebt,
          issues,
        });
      }
    }

    // Sort top eligible by cashback amount desc
    topEligible.sort((a, b) => b.cashbackAmount - a.cashbackAmount);
    topEligible.forEach((u, idx) => { u.rank = idx + 1; });

    console.log('================== FINANCIAL AGGREGATE SUMMARY ==================');
    console.log(`Total active players checked:       ${candidateUsers.length}`);
    console.log(`Total turnover (Wagered):           ${totalCasinoWagered.toFixed(2)} zł`);
    console.log(`Total payouts (Won):                ${totalCasinoWon.toFixed(2)} zł`);
    console.log(`Casino GGR / Net Loss across pool:  ${totalCasinoNetLoss.toFixed(2)} zł`);
    console.log(`Players eligible for cashback:      ${usersEligibleCount} (min 0.50 zł)`);
    console.log(`Expected legitimate cashback total: ${totalExpectedCashback.toFixed(2)} zł`);
    console.log(`Current system cashback total:      ${totalCurrentCashback.toFixed(2)} zł`);
    const netCashbackDelta = totalCurrentCashback - totalExpectedCashback;
    console.log(`Global difference:                  ${netCashbackDelta >= 0 ? '+' : ''}${netCashbackDelta.toFixed(2)} zł`);
    console.log('=================================================================\n');

    if (topEligible.length > 0) {
      console.log('🏆 TOP 15 PLAYERS BY EXPECTED CASHBACK (7 СЕНТЯБРЯ):');
      console.table(topEligible.slice(0, 15).map(t => ({
        '#': t.rank,
        'User': t.username,
        'TG ID': t.telegramId,
        'Rank': t.tier,
        '%': `${t.cashbackPercent}%`,
        'Wagered': `${t.totalWagered} zł`,
        'Won': `${t.totalWon} zł`,
        'Net Loss': `${t.netLoss} zł`,
        'Cashback': `+${t.cashbackAmount.toFixed(2)} zł`,
      })));
      console.log();
    }

    if (discrepancies.length === 0) {
      console.log('✅ ИДЕАЛЬНО! Расхождений не найдено.');
      console.log('Все уровни, XP и суммы кэшбэка 100% совпадают с реальными ставками.');
    } else {
      console.log(`⚠️ ОБНАРУЖЕНО РАСХОЖДЕНИЙ: ${discrepancies.length} пользователей!\n`);
      console.log('СПИСОК ПОЛЬЗОВАТЕЛЕЙ С РАСХОЖДЕНИЯМИ:');
      console.table(discrepancies.map(d => ({
        'User': d.username,
        'TG ID': d.telegramId,
        'Cur XP': d.currentXp,
        'Legit XP': d.legitXp,
        'Cur %': `${getVipTierByXp(d.currentXp).cashbackPercent}%`,
        'Legit %': `${getVipTierByXp(d.legitXp).cashbackPercent}%`,
        'Cur CB': `${d.currentCashback.toFixed(2)} zł`,
        'Exp CB': `${d.expectedCashback.toFixed(2)} zł`,
        'Diff': `${d.cashbackDiff >= 0 ? '+' : ''}${d.cashbackDiff.toFixed(2)} zł`,
        'Issues': d.issues.join('; '),
      })));
      console.log();

      if (fixMode) {
        console.log('🔧 ПРИМЕНЕНИЕ АВТОМАТИЧЕСКОЙ СИНХРОНИЗАЦИИ (--fix)...');
        let fixedUsersCount = 0;

        for (const d of discrepancies) {
          const targetClaimed = d.legitLevel > 0
            ? Array.from({ length: d.legitLevel }, (_, i) => i + 1)
            : [];

          await prisma.$executeRaw`
            UPDATE users
            SET xp = ${d.legitXp},
                vip_level = ${d.legitLevel},
                last_cashback_claimed_at = NULL,
                claimed_vip_rewards = ${targetClaimed}
            WHERE id = ${d.userId}
          `;
          fixedUsersCount++;
        }

        console.log(`✅ Успешно синхронизировано и исправлено ${fixedUsersCount} пользователей!`);
        console.log('XP, ранги и даты сброшены к корректным значениям.');
      } else {
        console.log('💡 Чтобы автоматически исправить расхождения (синхронизировать XP/ранги и сбросить ошибочные даты), запустите:');
        console.log('   pnpm --filter @casino/backend exec tsx src/scripts/audit-cashback.ts --fix\n');
      }
    }
  } catch (err) {
    console.error('Audit failed with error:', err);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }

  process.exit(0);
}

void main();
