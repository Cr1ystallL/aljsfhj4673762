import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import {
  VIP_RANKS,
  VIP_ZL_PER_XP,
  xpFromWagerZl,
  wagerRemainderAfterXp,
  getVipTierByXp,
} from '@casino/shared';

/**
 * Roll Albina back to the instant of her first 100 zł withdrawal:
 * balance, VIP XP/rank, claimed rank rewards, and cashback clock.
 * Later withdrawals are rejected without a refund. Waterline is set
 * so she can still win individual rounds but cannot climb the bank.
 *
 *   npx tsx scripts/rollback-albina-first-wd.ts           # preview
 *   npx tsx scripts/rollback-albina-first-wd.ts --apply   # write
 */

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const USER_ID = process.argv.find((a) => /^[0-9a-f-]{36}$/i.test(a))
  || '4045bcb0-753c-4ae9-99cd-d70e2a35b39e';
const APPLY = process.argv.includes('--apply');
const FIRST_WD_AMOUNT = 100;
const VIP_FRESH_START_EPOCH = new Date('2026-09-02T16:00:00.000Z');

function isVipRankRewardTx(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const reason = String((metadata as { reason?: unknown }).reason || '');
  return reason.startsWith('VIP Rank Reward');
}

function isCashbackTx(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const reason = String((metadata as { reason?: unknown }).reason || '');
  return reason.startsWith('Weekly Cashback');
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    include: { balance: true },
  });
  if (!user || !user.balance) {
    throw new Error(`User ${USER_ID} not found`);
  }

  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: 'asc' },
  });

  const firstWd = withdrawals.find(
    (w) => Math.abs(Number(w.amount) - FIRST_WD_AMOUNT) < 0.01
  );
  if (!firstWd) {
    throw new Error(`No ${FIRST_WD_AMOUNT} zł withdrawal found for ${USER_ID}`);
  }

  const laterPending = withdrawals.filter(
    (w) => w.createdAt > firstWd.createdAt && w.status === 'pending'
  );

  const snapshotTx =
    (await prisma.transaction.findFirst({
      where: {
        userId: USER_ID,
        type: 'withdraw_request',
        createdAt: {
          gte: new Date(firstWd.createdAt.getTime() - 5000),
          lte: new Date(firstWd.createdAt.getTime() + 5000),
        },
      },
      orderBy: { createdAt: 'asc' },
    })) ||
    (await prisma.transaction.findFirst({
      where: {
        userId: USER_ID,
        type: 'withdraw_request',
      },
      orderBy: { createdAt: 'asc' },
    }));

  if (!snapshotTx) {
    throw new Error(
      `No withdraw_request transaction near ${firstWd.createdAt.toISOString()}`
    );
  }

  const cutoff = firstWd.createdAt;
  const targetBalance = Number(snapshotTx.balanceAfter);
  const currentBalance = Number(user.balance.amount);

  const wagerRows = await prisma.$queryRaw<Array<{ total_wager: string | number }>>`
    SELECT COALESCE(SUM(amount), 0) as total_wager
    FROM bets
    WHERE user_id = ${USER_ID}
      AND state != 'cancelled'
      AND (metadata->>'demoMode')::boolean IS NOT TRUE
      AND (metadata->>'isTournament')::boolean IS NOT TRUE
      AND metadata->>'tournamentId' IS NULL
      AND metadata->>'freebetId' IS NULL
      AND placed_at >= ${VIP_FRESH_START_EPOCH}
      AND placed_at < ${cutoff}
  `;
  const wagerAtCutoff = Number(wagerRows[0]?.total_wager || 0);
  const targetXp = xpFromWagerZl(wagerAtCutoff);
  const targetRemainder = wagerRemainderAfterXp(wagerAtCutoff);
  const targetTier = getVipTierByXp(targetXp);
  const targetLevel = targetTier.level;

  const bonusTxs = await prisma.transaction.findMany({
    where: { userId: USER_ID, type: 'bonus' },
    orderBy: { createdAt: 'asc' },
  });

  const vipTxs = bonusTxs.filter((tx) => isVipRankRewardTx(tx.metadata));
  const vipTxsAfter = vipTxs.filter((tx) => tx.createdAt > cutoff);
  const vipTxsBefore = vipTxs.filter((tx) => tx.createdAt <= cutoff);
  const cashbackTxs = bonusTxs.filter((tx) => isCashbackTx(tx.metadata));
  const lastCashbackBefore = [...cashbackTxs].reverse().find((tx) => tx.createdAt <= cutoff) || null;
  const cashbackAfter = cashbackTxs.filter((tx) => tx.createdAt > cutoff);

  const claimedNow = (user.claimedVipRewards || []).map(Number);
  const claimedAfterLevels = vipTxsAfter
    .map((tx) => Number((tx.metadata as { level?: unknown } | null)?.level))
    .filter((n) => Number.isFinite(n) && n > 0);
  const claimedBeforeLevels = vipTxsBefore
    .map((tx) => Number((tx.metadata as { level?: unknown } | null)?.level))
    .filter((n) => Number.isFinite(n) && n > 0);

  const targetClaimed = Array.from(
    new Set([
      ...claimedNow.filter((lvl) => !claimedAfterLevels.includes(lvl)),
      ...claimedBeforeLevels,
      ...Array.from({ length: targetLevel }, (_, i) => i + 1),
    ])
  ).sort((a, b) => a - b);

  const lastCashbackNow = user.lastCashbackClaimedAt;
  const targetCashbackAt =
    lastCashbackNow && lastCashbackNow > cutoff
      ? lastCashbackBefore?.createdAt || null
      : lastCashbackNow;

  const casesToDeduct = vipTxsAfter.reduce((sum, tx) => {
    const lvl = Number((tx.metadata as { level?: unknown } | null)?.level);
    const tier = VIP_RANKS.find((r) => r.level === lvl);
    if (!tier) return sum;
    if (tier.rewardType === 'free_case' || tier.rewardType === 'balance_and_case') {
      return sum + 1;
    }
    return sum;
  }, 0);

  const freebetsAfter = await prisma.$queryRaw<
    Array<{ id: string; status: string; created_at: Date; amount: string }>
  >`
    SELECT id, status, created_at, amount::text
    FROM user_freebets
    WHERE user_id = ${USER_ID}
      AND created_at > ${cutoff}
      AND (id LIKE 'fb_vip_%' OR (amount = 50 AND payout_type = 'net_win'))
  `;

  console.log('='.repeat(72));
  console.log(`ROLLBACK ${APPLY ? 'APPLY' : 'PREVIEW'}: ${USER_ID}`);
  console.log(`  TG: ${user.telegramId}  @${user.username || '—'}  ${user.firstName || ''}`);
  console.log(`  First WD: ${firstWd.id}  ${firstWd.createdAt.toISOString()}  ${Number(firstWd.amount).toFixed(2)} zł  [${firstWd.status}]`);
  console.log(`  Snapshot after 100 zł hold: ${targetBalance.toFixed(2)} zł`);
  console.log(`  Current balance: ${currentBalance.toFixed(2)} zł`);
  console.log(`  Delta: ${(targetBalance - currentBalance).toFixed(2)} zł`);
  console.log(`  Keep first WD pending: yes`);
  console.log(`  Cancel later WDs without refund: ${laterPending.length}`);
  for (const w of laterPending) {
    console.log(`    • ${w.id}  ${w.createdAt.toISOString()}  ${Number(w.amount).toFixed(2)} zł`);
  }
  console.log(`  Waterline: ${targetBalance.toFixed(2)} zł (no hard drain)`);
  console.log('-'.repeat(72));
  console.log(`  Wager before first WD (since ${VIP_FRESH_START_EPOCH.toISOString()}): ${wagerAtCutoff.toFixed(2)} zł`);
  console.log(`  XP rate: ${VIP_ZL_PER_XP} zł = 1 XP`);
  console.log(`  VIP now: LVL ${user.vipLevel} / ${user.xp} XP  claimed=[${claimedNow.join(',')}]`);
  console.log(`  VIP target: LVL ${targetLevel} ${targetTier.nameRu} / ${targetXp} XP  remainder=${targetRemainder.toFixed(2)}  claimed=[${targetClaimed.join(',')}]`);
  console.log(`  Rank rewards after cutoff: ${vipTxsAfter.length}`);
  for (const tx of vipTxsAfter) {
    console.log(`    • ${tx.createdAt.toISOString()}  +${Number(tx.amount).toFixed(2)}  ${JSON.stringify(tx.metadata)}`);
  }
  console.log(`  Free cases to remove (post-cutoff rank rewards): ${casesToDeduct}`);
  console.log(`  VIP freebets after cutoff: ${freebetsAfter.length}`);
  for (const fb of freebetsAfter) {
    console.log(`    • ${fb.id}  ${fb.status}  ${fb.created_at.toISOString()}`);
  }
  console.log(`  Cashback now: ${lastCashbackNow ? lastCashbackNow.toISOString() : 'null'}`);
  console.log(`  Cashback target: ${targetCashbackAt ? targetCashbackAt.toISOString() : 'null'}`);
  console.log(`  Cashback claims after cutoff: ${cashbackAfter.length}`);
  console.log('='.repeat(72));

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }

  await prisma.$executeRaw`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_wager_remainder NUMERIC(20, 2) DEFAULT 0;
  `;

  await prisma.$transaction(async (tx) => {
    for (const w of laterPending) {
      await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'rejected',
          rejectionReason:
            'Откат к первому выводу 100 zł: заявка после среза аннулирована без возврата (баланс из снимка).',
          reviewedBy: 'system-rollback',
          reviewedAt: new Date(),
        },
      });
    }

    await tx.balance.update({
      where: { userId: USER_ID },
      data: {
        amount: targetBalance,
        lastSyncedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (casesToDeduct > 0) {
      const caseRows = await tx.$queryRaw<Array<{ free_cases: number; free_cases_json: unknown }>>`
        SELECT free_cases, free_cases_json FROM balances WHERE user_id = ${USER_ID} FOR UPDATE
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
        WHERE user_id = ${USER_ID}
      `;
    }

    for (const fb of freebetsAfter) {
      if (fb.status === 'available') {
        await tx.$executeRaw`DELETE FROM user_freebets WHERE id = ${fb.id}`;
      }
    }

    await tx.$executeRaw`
      UPDATE users
      SET xp = ${targetXp},
          vip_level = ${targetLevel},
          xp_wager_remainder = ${targetRemainder},
          claimed_vip_rewards = ${targetClaimed},
          last_cashback_claimed_at = ${targetCashbackAt}
      WHERE id = ${USER_ID}
    `;

    await tx.transaction.create({
      data: {
        userId: USER_ID,
        type: 'admin_adjustment',
        amount: Number((targetBalance - currentBalance).toFixed(2)),
        balanceBefore: currentBalance,
        balanceAfter: targetBalance,
        metadata: {
          reason: 'rollback_to_first_100zl_withdrawal',
          firstWithdrawalId: firstWd.id,
          snapshotTxId: snapshotTx.id,
          cancelledWithdrawalIds: laterPending.map((w) => w.id),
          vip: {
            wagerAtCutoff,
            xp: targetXp,
            level: targetLevel,
            claimed: targetClaimed,
            lastCashbackClaimedAt: targetCashbackAt ? targetCashbackAt.toISOString() : null,
            casesDeducted: casesToDeduct,
            freebetsRemoved: freebetsAfter.filter((fb) => fb.status === 'available').map((fb) => fb.id),
          },
        },
      },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId: 'system',
        adminTelegramId: 0n,
        action: 'balance.rollback',
        targetType: 'user',
        targetId: USER_ID,
        payloadBefore: {
          balance: currentBalance,
          xp: user.xp,
          vipLevel: user.vipLevel,
          claimedVipRewards: claimedNow,
          lastCashbackClaimedAt: lastCashbackNow,
        },
        payloadAfter: {
          balance: targetBalance,
          waterline: targetBalance,
          firstWithdrawalId: firstWd.id,
          xp: targetXp,
          vipLevel: targetLevel,
          claimedVipRewards: targetClaimed,
          lastCashbackClaimedAt: targetCashbackAt,
        },
        reason: 'Rollback Albina to first 100 zł withdrawal snapshot (balance + VIP + cashback)',
      },
    });
  });

  await redis.del(
    `balance:${USER_ID}`,
    `rtp:drain:${USER_ID}`,
    `rtp:drain_cooldown:${USER_ID}`,
    `rtp:win_streak:${USER_ID}`,
    `rtp:session_profit:${USER_ID}`,
    `rtp:funnel:${USER_ID}`,
    `rtp:mines_scalp:${USER_ID}`
  );
  await redis.set(`rtp:waterline:${USER_ID}`, String(targetBalance), 'EX', 14 * 24 * 3600);

  console.log('Applied. Balance, VIP rank/rewards, and cashback restored to first WD. Waterline set, no hard drain.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
