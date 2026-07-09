import { PrismaClient } from '@prisma/client';
import { getOrderStatus, type MacvPayWebhookPayload } from '../src/services/macvpay.js';
import Fastify from 'fastify';

const prisma = new PrismaClient();

// A simplified copy of the creditDeposit logic for the standalone script
async function manualCreditDeposit(payload: MacvPayWebhookPayload) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ user_id: string; status: string }>
    >`
      SELECT user_id, status
      FROM macvpay_orders
      WHERE id = ${payload.id}
      FOR UPDATE
    `;
    const order = rows[0];

    if (!order) {
      console.error(`Order ${payload.id} not found in DB.`);
      return;
    }

    if (order.status === 'credited') {
      console.log(`Order ${payload.id} is already credited.`);
      return;
    }

    const creditAmount = payload.paid;
    const userId = order.user_id;

    console.log(`Crediting ${creditAmount} PLN to user ${userId}...`);

    const balanceRows = await tx.$queryRaw<Array<{ amount: string }>>`
    if (order.status === 'paid' || order.status === 'credited') {
      console.log(`Order ${orderId} is already processed (status: ${order.status}).`);
      return false;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Balance adjustment via transactions table
      const [user] = await tx.$queryRaw<{ balance: number }[]>`
        SELECT balance FROM "users" WHERE id = ${order.user_id} FOR UPDATE
      `;
      if (!user) throw new Error('User not found');

      await tx.$executeRaw`
        INSERT INTO "transactions" (
          id, user_id, amount, type, description, balance_before, balance_after, created_at, metadata
        ) VALUES (
          gen_random_uuid(),
          ${order.user_id},
          ${paidAmount},
          'deposit',
          'Manual reconciliation for FoluxPay deposit',
          ${user.balance},
          ${user.balance + paidAmount},
          NOW(),
          ${JSON.stringify({
            foluxPayOrderId: payload.order_id,
            manual_reconciliation: true,
            provider: 'foluxpay',
          })}::jsonb
        )
      `;

      await tx.$executeRaw`
        UPDATE "users" SET balance = balance + ${paidAmount} WHERE id = ${order.user_id}
      `;

      await tx.$executeRaw`
        UPDATE macvpay_orders
        SET status = 'credited',
            paid_amount = ${paidAmount},
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = ${orderId} AND status = 'pending'
      `;
    });

    console.log(`Successfully credited ${paidAmount} PLN to user ${order.user_id} for order ${orderId}`);
    return true;
  } catch (err) {
    console.error('Failed to credit deposit:', err);
    return false;
  }
}

async function run() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: npx tsx scripts/reconcile.ts <orderId>');
    process.exit(1);
  }

  console.log(`Fetching status for order ${orderId} from FoluxPay...`);
  const status = await getOrderStatus(orderId);
  
  if (!status.success) {
    console.error('Error: Failed to fetch order status from FoluxPay.');
    console.error(status);
    process.exit(1);
  }

  if (status.status !== 'paid') {
    console.log(`Order is not paid on FoluxPay. Current status: ${status.status}`);
    process.exit(0);
  }

  console.log(`Order is paid on FoluxPay! Proceeding to credit...`);
  
  const synthetic: FoluxPayWebhookPayload = {
    event: 'payment_completed',
    order_id: status.order_id,
    paid_amount: Number(status.paid_amount || status.amount),
    status: 'paid',
  };

  try {
    await manualCreditDeposit(synthetic);
  } catch (err) {
    console.error('Failed to credit deposit:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
