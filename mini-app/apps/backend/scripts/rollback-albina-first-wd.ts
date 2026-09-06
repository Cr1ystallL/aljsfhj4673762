import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

/**
 * Roll Albina back to the instant of her first 100 zł withdrawal:
 * keep that 100 zł request pending, cancel later withdrawals without
 * refunding (balance is overwritten from the snapshot), restore the
 * play balance recorded on that withdraw_request transaction.
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

  const laterWds = withdrawals.filter((w) => w.createdAt > firstWd.createdAt);
  const laterPending = laterWds.filter((w) => w.status === 'pending');

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
        metadata: { path: ['requestId'], equals: firstWd.id },
      },
    }));

  if (!snapshotTx) {
    throw new Error(
      `No withdraw_request transaction near ${firstWd.createdAt.toISOString()}`
    );
  }

  const targetBalance = Number(snapshotTx.balanceAfter);
  const currentBalance = Number(user.balance.amount);

  console.log('='.repeat(72));
  console.log(`ROLLBACK ${APPLY ? 'APPLY' : 'PREVIEW'}: ${USER_ID}`);
  console.log(`  TG: ${user.telegramId}  @${user.username || '—'}  ${user.firstName || ''}`);
  console.log(`  First WD: ${firstWd.id}`);
  console.log(`    ${firstWd.createdAt.toISOString()}  ${Number(firstWd.amount).toFixed(2)} zł  [${firstWd.status}]`);
  console.log(`  Snapshot tx: ${snapshotTx.id}`);
  console.log(`    before=${Number(snapshotTx.balanceBefore).toFixed(2)}  after=${targetBalance.toFixed(2)}`);
  console.log(`  Current balance: ${currentBalance.toFixed(2)} zł`);
  console.log(`  Will set balance → ${targetBalance.toFixed(2)} zł  (delta ${ (targetBalance - currentBalance).toFixed(2) })`);
  console.log(`  Keep first WD pending: yes`);
  console.log(`  Later withdrawals to cancel (no refund): ${laterPending.length}`);
  for (const w of laterPending) {
    console.log(`    • ${w.id}  ${w.createdAt.toISOString()}  ${Number(w.amount).toFixed(2)} zł  [${w.status}]`);
  }
  console.log('='.repeat(72));

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const w of laterPending) {
      await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'rejected',
          rejectionReason:
            'Откат аккаунта к первому выводу 100 zł: заявка после среза аннулирована без возврата (баланс восстановлен из снимка).',
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
        payloadBefore: { balance: currentBalance, laterPending: laterPending.map((w) => w.id) },
        payloadAfter: { balance: targetBalance, firstWithdrawalId: firstWd.id },
        reason: 'Rollback Albina to first 100 zł withdrawal snapshot',
      },
    });
  });

  const keys = [
    `balance:${USER_ID}`,
    `rtp:drain:${USER_ID}`,
    `rtp:drain_cooldown:${USER_ID}`,
    `rtp:win_streak:${USER_ID}`,
    `rtp:session_profit:${USER_ID}`,
    `rtp:funnel:${USER_ID}`,
    `rtp:mines_scalp:${USER_ID}`,
  ];
  await redis.del(...keys);

  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  await redis.hset(`rtp:drain:${USER_ID}`, {
    active: '1',
    roundsLeft: '200',
    expiresAt: String(expiresAt),
    reason: 'rollback_albina_first_wd',
  });
  await redis.expire(`rtp:drain:${USER_ID}`, 2 * 60 * 60);

  console.log('Applied. Balance restored, later WDs cancelled, SmartDrain armed for 2h.');
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
