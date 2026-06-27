import { PrismaClient } from '@prisma/client';
import { payoutCycle } from '../routes/tournaments.js';

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
      try {
        const result = await payoutCycle(cycle.tournament, cycle);
        console.log(`✅ Призы успешно выплачены! (Кол-во победителей: ${result.winnersPaid})`);
      } catch (err) {
        console.error(`❌ Ошибка при выплате призов для турнира ${cycle.tournament.title}:`, err);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
