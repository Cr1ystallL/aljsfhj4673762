import { PrismaClient } from '@prisma/client';
import { redis } from '../lib/redis.js';

const prisma = new PrismaClient();

// Целевое время отката (01:00 28.06.2026 MSK/Киев = 22:00 27.06.2026 UTC)
const TARGET_TIME = new Date('2026-06-27T22:00:00.000Z');

async function main() {
  console.log(`[ROLLBACK] Начинаем откат всех балансов к состоянию на ${TARGET_TIME.toISOString()}...`);

  // Находим всех пользователей, у которых были транзакции ПОСЛЕ целевого времени
  const usersWithChanges = await prisma.transaction.findMany({
    where: { createdAt: { gte: TARGET_TIME } },
    select: { userId: true },
    distinct: ['userId'],
  });

  console.log(`[ROLLBACK] Найдено пользователей с изменениями после указанного времени: ${usersWithChanges.length}`);

  let successCount = 0;

  for (const { userId } of usersWithChanges) {
    // Ищем самую первую транзакцию после указанного времени
    const firstTxAfter = await prisma.transaction.findFirst({
      where: { userId, createdAt: { gte: TARGET_TIME } },
      orderBy: { createdAt: 'asc' },
    });

    if (firstTxAfter) {
      // Это баланс пользователя ДО того, как случилась эта первая транзакция
      const targetBalance = Number(firstTxAfter.balanceBefore);
      const newWagerTarget = targetBalance * 2;

      const currentBalance = await prisma.balance.findUnique({
        where: { userId },
      });

      if (!currentBalance) {
        console.warn(`[ROLLBACK] Пользователь ${userId} не имеет записи баланса, пропускаем.`);
        continue;
      }

      const beforeAmount = Number(currentBalance.amount);

      // Обновляем баланс
      await prisma.balance.update({
        where: { userId },
        data: {
          amount: targetBalance,
          wagerTarget: newWagerTarget,
          wagerProgress: 0,
        },
      });

      // Пишем в лог для аудита
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: 'system',
          adminTelegramId: 0n,
          action: 'balance.rollback',
          targetType: 'user',
          targetId: userId,
          payloadBefore: { balance: beforeAmount, wagerTarget: Number(currentBalance.wagerTarget), wagerProgress: Number(currentBalance.wagerProgress) },
          payloadAfter: { balance: targetBalance, wagerTarget: newWagerTarget, wagerProgress: 0 },
          reason: 'Mass rollback to 01:00 28.06.2026',
        },
      });

      // Сбрасываем кэш в Redis
      await redis.del(`balance:${userId}`);

      console.log(`[ROLLBACK] Пользователь ${userId}: Баланс откачен с ${beforeAmount} до ${targetBalance}. Вейджер установлен на ${newWagerTarget}.`);
      successCount++;
    }
  }

  console.log(`[ROLLBACK] Завершено. Откачено балансов: ${successCount}`);
}

main()
  .catch((e) => {
    console.error('[ROLLBACK] Ошибка во время выполнения отката:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
