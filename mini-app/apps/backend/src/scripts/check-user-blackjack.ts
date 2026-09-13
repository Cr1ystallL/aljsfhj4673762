import { PrismaClient } from '@prisma/client';
import { redisClient } from '../lib/redis.js';

const prisma = new PrismaClient();

async function main() {
  try {
    await redisClient.connect();
  } catch {}

  const targetArg = process.argv[2] || '1862215959';
  console.log(`\n========================================================================`);
  console.log(`♠️♥️ ДЕТАЛЬНЫЙ АНАЛИЗ БЛЕКДЖЕКА ДЛЯ ИГРОКА: ${targetArg} ♦️♣️`);
  console.log(`========================================================================\n`);

  const isNumeric = /^\d+$/.test(targetArg);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: targetArg },
        ...(isNumeric ? [{ telegramId: BigInt(targetArg) }] : []),
        { username: { equals: targetArg, mode: 'insensitive' } },
      ],
    },
    include: {
      balance: true,
    },
  });

  if (!user) {
    console.log(`❌ Пользователь ${targetArg} не найден в базе данных!`);
    await prisma.$disconnect();
    return;
  }

  const curBal = Number(user.balance?.amount ?? 0);
  const wTar = Number(user.balance?.wagerTarget ?? 0);
  const wProg = Number(user.balance?.wagerProgress ?? 0);
  const remWager = Math.max(0, wTar - wProg);

  console.log(`👤 ПРОФИЛЬ:`);
  console.log(`- Имя: ${user.firstName || ''} ${user.lastName || ''} (@${user.username || 'нет'})`);
  console.log(`- Telegram ID: ${user.telegramId}`);
  console.log(`- User ID: ${user.id}`);
  console.log(`- Баланс сейчас: ${curBal.toFixed(2)} zł`);
  console.log(`- Вейджер: ${wProg.toFixed(2)} / ${wTar.toFixed(2)} zł (Осталось: ${remWager.toFixed(2)} zł)`);
  console.log(`- Вывод заблокирован: ${user.withdrawalLocked ? '⛔ ДА' : '✅ НЕТ'}`);
  console.log(`- Аккаунт в бане: ${user.isBlocked ? '⛔ ДА' : '✅ НЕТ'}`);

  // Redis RTP and Drain status
  try {
    const drainRaw = await redisClient.getClient().get(`user:drain:${user.id}`);
    const rtpUserRaw = await redisClient.getClient().hgetall(`rtp:user:${user.id}`);
    const waterlineRaw = await redisClient.getClient().get(`rtp:waterline:${user.id}`);
    console.log(`\n⚙️ СОСТОЯНИЕ RTP / ДРЕЙН В REDIS:`);
    console.log(`- SmartDrain: ${drainRaw ? drainRaw : 'не активен'}`);
    console.log(`- Waterline: ${waterlineRaw ? `${waterlineRaw} zł` : 'нет'}`);
    console.log(`- RTP User Load: ${rtpUserRaw?.load ? rtpUserRaw.load : '0'}`);
  } catch (e) {
    console.log(`- Redis: ошибка чтения ключей`);
  }

  // Общие депозиты и выводы
  const [depSumRow, wdSumRow] = await Promise.all([
    prisma.$queryRaw<Array<{ sum: number }>>`
      SELECT COALESCE(SUM(amount), 0) as sum FROM transactions WHERE user_id = ${user.id} AND type = 'deposit'
    `,
    prisma.$queryRaw<Array<{ sum: number }>>`
      SELECT COALESCE(SUM(amount), 0) as sum FROM withdrawal_requests WHERE user_id = ${user.id} AND status IN ('completed', 'approved', 'paid')
    `,
  ]);
  const depTotal = Number(depSumRow[0]?.sum || 0);
  const wdTotal = Number(wdSumRow[0]?.sum || 0);

  console.log(`\n💵 ОБЩАЯ КАССА ИГРОКА:`);
  console.log(`- Внес депозитов: ${depTotal.toFixed(2)} zł`);
  console.log(`- Вывел из казино: ${wdTotal.toFixed(2)} zł`);
  console.log(`- Итоговый профит казино по игроку: ${(depTotal - wdTotal).toFixed(2)} zł`);

  // Статистика Блекджека
  const bjBets = await prisma.bet.findMany({
    where: {
      userId: user.id,
      gameType: 'blackjack',
    },
    orderBy: { placedAt: 'desc' },
  });

  if (bjBets.length === 0) {
    console.log(`\n❌ У игрока НЕТ ни одной ставки в блекджеке!`);
    await prisma.$disconnect();
    return;
  }

  let totalWagered = 0;
  let totalPayout = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let blackjacks = 0;
  let doubles = 0;

  for (const b of bjBets) {
    const amt = Number(b.amount);
    const pay = Number(b.payout ?? 0);
    totalWagered += amt;
    totalPayout += pay;

    const meta = (b.metadata as any) || {};
    const res = meta.result || (pay > amt ? 'win' : pay === amt ? 'push' : 'lose');
    if (res === 'blackjack') {
      blackjacks++;
      wins++;
    } else if (res === 'win' || pay > amt) {
      wins++;
    } else if (res === 'push' || pay === amt) {
      pushes++;
    } else {
      losses++;
    }

    if (meta.action === 'double' || meta.doubled) {
      doubles++;
    }
  }

  const netProfitPlayer = totalPayout - totalWagered;
  const actualRtp = totalWagered > 0 ? (totalPayout / totalWagered) * 100 : 0;
  const winRate = ((wins / bjBets.length) * 100).toFixed(1);

  console.log(`\n🃏 СТАТИСТИКА В БЛЕКДЖЕКЕ:`);
  console.log(`- Всего сыграно раундов: ${bjBets.length}`);
  console.log(`- Сумма ставок (Оборот): ${totalWagered.toFixed(2)} zł`);
  console.log(`- Сумма выигрышей: ${totalPayout.toFixed(2)} zł`);
  console.log(`- Чистый профит игрока: ${netProfitPlayer >= 0 ? `+${netProfitPlayer.toFixed(2)}` : netProfitPlayer.toFixed(2)} zł`);
  console.log(`- Фактический RTP игрока: ${actualRtp.toFixed(2)}% ${actualRtp > 100 ? '🚨 (ИГРОК В ПЛЮСЕ!)' : '📉 (Казино в плюсе)'}`);
  console.log(`- Побед: ${wins} (${winRate}%) [из них натуральных блекджеков: ${blackjacks}]`);
  console.log(`- Ничьих (Push): ${pushes}`);
  console.log(`- Поражений: ${losses}`);
  console.log(`- Удвоений (Double): ${doubles}`);

  // Последние 15 раундов
  console.log(`\n📜 ПОСЛЕДНИЕ 15 РАУНДОВ БЛЕКДЖЕКА:`);
  console.log(`-----------------------------------------------------------------------------------------`);
  console.log(`Дата и время       | Ставка    | Выигрыш   | Коэф  | Исход      | Карты / Инфо`);
  console.log(`-----------------------------------------------------------------------------------------`);

  for (const b of bjBets.slice(0, 15)) {
    const amt = Number(b.amount).toFixed(2).padStart(8);
    const pay = Number(b.payout ?? 0).toFixed(2).padStart(8);
    const mult = Number(b.multiplier ?? 0).toFixed(2).padStart(5);
    const meta = (b.metadata as any) || {};
    const res = (meta.result || (Number(b.payout) > Number(b.amount) ? 'WIN' : Number(b.payout) === Number(b.amount) ? 'PUSH' : 'LOSE')).toUpperCase().padEnd(10);
    const dateStr = b.placedAt.toISOString().replace('T', ' ').slice(0, 19);
    
    let handInfo = '';
    if (meta.playerHand) {
      const cards = Array.isArray(meta.playerHand) ? meta.playerHand.map((c: any) => `${c.rank}${c.suit?.[0] || ''}`).join(' ') : '';
      handInfo = `Карты: [${cards}]`;
    }
    if (meta.dealerHand) {
      const dcards = Array.isArray(meta.dealerHand) ? meta.dealerHand.map((c: any) => `${c.rank}${c.suit?.[0] || ''}`).join(' ') : '';
      handInfo += ` | Дилер: [${dcards}]`;
    }

    console.log(`${dateStr} | ${amt} zł | ${pay} zł | x${mult} | ${res} | ${handInfo}`);
  }
  console.log(`-----------------------------------------------------------------------------------------\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Ошибка скрипта:', err);
  process.exit(1);
});
