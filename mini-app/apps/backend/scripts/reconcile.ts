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
      UPDATE balances
      SET amount = amount + ${creditAmount}::numeric,
          wager_target = wager_target + ${creditAmount * 2}::numeric,
          auto_rtp_target = auto_rtp_target + ${creditAmount * 2}::numeric,
          updated_at = NOW(),
          last_synced_at = NOW(),
          version = version + 1
      WHERE user_id = ${userId}
        AND demo_mode = false
      RETURNING amount
    `;

    let afterAmount: number;
    if (balanceRows.length === 0) {
      const created = await tx.$queryRaw<Array<{ amount: string }>>`
        INSERT INTO balances (id, user_id, amount, currency, demo_mode, wager_target, auto_rtp_target, created_at, updated_at)
        VALUES (gen_random_uuid(), ${userId}, ${creditAmount}::numeric, 'PLN', false, ${creditAmount * 2}::numeric, ${creditAmount * 2}::numeric, NOW(), NOW())
        RETURNING amount
      `;
      afterAmount = Number(created[0]?.amount ?? creditAmount);
    } else {
      afterAmount = Number(balanceRows[0].amount);
    }

    const beforeAmount = afterAmount - creditAmount;

    const txId = `dep_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await tx.transaction.create({
      data: {
        id: txId,
        userId,
        type: 'deposit',
        amount: creditAmount,
        balanceBefore: beforeAmount,
        balanceAfter: afterAmount,
        metadata: {
          macvpayOrderId: payload.id,
          externalId: payload.external_id,
          paidAt: payload.paid_at,
          provider: 'macvpay',
          source: 'miniapp_manual_reconcile',
        },
      },
    });

    await tx.$executeRaw`
      UPDATE macvpay_orders
      SET status = 'credited',
          paid_amount = ${creditAmount}::numeric,
          paid_at = ${new Date(payload.paid_at)},
          credit_tx_id = ${txId},
          updated_at = NOW()
      WHERE id = ${payload.id}
    `;

    console.log(`Successfully credited! New balance: ${afterAmount} PLN.`);
  });
}

async function run() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: npx tsx scripts/reconcile.ts <orderId>');
    process.exit(1);
  }

  console.log(`Fetching status for order ${orderId} from MacvPay...`);
  const status = await getOrderStatus(orderId);
  
  if (!status.success) {
    console.error('Error: Failed to fetch order status from MacvPay.');
    console.error(status);
    process.exit(1);
  }

  if (status.status !== 'paid') {
    console.log(`Order is not paid on MacvPay. Current status: ${status.status}`);
    process.exit(0);
  }

  console.log(`Order is paid on MacvPay! Proceeding to credit...`);
  
  const synthetic: MacvPayWebhookPayload = {
    id: status.id,
    external_id: status.external_id,
    client_id: status.client_id,
    paid: status.paid_amount ?? status.price,
    price: status.price,
    currency: status.currency,
    status: 'paid',
    paid_at: status.paid_at ?? new Date().toISOString(),
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
