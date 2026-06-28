const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const types = await prisma.transaction.groupBy({
    by: ['type'],
    _count: true
  });
  console.log('types', types);
}
main().catch(console.error).finally(() => prisma.$disconnect());
