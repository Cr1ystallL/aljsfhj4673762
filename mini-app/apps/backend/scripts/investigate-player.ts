import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const TARGET_USER_ID = process.argv[2] || '4045bcb0-753c-4ae9-99cd-d70e2a35b39e';

async function main() {
  console.log('='.repeat(80));
  console.log(`🔎 ПОЛНОЕ КРИМИНАЛИСТИЧЕСКОЕ ДОСЬЕ ИГРОКА: ${TARGET_USER_ID}`);
  console.log('='.repeat(80));

  // 1. User Profile
  const user = await prisma.user.findUnique({
    where: { id: TARGET_USER_ID },
    include: {
      balance: true,
      userIpAddresses: { take: 5, orderBy: { lastSeen: 'desc' } },
    }
  });

  if (!user) {
    console.log(`❌ Пользователь с ID ${TARGET_USER_ID} не найден в базе данных.`);
    return;
  }

  console.log('\n👤 1. ПРОФИЛЬ И СЕКЬЮРИТИ-СКОРИНГ:');
  console.log(`   ID:            ${user.id}`);
  console.log(`   Telegram ID:   ${user.telegramId.toString()}`);
  console.log(`   Username:      ${user.username ? '@' + user.username : 'нет'}`);
  console.log(`   Имя:           ${user.firstName || ''} ${user.lastName || ''}`);
  console.log(`   Регистрация:   ${user.createdAt.toISOString()}`);
  console.log(`   Trust Score:   ${user.trustScore} / 100 ${user.trustScore < 50 ? '⚠️ [ПОДОЗРИТЕЛЬНЫЙ]' : '✅ [НОРМА]'}`);
  console.log(`   Hardware Hash: ${user.hardwareHash || 'не зафиксирован'}`);
  console.log(`   Заблокирован:  ${user.isBlocked ? '🔴 ДА (isBlocked = true)' : '🟢 НЕТ'}`);
  console.log(`   Вывод заморож: ${user.withdrawalLocked ? '🔴 ДА (withdrawalLocked = true)' : '🟢 НЕТ'}`);
  console.log(`   Винстрик (DB): ${user.currentWinStreak} (активен: ${user.winStreakActive})`);
  console.log(`   Скрытый долг:  ${Number(user.hiddenDebt).toFixed(2)} PLN`);
  console.log(`   VIP Уровень:   LVL ${user.vipLevel} (${user.xp} XP), забранные награды: [${user.claimedVipRewards.join(', ')}]`);

  if (user.userIpAddresses && user.userIpAddresses.length > 0) {
    console.log(`   IP адреса:     ${user.userIpAddresses.map(ip => `${ip.ipAddress} (визитов: ${ip.count})`).join(', ')}`);
  }

  // 2. Balances & Financials
  const realBal = user.balance;

  console.log('\n💰 2. БАЛАНСЫ:');
  console.log(`   Реальный баланс:  ${Number(realBal?.amount ?? 0).toFixed(2)} PLN`);
  console.log(`   Вейджер оборот:   ${Number(realBal?.wagerProgress ?? 0).toFixed(2)} / ${Number(realBal?.wagerTarget ?? 0).toFixed(2)} PLN`);

  // Deposits & Withdrawals
  const [deposits, withdrawals] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: TARGET_USER_ID, type: 'deposit' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.withdrawalRequest.findMany({
      where: { userId: TARGET_USER_ID },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
  ]);

  const totalDep = deposits.reduce((acc, d) => acc + Number(d.amount), 0);
  const totalWd = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((acc, w) => acc + Number(w.amount), 0);
  const pendingWd = withdrawals
    .filter(w => w.status === 'pending' || w.status === 'review')
    .reduce((acc, w) => acc + Number(w.amount), 0);

  console.log('\n💳 3. ФИНАНСОВАЯ СТАТИСТИКА:');
  console.log(`   Депозитов всего:     ${deposits.length} шт. (Сумма: ${totalDep.toFixed(2)} PLN)`);
  deposits.forEach(d => {
    console.log(`      • ${d.createdAt.toISOString()} -> +${Number(d.amount).toFixed(2)} PLN`);
  });

  console.log(`   Выводов выплачено:   ${totalWd.toFixed(2)} PLN`);
  console.log(`   Выводов на проверке: ${pendingWd.toFixed(2)} PLN`);
  withdrawals.forEach(w => {
    console.log(`      • [${w.status.toUpperCase()}] ${w.createdAt.toISOString()} -> ${Number(w.amount).toFixed(2)} PLN (${w.method || 'unknown'} -> ${w.destination || ''})`);
  });

  const netHouseProfit = totalDep - totalWd - Number(realBal?.amount ?? 0);
  console.log(`   Чистый P&L кассы:    ${netHouseProfit >= 0 ? '+' : ''}${netHouseProfit.toFixed(2)} PLN ${netHouseProfit < 0 ? '⚠️ [КАЗИНО В МИНУСЕ ПО ЭТОМУ ИГРОКУ]' : '✅ [КАЗИНО В ПЛЮСЕ]'}`);

  // 3. Redis RTP State
  const [redisStreak, redisSessionProfit, redisDrain, redisCooldown, redisFunnel] = await Promise.all([
    redis.get(`rtp:win_streak:${TARGET_USER_ID}`),
    redis.get(`rtp:session_profit:${TARGET_USER_ID}`),
    redis.hgetall(`rtp:drain:${TARGET_USER_ID}`),
    redis.get(`rtp:drain_cooldown:${TARGET_USER_ID}`),
    redis.get(`rtp:funnel:${TARGET_USER_ID}`),
  ]);

  console.log('\n⚙️ 4. ТЕКУЩЕЕ СОСТОЯНИЕ В REDIS (RTP & FUNNEL ENGINE):');
  console.log(`   Винстрик (Redis):     ${redisStreak || '0'}`);
  console.log(`   Профит сессии (1ч):   ${redisSessionProfit ? Number(redisSessionProfit).toFixed(2) : '0.00'} PLN`);
  console.log(`   SmartDrain активен:   ${redisDrain && redisDrain.active === '1' ? '🔴 ДА' : '🟢 НЕТ'}`);
  if (redisDrain && redisDrain.active === '1') {
    const minLeft = Math.max(0, Math.round((Number(redisDrain.expiresAt) - Date.now()) / 60000));
    console.log(`      -> Осталось раундов слива: ${redisDrain.roundsLeft}`);
    console.log(`      -> Истекает через:         ${minLeft} мин.`);
    console.log(`      -> Причина активации:      ${redisDrain.reason}`);
  }
  console.log(`   Drain кулдаун:        ${redisCooldown ? 'ДА (активен)' : 'НЕТ'}`);
  if (redisFunnel) {
    try {
      const f = JSON.parse(redisFunnel);
      console.log(`   Воронка (Funnel):     Фаза [${f.phase.toUpperCase()}], bias: ${f.bias}, targetPeak: ${f.targetPeakMultiplier}x`);
    } catch {}
  }

  // 4. Game Sessions
  const sessions = await prisma.gameSession.findMany({
    where: { userId: TARGET_USER_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('\n🕹️ 5. ИГРОВЫЕ СЕССИИ:');
  sessions.forEach(s => {
    console.log(`   • Сессия ${s.id.slice(0, 8)}... | Старт баланс: ${Number(s.startBalance).toFixed(2)} PLN | Создана: ${s.createdAt.toISOString()} | Акт: ${s.lastActivityAt.toISOString()}`);
  });

  // 5. Recent Bets & Rounds (Detailed Analysis)
  const recentBets = await prisma.bet.findMany({
    where: { userId: TARGET_USER_ID },
    orderBy: { placedAt: 'desc' },
    take: 35,
  });

  console.log('\n🎲 6. ПОСЛЕДНИЕ 35 СТАВОК (ХРОНОЛОГИЯ ИГРЫ):');
  console.log('─'.repeat(85));
  console.log(
    'Время (UTC)'.padEnd(20) +
    'Игра'.padEnd(10) +
    'Ставка'.padEnd(12) +
    'Множитель'.padEnd(12) +
    'Выплата'.padEnd(14) +
    'Результат'
  );
  console.log('─'.repeat(85));

  for (const b of recentBets) {
    const isWin = Number(b.payout ?? 0) > Number(b.amount);
    const timeStr = b.placedAt.toISOString().slice(11, 19);
    const game = b.gameType.padEnd(10);
    const stakeStr = `${Number(b.amount).toFixed(2)} zł`.padEnd(12);
    const multStr = b.multiplier ? `${Number(b.multiplier).toFixed(2)}x`.padEnd(12) : '-'.padEnd(12);
    const payoutStr = `${Number(b.payout ?? 0).toFixed(2)} zł`.padEnd(14);
    const resStr = isWin ? `🟢 ВЫИГРЫШ (+${(Number(b.payout) - Number(b.amount)).toFixed(2)})` : '🔴 СЛИВ';

    let metaStr = '';
    if (b.metadata && typeof b.metadata === 'object') {
      const m = b.metadata as any;
      if (m.mineCount) metaStr = ` [Мин: ${m.mineCount}]`;
    }

    console.log(`${timeStr}  ${game}${stakeStr}${multStr}${payoutStr}${resStr}${metaStr}`);
  }
  console.log('─'.repeat(85));

  console.log('\n✅ Досье сформировано успешно.\n');
}

main()
  .catch(err => {
    console.error('Ошибка выполнения скрипта:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
