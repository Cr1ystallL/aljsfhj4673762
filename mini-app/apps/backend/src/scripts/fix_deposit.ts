import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const telegramId = 1826703823;
  const orderId = '9a4e10f0-830d-4b88-8525-1036a09e4c93';
  const amount = 70;

  console.log(`Looking for user with telegramId: ${telegramId}`);
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    console.error('User not found!');
    process.exit(1);
  }
  console.log(`Found user: ${user.id}`);

  const balanceRows = await prisma.$queryRaw<Array<{ amount: number }>>`
    SELECT amount FROM balances WHERE user_id = ${user.id} AND demo_mode = false
  `;
  const currentBalance = balanceRows.length > 0 ? Number(balanceRows[0].amount) : 0;

  console.log(`Current balance is ${currentBalance}. Inserting transaction without modifying balance...`);

  await prisma.$transaction(async (tx) => {
    const txId = `dep_manual_${Date.now()}`;
    await tx.$executeRaw`
      INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, metadata, created_at)
      VALUES (${txId}, ${user.id}, 'deposit', ${amount}::numeric, ${currentBalance}::numeric, ${currentBalance}::numeric, '{"source": "admin_manual_fix"}'::jsonb, NOW())
    `;

    await tx.$executeRaw`
      UPDATE macvpay_orders
      SET status = 'credited',
          paid_amount = ${amount}::numeric,
          paid_at = NOW(),
          credit_tx_id = ${txId},
          updated_at = NOW()
      WHERE id = ${orderId}
    `;
  });

  console.log('Successfully recorded the deposit transaction and updated order status!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
