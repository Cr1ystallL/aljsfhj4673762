import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tournaments = await prisma.tournament.findMany();
  console.log('--- TOURNAMENTS ---');
  for (const t of tournaments) {
    console.log(`[${t.id}] ${t.title} (Active: ${t.active})`);
    const cycles = await prisma.tournamentCycle.findMany({
      where: { tournamentId: t.id },
      include: { _count: { select: { participants: true } } }
    });
    for (const c of cycles) {
      console.log(`  Cycle ${c.id}: state=${c.state}, endsAt=${c.endsAt.toISOString()}, participants=${c._count.participants}`);
      if (c.state === 'ended') {
        // Let's check transactions for this cycle to see if prizes were paid
        const txs = await prisma.transaction.count({
          where: { type: 'tournament_prize', metadata: { path: ['cycleId'], equals: c.id } }
        });
        console.log(`    Prizes paid: ${txs > 0 ? 'YES' : 'NO'} (${txs} transactions)`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
