import { PrismaClient } from '@prisma/client';
import { payoutCycle } from '../routes/tournaments.js';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function main() {
  console.log('Начинаем поиск зависших турниров для выплаты призов...');
  
  const now = new Date();
  
  // Ищем ТОЛЬКО ОДИН последний зависший цикл (самый свежий по времени окончания),
  // у которого время вышло, но он все еще 'live' (то есть призы НЕ выдавались)
  const expiredCycles = await prisma.tournamentCycle.findMany({
    where: {
      state: 'live',
      endsAt: { lte: now }
    },
    orderBy: {
      endsAt: 'desc'
    },
    take: 1,
    include: {
      tournament: true
    }
  });

  if (expiredCycles.length === 0) {
    console.log('Не найдено зависших турниров, ожидающих выплаты.');
  } else {
    for (const cycle of expiredCycles) {
      console.log(`Нашли турнир: ${cycle.tournament.title} (Цикл ID: ${cycle.id})`);
      
      const participants = await prisma.tournamentParticipant.findMany({
        where: { cycleId: cycle.id },
        include: { user: { select: { username: true, firstName: true } } },
        orderBy: [
          { balance: 'desc' },
          { reachedAt: 'asc' },
        ]
      });

      console.log(`\nУчастники турнира (топ 5):`);
      for (let i = 0; i < Math.min(5, participants.length); i++) {
        const p = participants[i];
        console.log(`${i + 1}. ${p.user.firstName || p.user.username} - Баланс: ${p.balance}`);
      }

      console.log(`\nВсего участников: ${participants.length}`);

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question(`\nВыплатить призы за этот турнир? (y/N): `, resolve);
      });
      
      rl.close();

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        try {
          const result = await payoutCycle(cycle.tournament, cycle);
          console.log(`✅ Призы успешно выплачены! (Кол-во победителей: ${result.winnersPaid})`);
        } catch (err) {
          console.error(`❌ Ошибка при выплате призов для турнира ${cycle.tournament.title}:`, err);
        }
      } else {
        console.log('Выплата отменена.');
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
