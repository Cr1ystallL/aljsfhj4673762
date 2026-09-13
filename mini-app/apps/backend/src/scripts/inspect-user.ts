import { PrismaClient } from '@prisma/client';
import { redisClient } from '../lib/redis.js';
import { isAdminTelegramIdAsync } from '../middleware/auth.js';

const prisma = new PrismaClient();

async function main() {
  try {
    await redisClient.connect();
  } catch {}

  const targetTgId = process.argv[2] ? BigInt(process.argv[2]) : BigInt('920409454');
  console.log(`=== INSPECTION OF PLAYER TG: ${targetTgId} ===\n`);

  const user = await prisma.user.findUnique({
    where: { telegramId: targetTgId },
    include: {
      balance: true,
    },
  });

  if (!user) {
    console.log(`❌ Пользователь с Telegram ID ${targetTgId} не найден в базе данных!`);
    await prisma.$disconnect();
    return;
  }

  const isAdmin = await isAdminTelegramIdAsync(Number(user.telegramId));

  // Получаем транзакции
  const txRows = await prisma.$queryRaw<Array<{
    type: string;
    sum_amount: string;
    tx_count: bigint;
    last_tx: Date | null;
  }>>`
    SELECT 
      type,
      COALESCE(SUM(amount), 0)::text as sum_amount,
      COUNT(*)::bigint as tx_count,
      MAX(created_at) as last_tx
    FROM transactions
    WHERE user_id = ${user.id}
    GROUP BY type
  `;

  // Macvpay orders
  const orders = await prisma.$queryRaw<Array<{
    status: string;
    total_requested: string;
    total_paid: string;
    cnt: bigint;
    last_order: Date | null;
  }>>`
    SELECT 
      status,
      COALESCE(SUM(requested_amount), 0)::text as total_requested,
      COALESCE(SUM(paid_amount), 0)::text as total_paid,
      COUNT(*)::bigint as cnt,
      MAX(created_at) as last_order
    FROM macvpay_orders
    WHERE user_id = ${user.id}
    GROUP BY status
  `;

  // Ставки
  const betStats = await prisma.$queryRaw<Array<{
    bet_count: bigint;
    total_wagered: string;
    total_payout: string;
  }>>`
    SELECT 
      COUNT(*)::bigint as bet_count,
      COALESCE(SUM(amount), 0)::text as total_wagered,
      COALESCE(SUM(payout), 0)::text as total_payout
    FROM bets
    WHERE user_id = ${user.id}
  `;

  // Заявки на вывод
  const wdRequests = await prisma.$queryRaw<Array<{
    id: string;
    amount: string;
    status: string;
    created_at: Date;
  }>>`
    SELECT id, amount::text, status, created_at
    FROM withdrawal_requests
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const curBal = Number(user.balance?.amount ?? 0);
  const wTar = Number(user.balance?.wagerTarget ?? 0);
  const wProg = Number(user.balance?.wagerProgress ?? 0);
  const remWager = Math.max(0, wTar - wProg);

  // Считаем общий объем депозитов
  const depTx = txRows.find(t => t.type === 'deposit');
  const depTxSum = Number(depTx?.sum_amount ?? 0);
  const depTxCount = Number(depTx?.tx_count ?? 0);

  const foluxCredited = orders.find(o => o.status === 'credited' || o.status === 'paid');
  const foluxSum = Number(foluxCredited?.total_paid || foluxCredited?.total_requested || 0);

  const totalDeposits = Math.max(depTxSum, foluxSum);

  console.log('📋 ПРОФИЛЬ ИГРОКА:');
  console.log(`- ID в базе: ${user.id}`);
  console.log(`- Telegram ID: ${user.telegramId}`);
  console.log(`- Имя / Ник: ${user.firstName || ''} ${user.lastName || ''} (@${user.username || 'нет'})`);
  console.log(`- Зарегистрирован: ${user.createdAt.toISOString()}`);
  console.log(`- Роль: ${isAdmin ? '🔴 АДМИНИСТРАТОР' : '🟢 ОБЫЧНЫЙ ИГРОК'}`);
  console.log(`- Статус блокировки: ${user.isBlocked ? '⛔ ЗАБЛОКИРОВАН' : '✅ Активен'}`);
  console.log(`- Заморозка вывода: ${user.withdrawalLocked ? '⛔ ЗАМОРОЖЕН' : '✅ Разрешен'}`);
  console.log(`- VIP Уровень: ${user.vipLevel} (XP: ${user.xp})`);

  console.log('\n💰 ТЕКУЩИЙ БАЛАНС И ВЕЙДЖЕР:');
  console.log(`- Баланс: ${curBal.toFixed(2)} zł`);
  console.log(`- Вейджер цель: ${wTar.toFixed(2)} zł`);
  console.log(`- Вейджер прогресс: ${wProg.toFixed(2)} zł`);
  console.log(`- Осталось отыграть: ${remWager.toFixed(2)} zł (${remWager === 0 ? '✅ Вейджер закрыт' : '⏳ В процессе'})`);

  console.log('\n💳 ИСТОРИЯ ФИНАНСОВ:');
  console.log(`- Всего внесено депозитов: ${totalDeposits.toFixed(2)} zł (Транзакций: ${depTxCount})`);
  console.log(`- Последний депозит: ${depTx?.last_tx ? depTx.last_tx.toISOString() : 'Никогда'}`);
  console.log(`- Всего ставок: ${betStats[0]?.bet_count ?? 0}`);
  console.log(`- Оборот ставок: ${Number(betStats[0]?.total_wagered ?? 0).toFixed(2)} zł`);
  console.log(`- Выиграно по ставкам: ${Number(betStats[0]?.total_payout ?? 0).toFixed(2)} zł`);

  if (wdRequests.length > 0) {
    console.log('\n📤 ЗАЯВКИ НА ВЫВОД:');
    for (const w of wdRequests) {
      console.log(`  * ${w.created_at.toISOString()}: ${Number(w.amount).toFixed(2)} zł [${w.status}]`);
    }
  }

  console.log('\n========================================================================');
  console.log('🔮 СЦЕНАРИЙ: ЧТО БУДЕТ, ЕСЛИ ИГРОК СЕЙЧАС ДЕПНЕТ 100 zł:');
  console.log('========================================================================');

  const simulatedBal = curBal + 100;
  const simulatedWTar = wTar + 200; // x2 вейджер на депозит
  const simulatedRemWager = Math.max(0, simulatedWTar - wProg);
  const simulatedLifetimeDeposits = totalDeposits + 100;

  console.log(`1. БАЛАНС: станет ${(simulatedBal).toFixed(2)} zł (+100.00 zł).`);
  console.log(`2. КАССА КАЗИНО: Депозиты вырастут на +100.00 zł (чистый профит казино увеличится на +100 zł).`);
  console.log(`3. УСЛОВИЕ МИНИМАЛЬНОГО ДЕПОЗИТА: ВЫПОЛНЕНО (Будет ${simulatedLifetimeDeposits.toFixed(2)} zł >= 100.00 zł).`);
  console.log(`4. УСЛОВИЕ СВЕЖЕГО ДЕПОЗИТА (<30 ДНЕЙ): ВЫПОЛНЕНО.`);
  console.log(`5. ВЕЙДЖЕР: Система начислит х2 оборот на сумму депозита (+200 zł к wager_target).`);
  console.log(`   - Новая цель вейджера: ${simulatedWTar.toFixed(2)} zł`);
  console.log(`   - Текущий прогресс: ${wProg.toFixed(2)} zł`);
  console.log(`   - Остаток к отыгрышу: ${simulatedRemWager.toFixed(2)} zł.`);
  console.log(`\n6. СТАТУС ВЫВОДА СРАЗУ ПОСЛЕ ДЕПОЗИТА (без игры):`);
  console.log(`   ⛔ ВЫВЕСТИ СРАЗУ НЕ СМОЖЕТ!`);
  console.log(`   При попытке вывести система выдаст ошибку:`);
  console.log(`   "Вам необходимо отыграть вейджер. Осталось: ${simulatedRemWager.toFixed(2)} PLN".`);
  console.log(`\n7. ВЛИЯНИЕ НА "ОБЯЗАТЕЛЬСТВА" В АДМИНКЕ:`);
  console.log(`   - В блоке "Обязательства" сразу после депозита он НЕ войдет в число готовых к выводу,`);
  console.log(`     так как вейджер еще не закрыт (${simulatedRemWager.toFixed(2)} zł осталось).`);
  console.log(`   - Сумма 100 zł войдет в "Всего на счетах" (+100 zł к общей массе).`);
  console.log(`\n8. ДАЛЬНЕЙШИЙ ИСХОД ПРИ ИГРЕ:`);
  console.log(`   Вариант А: Игрок делает ставок на ${simulatedRemWager.toFixed(2)} zł и сливает часть/всё:`);
  console.log(`     -> Казино зарабатывает математическое преимущество (RTP 95% = ~10 zł с оборота 200 zł).`);
  console.log(`     -> Если баланс падает до 0 — казино фиксирует +100 zł чистой прибыли.`);
  console.log(`   Вариант Б: Игрок отыгрывает ${simulatedRemWager.toFixed(2)} zł и сохраняет баланс >= 50 zł:`);
  console.log(`     -> Вейджер считается выполненным (wager_progress >= wager_target).`);
  console.log(`     -> Игрок получает право вывести деньги.`);
  console.log(`     -> Его баланс попадает в "Обязательства к выводу" в консоли админа.`);
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
