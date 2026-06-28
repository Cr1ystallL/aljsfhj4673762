import { prisma } from '../lib/prisma.js';

async function main() {
  const now = new Date();
  
  // Find cycles that are 'live' but start in the future
  const futureCycles = await prisma.tournamentCycle.findMany({
    where: {
      state: 'live',
      startsAt: { gt: now }
    }
  });

  console.log(`Found ${futureCycles.length} cycles to fix`);
  
  for (const c of futureCycles) {
    await prisma.tournamentCycle.update({
      where: { id: c.id },
      data: { state: 'waiting' }
    });
    console.log(`Cycle ${c.id} updated to waiting`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
