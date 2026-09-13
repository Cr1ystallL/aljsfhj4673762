import { PrismaClient } from '@prisma/client';
import { redisClient } from '../lib/redis.js';
import { balanceService } from '../services/balance-service.js';
import { isAdminTelegramIdAsync } from '../middleware/auth.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=== СБРОС БАЛАНСОВ НЕАКТИВНЫХ (>30 ДНЕЙ) И ЗАБЛОКИРОВАННЫХ ИГРОКОВ ===\n');

  try {
    await redisClient.connect();
  } catch {
    // Redis опционален для скрипта
  }

  // 1. Считаем текущие обязательства до очистки
  const initialBalances = await prisma.balance.findMany({
    where: { demoMode: false },
    select: { amount: true },
  });
  const initialLiability = initialBalances.reduce((acc, b) => acc + Number(b.amount), 0);
  console.log(`📊 Текущие обязательства до очистки: ${initialLiability.toFixed(2)} zł (${initialBalances.length} счетов)`);

  // 2. Ищем счета игроков с положительным балансом, которые:
  //    - заблокированы (is_blocked = true)
  //    - ИЛИ не заходили и не совершали действий более 30 дней
  const candidateRows = await prisma.$queryRaw<Array<{
    user_id: string;
    telegram_id: bigint;
    first_name: string | null;
    username: string | null;
    is_blocked: boolean;
    user_created_at: Date;
    user_updated_at: Date;
    balance_amount: string;
    last_session_at: Date | null;
    last_bet_at: Date | null;
    last_tx_at: Date | null;
  }>>`
    SELECT 
      u.id as user_id,
      u.telegram_id,
      u.first_name,
      u.username,
      u.is_blocked,
      u.created_at as user_created_at,
      u.updated_at as user_updated_at,
      b.amount::text as balance_amount,
      (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) as last_session_at,
      (SELECT MAX(bt.placed_at) FROM bets bt WHERE bt.user_id = u.id) as last_bet_at,
      (SELECT MAX(tx.created_at) FROM transactions tx WHERE tx.user_id = u.id) as last_tx_at
    FROM users u
    JOIN balances b ON b.user_id = u.id AND b.demo_mode = false
    WHERE b.amount > 0
      AND (
        u.is_blocked = true
        OR (
          u.created_at < NOW() - INTERVAL '30 days'
          AND u.updated_at < NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM sessions s 
            WHERE s.user_id = u.id AND s.created_at >= NOW() - INTERVAL '30 days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM bets bt 
            WHERE bt.user_id = u.id AND bt.placed_at >= NOW() - INTERVAL '30 days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM transactions tx 
            WHERE tx.user_id = u.id AND tx.created_at >= NOW() - INTERVAL '30 days'
          )
        )
      )
    ORDER BY b.amount DESC
  `;

  // Фильтруем админов — балансы админов никогда не обнуляем
  const accountsToReset: typeof candidateRows = [];
  for (const row of candidateRows) {
    const isAdmin = await isAdminTelegramIdAsync(Number(row.telegram_id));
    if (!isAdmin) {
      accountsToReset.push(row);
    }
  }

  if (accountsToReset.length === 0) {
    console.log('✅ Не найдено неактивных или заблокированных счетов с положительным балансом.');
    return;
  }

  const totalAmountToReset = accountsToReset.reduce((acc, r) => acc + Number(r.balance_amount), 0);
  const blockedCount = accountsToReset.filter((r) => r.is_blocked).length;
  const inactiveCount = accountsToReset.filter((r) => !r.is_blocked).length;

  console.log(`\n📋 Найдено счетов для обнуления: ${accountsToReset.length}`);
  console.log(`   - Заблокированных: ${blockedCount}`);
  console.log(`   - Неактивных (>30 дней): ${inactiveCount}`);
  console.log(`   - Общая сумма к списанию: ${totalAmountToReset.toFixed(2)} zł\n`);

  console.log('Примеры счетов под списание:');
  accountsToReset.slice(0, 15).forEach((r, idx) => {
    const name = r.first_name || r.username || `#${r.telegram_id}`;
    const reason = r.is_blocked ? '🚫 Заблокирован' : '⏳ Неактивен >30д';
    console.log(`  ${idx + 1}. ${name} (${reason}) — ${Number(r.balance_amount).toFixed(2)} zł`);
  });

  console.log('\n⏳ Выполняется обнуление балансов...');

  let successCount = 0;
  let resetSum = 0;

  for (const acc of accountsToReset) {
    const amount = Number(acc.balance_amount);
    if (amount <= 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        // Обнуляем баланс
        await tx.$executeRaw`
          UPDATE balances
          SET amount = 0,
              wager_target = 0,
              auto_rtp_target = 0,
              updated_at = NOW(),
              last_synced_at = NOW(),
              version = version + 1
          WHERE user_id = ${acc.user_id} AND demo_mode = false
        `;

        // Создаем транзакцию списания
        const txId = (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID?.() ||
          `dormant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        const meta = {
          reason: acc.is_blocked ? 'blocked_account_balance_reset' : 'dormant_30d_balance_reset',
          previousAmount: amount,
          resetAt: new Date().toISOString(),
        };

        await tx.$executeRaw`
          INSERT INTO transactions (
            id, user_id, type, amount, balance_before, balance_after, metadata, created_at
          ) VALUES (
            ${txId}, ${acc.user_id}, 'adjustment', ${-amount}::numeric, ${amount}::numeric, 0,
            ${JSON.stringify(meta)}::jsonb, NOW()
          )
        `;
      });

      try {
        await balanceService.invalidateCache(acc.user_id);
      } catch {}

      successCount += 1;
      resetSum += amount;
    } catch (err) {
      console.error(`❌ Ошибка обнуления для пользователя ${acc.user_id}:`, err);
    }
  }

  // 3. Считаем новые обязательства после очистки
  const finalBalances = await prisma.balance.findMany({
    where: { demoMode: false },
    select: { amount: true },
  });
  const finalLiability = finalBalances.reduce((acc, b) => acc + Number(b.amount), 0);

  console.log(`\n========================================`);
  console.log(`✅ УСПЕШНО ЗАВЕРШЕНО!`);
  console.log(`👥 Обнулено счетов: ${successCount} из ${accountsToReset.length}`);
  console.log(`💵 Списано неактивных обязательств: ${resetSum.toFixed(2)} zł`);
  console.log(`📉 Было обязательств: ${initialLiability.toFixed(2)} zł`);
  console.log(`🎯 Стало обязательств: ${finalLiability.toFixed(2)} zł`);
  console.log(`========================================\n`);
}

main()
  .catch(console.error)
  .finally(async () => {
    try {
      await redisClient.disconnect();
    } catch {}
    await prisma.$disconnect();
  });
