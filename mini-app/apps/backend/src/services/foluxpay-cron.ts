import { PrismaClient } from '@prisma/client';
import { getOrderStatus } from './foluxpay.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();
let cronInterval: NodeJS.Timeout | null = null;

/**
 * Background job to automatically check pending/expired FoluxPay orders
 * and credit the user if they were actually paid. This covers cases where
 * the webhook failed to deliver.
 */
async function runFoluxpayCron() {
  try {
    // Find orders that are pending or expired and need reconciliation.
    // Wait at least 2 minutes since creation to give webhook a chance first.
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    
    const pendingOrders = await prisma.$queryRaw<
      { id: string; user_id: string; unique_amount: number; status: string }[]
    >`
      SELECT id, user_id, unique_amount, status
      FROM macvpay_orders
      WHERE status IN ('pending', 'expired')
        AND created_at < ${cutoff}
      LIMIT 50
    `;

    for (const order of pendingOrders) {
      try {
        const remoteStatus = await getOrderStatus(order.id);
        
        if (remoteStatus.success && remoteStatus.status === 'paid') {
          const paidAmount = Number(remoteStatus.paid_amount) || Number(order.unique_amount);

          await prisma.$transaction(async (tx) => {
            // Credit the balance
            const balanceRows = await tx.$queryRaw<Array<{ amount: string }>>`
              UPDATE balances
              SET amount = amount + ${paidAmount}::numeric,
                  wager_target = wager_target + ${paidAmount * 2}::numeric,
                  auto_rtp_target = auto_rtp_target + ${paidAmount * 2}::numeric,
                  updated_at = NOW(),
                  last_synced_at = NOW(),
                  version = version + 1
              WHERE user_id = ${order.user_id}
                AND demo_mode = false
              RETURNING amount
            `;

            let afterAmount: number;
            if (balanceRows.length === 0) {
              const created = await tx.$queryRaw<Array<{ amount: string }>>`
                INSERT INTO balances (id, user_id, amount, currency, demo_mode, wager_target, auto_rtp_target, created_at, updated_at)
                VALUES (gen_random_uuid(), ${order.user_id}, ${paidAmount}::numeric, 'PLN', false, ${paidAmount * 2}::numeric, ${paidAmount * 2}::numeric, NOW(), NOW())
                RETURNING amount
              `;
              afterAmount = Number(created[0]?.amount ?? paidAmount);
            } else {
              afterAmount = Number(balanceRows[0].amount);
            }

            const beforeAmount = afterAmount - paidAmount;
            const txId = `dep_${Date.now()}_${Math.random().toString(36).slice(2)}`;

            await tx.transaction.create({
              data: {
                id: txId,
                userId: order.user_id,
                type: 'deposit',
                amount: paidAmount,
                balanceBefore: beforeAmount,
                balanceAfter: afterAmount,
                metadata: {
                  foluxPayOrderId: order.id,
                  provider: 'foluxpay',
                  source: 'miniapp_cron_reconcile',
                },
              },
            });

            const updateCount = await tx.$executeRaw`
              UPDATE macvpay_orders
              SET status = 'credited',
                  paid_amount = ${paidAmount},
                  paid_at = NOW(),
                  credit_tx_id = ${txId},
                  updated_at = NOW()
              WHERE id = ${order.id} AND status IN ('pending', 'expired')
            `;
            
            if (updateCount === 0) {
              throw new Error('Concurrent modification detected');
            }
          });
          
          logger.info({ orderId: order.id, userId: order.user_id, amount: paidAmount }, 'Cron reconciled and credited FoluxPay order');
        }
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Error during FoluxPay cron reconciliation for order');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to run FoluxPay cron');
  }
}

export function startFoluxpayCron() {
  if (cronInterval) return;
  // Run every 60 seconds
  cronInterval = setInterval(runFoluxpayCron, 60 * 1000);
  logger.info('FoluxPay cron started');
}

export function stopFoluxpayCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    logger.info('FoluxPay cron stopped');
  }
}
