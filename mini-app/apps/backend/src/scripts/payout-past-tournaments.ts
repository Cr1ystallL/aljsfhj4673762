import { PrismaClient } from '@prisma/client';
import { payoutCycle } from '../routes/tournaments.js';
import { redisClient } from '../lib/redis.js';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function main() {
  console.log('=== MACVBET TOURNAMENT PAYOUT SCRIPT ===\n');

  try {
    await redisClient.connect();
  } catch {
    // Redis connection optional in standalone script
  }

  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto') || args.includes('-y') || args.includes('--yes') || !process.stdin.isTTY;
  const targetId = args.find((arg) => !arg.startsWith('-'));

  const now = new Date();
  const cyclesToSettle: any[] = [];

  if (targetId) {
    const cycle = await prisma.tournamentCycle.findUnique({
      where: { id: targetId },
      include: { tournament: true },
    });
    if (!cycle) {
      console.log(`❌ Цикл с ID "${targetId}" не найден.`);
      return;
    }
    cyclesToSettle.push(cycle);
    console.log(`🎯 Выбран конкретный цикл: ${cycle.id} (${cycle.tournament.title}, статус: ${cycle.state})`);
  } else {
    // 1. Find live cycles past endsAt
    const liveExpired = await prisma.tournamentCycle.findMany({
      where: {
        state: 'live',
        endsAt: { lte: now },
      },
      include: { tournament: true },
      orderBy: { endsAt: 'desc' },
    });
    cyclesToSettle.push(...liveExpired);

    // 2. Find ended cycles that have 0 prize transactions and at least 1 participant
    const endedCandidates = await prisma.tournamentCycle.findMany({
      where: {
        state: 'ended',
        endsAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
      },
      include: { tournament: true },
      orderBy: { endsAt: 'desc' },
    });

    for (const c of endedCandidates) {
      const txCount = await prisma.transaction.count({
        where: {
          type: 'tournament_prize',
          metadata: { path: ['cycleId'], equals: c.id },
        },
      });
      if (txCount === 0) {
        const pCount = await prisma.tournamentParticipant.count({
          where: { cycleId: c.id },
        });
        if (pCount > 0) {
          cyclesToSettle.push(c);
        }
      }
    }
  }

  if (cyclesToSettle.length === 0) {
    console.log('✅ Нет турниров, ожидающих выплаты призов.');
    console.log('\nПоследние завершенные турниры:');
    const recentEnded = await prisma.tournamentCycle.findMany({
      where: { state: 'ended' },
      orderBy: { endsAt: 'desc' },
      take: 3,
      include: { tournament: true },
    });
    for (const c of recentEnded) {
      const txs = await prisma.transaction.count({
        where: { type: 'tournament_prize', metadata: { path: ['cycleId'], equals: c.id } },
      });
      console.log(`- "${c.tournament.title}" (ID: ${c.id}): завершен ${c.endsAt.toLocaleString()}, призов выдано: ${txs}`);
    }
    return;
  }

  console.log(`📋 Найдено циклов для выплаты призов: ${cyclesToSettle.length}\n`);

  for (const cycle of cyclesToSettle) {
    console.log(`--------------------------------------------------`);
    console.log(`🏆 Турнир: "${cycle.tournament.title}"`);
    console.log(`🆔 ID цикла: ${cycle.id}`);
    console.log(`📊 Статус: ${cycle.state}, Окончание: ${cycle.endsAt.toLocaleString()}`);
    console.log(`💰 Призовой фонд: ${cycle.prizePool} PLN (Победителей: ${cycle.tournament.winnersCount})`);

    const participants = await prisma.tournamentParticipant.findMany({
      where: { cycleId: cycle.id },
      include: { user: { select: { username: true, firstName: true, telegramId: true } } },
      orderBy: [{ balance: 'desc' }, { reachedAt: 'asc' }],
    });

    console.log(`👥 Участников: ${participants.length}`);
    participants.slice(0, 10).forEach((p, i) => {
      const name = p.user.firstName || p.user.username || p.userId;
      console.log(`   ${i + 1}. ${name} — Баланс: ${p.balance} (bets: ${(p as any).betsCount ?? 0})`);
    });

    let shouldPay = autoMode;
    if (!autoMode) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`\nВыплатить призы за этот турнир? (y/N): `, resolve);
      });
      rl.close();
      shouldPay = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    }

    if (shouldPay) {
      console.log(`\n⏳ Выполняется начисление призов...`);
      try {
        const result = await payoutCycle(cycle.tournament, cycle);
        console.log(`✅ Призы успешно начислены! Победителей награждено: ${result.winnersPaid}`);

        // Display who got paid
        const prizeTxs = await prisma.transaction.findMany({
          where: {
            type: 'tournament_prize',
            metadata: { path: ['cycleId'], equals: cycle.id },
          },
          include: { user: { select: { firstName: true, username: true } } },
        });
        prizeTxs.forEach((tx) => {
          const u = tx.user.firstName || tx.user.username;
          console.log(`   💵 ${u}: +${tx.amount} PLN`);
        });
      } catch (err) {
        console.error(`❌ Ошибка при начислении призов:`, err);
      }
    } else {
      console.log('⏭ Пропущено.');
    }
  }

  console.log(`\n=== ГОТОВО ===`);
}

main()
  .catch(console.error)
  .finally(async () => {
    try {
      await redisClient.disconnect();
    } catch {}
    await prisma.$disconnect();
  });
