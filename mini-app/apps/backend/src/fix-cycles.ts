import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tournaments = await prisma.tournament.findMany();
  for (const t of tournaments) {
    const cycles = await prisma.tournamentCycle.findMany({
      where: { tournamentId: t.id },
      include: { _count: { select: { participants: true } } }
    });
    
    if (cycles.length === 0) continue;
    
    // Sort by participant count desc
    cycles.sort((a, b) => b._count.participants - a._count.participants);
    
    const bestCycle = cycles[0];
    if (bestCycle._count.participants > 0) {
      await prisma.tournament.update({
        where: { id: t.id },
        data: { startAtGmt1: bestCycle.startsAt }
      });
      console.log(`[OK] Восстановлен турнир "${t.title}": цикл с ${bestCycle._count.participants} участниками снова привязан.`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
