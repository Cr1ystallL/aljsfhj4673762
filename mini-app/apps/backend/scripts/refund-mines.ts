import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function processUser(user: any, lastBonus: any) {
  console.log(`\nОбработка пользователя: ${user.firstName} (ID: ${user.id}, Текущий баланс: ${user.balance})`);
  console.log(`Последний бонус: ${lastBonus.createdAt.toLocaleString()} на сумму ${lastBonus.amount}`);

  // Ищем все ставки в мины ПОСЛЕ получения бонуса
  const minesTxs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      gameType: 'mines',
      createdAt: { gt: lastBonus.createdAt }
    }
  });

  if (minesTxs.length === 0) {
    console.log('  -> Пользователь не играл в мины после получения бонуса.');
    return;
  }

  let totalBets = 0;
  let totalWins = 0;

  for (const tx of minesTxs) {
    if (tx.type === 'bet') totalBets += Math.abs(Number(tx.amount));
    if (tx.type === 'win') totalWins += Math.abs(Number(tx.amount));
  }

  const netLoss = totalBets - totalWins;

  console.log(`  -> Общая сумма ставок: ${totalBets}`);
  console.log(`  -> Общая сумма выигрышей: ${totalWins}`);

  if (netLoss <= 0) {
    console.log(`  ✅ Пользователь в плюсе (или при своих) на ${-netLoss}. Возврат не требуется.`);
    return;
  }

  console.log(`  ❌ Пользователь проиграл ${netLoss} в минах после конкурса.`);
  console.log(`  ⏳ Делаем возврат...`);

  await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: user.id }, select: { balance: true } });
    if (!u) return;

    const newBalance = Number(u.balance) + netLoss;

    await tx.user.update({
      where: { id: user.id },
      data: { balance: newBalance }
    });

    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'refund',
        amount: netLoss,
        balanceBefore: u.balance,
        balanceAfter: newBalance,
        metadata: { reason: 'Возврат проигрыша в минах после бага с хард-режимом' }
      }
    });
  });

  console.log(`  🎉 Возврат успешно выполнен! Новый баланс пользователя: ${Number(user.balance) + netLoss}`);
}

async function main() {
  const arg = process.argv[2];
  
  if (!arg) {
    console.error('Использование: npx tsx refund-mines.ts <telegram_id_пользователя | all>');
    console.error('Пример 1 (один юзер): npx tsx refund-mines.ts 123456789');
    console.error('Пример 2 (все победители): npx tsx refund-mines.ts all');
    process.exit(1);
  }

  if (arg.toLowerCase() === 'all') {
    console.log('Поиск всех пользователей, получавших бонус (приз) за последние 3 дня...');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Находим все недавние бонусы
    const recentBonuses = await prisma.transaction.findMany({
      where: { 
        type: 'bonus',
        createdAt: { gte: threeDaysAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (recentBonuses.length === 0) {
      console.log('За последние 3 дня никто не получал бонусов.');
      process.exit(0);
    }

    // Оставляем только самый последний бонус для каждого юзера
    const latestBonusPerUser = new Map();
    for (const bonus of recentBonuses) {
      if (!latestBonusPerUser.has(bonus.userId)) {
        latestBonusPerUser.set(bonus.userId, bonus);
      }
    }

    console.log(`Найдено ${latestBonusPerUser.size} уникальных победителей. Начинаем проверку и возврат...`);

    for (const [userId, bonus] of latestBonusPerUser.entries()) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await processUser(user, bonus);
      }
    }
    
    console.log('\n=== МАССОВЫЙ ВОЗВРАТ ЗАВЕРШЕН ===');

  } else {
    // Режим для одного пользователя
    const telegramId = arg;
    console.log(`Ищем пользователя с Telegram ID: ${telegramId}...`);
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) {
      console.error('❌ Пользователь не найден.');
      process.exit(1);
    }

    const lastBonus = await prisma.transaction.findFirst({
      where: { userId: user.id, type: 'bonus' },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastBonus) {
      console.log('⚠️ У пользователя нет транзакций типа "bonus" (он не получал призов).');
      process.exit(1);
    }

    await processUser(user, lastBonus);
  }
}

main()
  .catch((e) => {
    console.error('Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
