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
    const b = await tx.balance.findUnique({ where: { userId: user.id } });
    if (!b) return;

    const oldBalance = Number(b.amount);
    const newBalance = oldBalance + netLoss;

    await tx.balance.update({
      where: { userId: user.id },
      data: { amount: newBalance }
    });

    await tx.transaction.create({
      data: {
        userId: user.id,
        type: 'refund',
        amount: netLoss,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        metadata: { reason: 'Возврат проигрыша в минах после бага с хард-режимом' }
      }
    });
  });

  console.log(`  🎉 Возврат успешно выполнен!`);
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

  } else if (arg.toLowerCase() === 'auto') {
    console.log('--- АВТОМАТИЧЕСКИЙ ПОИСК ПОСЛЕДНИХ ТУРНИРОВ И КОНКУРСОВ ---');
    
    const userIdsToRefund = new Set<string>();
    // Храним фейковый объект lastBonus с правильным временем (время выплаты приза)
    const userBonuses = new Map<string, any>();

    // 1. Ищем последний выплаченный конкурс
    const lastContest = await prisma.contest.findFirst({
      where: { state: 'paid' },
      orderBy: { endsAt: 'desc' }
    });

    if (lastContest && lastContest.resolvedWinners) {
      console.log(`✅ Нашёлся последний конкурс: "${lastContest.title}" (ID: ${lastContest.id})`);
      const winners = lastContest.resolvedWinners as any[];
      for (const w of winners) {
        if (w.userId) {
          userIdsToRefund.add(w.userId);
          // Вместо поиска случайного последнего бонуса (который может быть ежедневкой),
          // мы жестко задаем время выплаты конкурса как точку отсчета.
          userBonuses.set(w.userId, {
            amount: w.amount,
            createdAt: lastContest.updatedAt
          });
        }
      }
      console.log(`   -> Добавлено ${winners.length} победителей конкурса.`);
    } else {
      console.log('⚠️ Выплаченных конкурсов не найдено.');
    }

    // 2. Ищем последний выплаченный турнир (цикл)
    const lastCycle = await prisma.tournamentCycle.findFirst({
      where: { state: 'paid' },
      orderBy: { endsAt: 'desc' }
    });

    if (lastCycle) {
      console.log(`✅ Нашёлся последний завершенный турнир (Цикл ID: ${lastCycle.id})`);
      
      const cycleBonuses = await prisma.$queryRaw<any[]>`
        SELECT id, user_id as "userId", amount, created_at as "createdAt"
        FROM transactions 
        WHERE type = 'bonus' 
          AND metadata->>'tournamentCycleId' = ${lastCycle.id}
      `;

      for (const b of cycleBonuses) {
        userIdsToRefund.add(b.userId);
        // Точка отсчета - точное время создания бонусной транзакции за турнир
        userBonuses.set(b.userId, {
          amount: b.amount,
          createdAt: b.createdAt
        });
      }
      console.log(`   -> Добавлено ${cycleBonuses.length} победителей турнира.`);
    } else {
      console.log('⚠️ Выплаченных турнирных циклов не найдено.');
    }

    if (userIdsToRefund.size === 0) {
      console.log('❌ Не найдено ни одного победителя. Выход.');
      process.exit(0);
    }

    console.log(`\nНайдено ${userIdsToRefund.size} уникальных победителей. Начинаем возврат...`);

    for (const userId of userIdsToRefund) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const lastBonus = userBonuses.get(userId);
      if (user && lastBonus) {
        await processUser(user, lastBonus);
      }
    }

    console.log('\n=== АВТОМАТИЧЕСКИЙ ВОЗВРАТ ЗАВЕРШЕН ===');

  } else {
    // Режим для одного или нескольких пользователей (через запятую)
    const telegramIds = arg.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    console.log(`Ищем пользователей с Telegram ID: ${telegramIds.join(', ')}...`);
    
    for (const telegramId of telegramIds) {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) }
      });

      if (!user) {
        console.error(`❌ Пользователь с Telegram ID ${telegramId} не найден. Пропускаем.`);
        continue;
      }

      const lastBonus = await prisma.transaction.findFirst({
        where: { userId: user.id, type: 'bonus' },
        orderBy: { createdAt: 'desc' }
      });

      if (!lastBonus) {
        console.log(`⚠️ У пользователя ${telegramId} нет транзакций типа "bonus". Пропускаем.`);
        continue;
      }

      await processUser(user, lastBonus);
    }
    console.log('\n=== ВОЗВРАТ ПО СПИСКУ ЗАВЕРШЕН ===');
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
