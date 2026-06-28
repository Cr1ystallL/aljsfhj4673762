import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const telegramId = process.argv[2];
  
  if (!telegramId) {
    console.error('Использование: npx tsx refund-mines.ts <telegram_id_пользователя>');
    console.error('Пример: npx tsx refund-mines.ts 123456789');
    process.exit(1);
  }

  console.log(`Ищем пользователя с Telegram ID: ${telegramId}...`);
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });

  if (!user) {
    console.error('❌ Пользователь не найден.');
    process.exit(1);
  }

  console.log(`Пользователь найден: ${user.firstName} (Баланс: ${user.balance})`);

  // Ищем последний бонус (выигрыш в конкурсе)
  const lastBonus = await prisma.transaction.findFirst({
    where: { userId: user.id, type: 'bonus' },
    orderBy: { createdAt: 'desc' }
  });

  if (!lastBonus) {
    console.log('⚠️ У пользователя нет транзакций типа "bonus" (он не получал призов).');
    process.exit(1);
  }

  console.log(`Последний бонус получен: ${lastBonus.createdAt.toLocaleString()} на сумму ${lastBonus.amount}`);

  // Ищем все ставки в мины ПОСЛЕ получения бонуса
  const minesTxs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      gameType: 'mines',
      createdAt: { gt: lastBonus.createdAt }
    }
  });

  if (minesTxs.length === 0) {
    console.log('Пользователь не играл в мины после получения бонуса.');
    process.exit(0);
  }

  let totalBets = 0;
  let totalWins = 0;

  for (const tx of minesTxs) {
    if (tx.type === 'bet') totalBets += Number(tx.amount);
    if (tx.type === 'win') totalWins += Number(tx.amount);
  }

  const netLoss = totalBets - totalWins;

  console.log(`Ставки в мины: ${totalBets}`);
  console.log(`Выигрыши в мины: ${totalWins}`);

  if (netLoss <= 0) {
    console.log(`✅ Пользователь в плюсе (или при своих) на ${-netLoss}. Возврат не требуется.`);
    process.exit(0);
  }

  console.log(`❌ Пользователь проиграл ${netLoss} в минах после конкурса.`);
  console.log(`⏳ Делаем возврат...`);

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

  console.log(`🎉 Возврат успешно выполнен! Новый баланс пользователя: ${Number(user.balance) + netLoss}`);
}

main()
  .catch((e) => {
    console.error('Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
