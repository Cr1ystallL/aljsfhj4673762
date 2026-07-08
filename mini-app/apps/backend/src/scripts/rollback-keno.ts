import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Keno rollback...');

  const kenoBets = await prisma.bet.findMany({
    where: {
      gameType: 'keno',
      state: {
        in: ['won', 'lost']
      }
    },
  });

  console.log(`Found ${kenoBets.length} completed Keno bets to rollback in total`);

  let totalRefunded = 0;
  let totalDeducted = 0;

  for (const bet of kenoBets) {
    const amount = Number(bet.amount);
    const payout = Number(bet.payout || 0);

    // Delta: we return the bet amount, and we take away the payout.
    const delta = amount - payout;

    if (delta !== 0) {
      // Find current balance to update it properly
      const currentBalance = await prisma.balance.findUnique({
        where: { userId: bet.userId }
      });
      
      if (currentBalance) {
        const newAmount = Number(currentBalance.amount) + delta;
        
        await prisma.balance.update({
          where: { userId: bet.userId },
          data: {
            amount: newAmount,
          }
        });
      }
      
      if (delta > 0) totalRefunded += delta;
      if (delta < 0) totalDeducted += Math.abs(delta);
    }

    // Mark bet as cancelled so it doesn't show up in stats or get rolled back twice
    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        state: 'cancelled',
        payout: 0,
        multiplier: 0,
      }
    });

    console.log(`Rolled back bet ${bet.id} for user ${bet.userId}: amount=${amount}, payout=${payout}, delta=${delta}`);
  }

  console.log('--- Rollback complete ---');
  console.log(`Total refunded (bets returned): ${totalRefunded} PLN`);
  console.log(`Total deducted (wins reversed): ${totalDeducted} PLN`);
  console.log(`Net balance change across platform: ${totalRefunded - totalDeducted} PLN`);

  await prisma.$disconnect();
}

main().catch(console.error);
