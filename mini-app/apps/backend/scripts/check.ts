import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bonuses = await prisma.transaction.findMany({
    where: { type: 'bonus' },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  console.log(JSON.stringify(bonuses, null, 2));
}

main().finally(() => prisma.$disconnect());
