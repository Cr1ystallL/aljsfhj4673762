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
      // cycleBounds does: firstStartUtc = startAtGmt1 - 1 hour.
      // So to make firstStartUtc === bestCycle.startsAt, we need:
      // startAtGmt1 = bestCycle.startsAt + 1 hour.
      const correctStartAtGmt1 = new Date(bestCycle.startsAt.getTime() + 60 * 60 * 1000);
      await prisma.tournament.update({
        where: { id: t.id },
        data: { startAtGmt1: correctStartAtGmt1 }
      });
      console.log(`[OK] Восстановлен турнир "${t.title}": startAtGmt1 установлен на ${correctStartAtGmt1.toISOString()} (чтобы совпасть с циклом ${bestCycle.startsAt.toISOString()})`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
