import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, type AuthenticatedRequest, isAdminTelegramIdAsync } from '../middleware/auth.js';
import {
  createOrder,
  cancelOrder,
  getOrderStatus,
  type FoluxPayWebhookPayload,
} from '../services/foluxpay.js';
import { walletConfig } from '../services/wallet-config.js';
import { logger } from '../utils/logger.js';

/**
 * FoluxPay deposit routes.
 */

function webhookUrl(request: { hostname: string }): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    `https://${request.hostname === 'localhost' || request.hostname === '127.0.0.1' ? 'macvbet.nl' : request.hostname}`;
  return `${base}/api/foluxpay/webhook`;
}

export async function foluxpayRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------- deposit */

  app.post<{
    Body: { amount: number; type?: 'bank' | 'revolut' };
  }>(
    '/deposit',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const amount = Number(request.body?.amount);
      const type = request.body?.type ?? 'bank';

      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.code(400).send({ error: 'Invalid amount' });
      }
      if (!['bank', 'revolut'].includes(type)) {
        return reply.code(400).send({ error: 'Invalid type' });
      }

      const cfg = await walletConfig.getMasked();
      const minDeposit = Number(cfg.minDeposit ?? 10) || 10;
      if (amount < minDeposit) {
        return reply
          .code(400)
          .send({ error: `Минимальный депозит ${minDeposit} PLN` });
      }

      const externalId = `dep_${userId}_${Date.now()}`;
      const wh = webhookUrl(request);

      const result = await createOrder(amount, userId, externalId, wh, type);

      if (!result.success) {
        logger.warn({ userId, amount, error: result.error }, 'FoluxPay order failed');
        return reply.code(503).send({
          error:
            'Платёжный провайдер временно недоступен. Попробуйте другой способ или повторите позже.',
        });
      }

      const expiresAt = new Date(Date.now() + result.minutes * 60 * 1000);
      try {
        await app.prisma.$executeRaw`
          INSERT INTO macvpay_orders (
            id, user_id, external_id, requested_amount, unique_amount,
            currency, payment_type, card, recipient, details,
            status, expires_at, created_at, updated_at
          ) VALUES (
            ${result.id},
            ${userId},
            ${externalId},
            ${amount}::numeric,
            ${result.price}::numeric,
            'PLN',
            ${type},
            ${result.card || result.phone || ''},
            NULL,
            ${result.details},
            'pending',
            ${expiresAt},
            NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        logger.error({ err, orderId: result.id }, 'Failed to persist FoluxPay order');
      }

      logger.info(
        { userId, orderId: result.id, amount, uniqueAmount: result.price },
        'FoluxPay order created'
      );

      return reply.send({
        ok: true,
        orderId: result.id,
        uniqueAmount: result.price,
        currency: 'PLN',
        type: result.type || type,
        card: result.card || '',
        phone: result.phone || '',
        recipient: null,
        details: result.details,
        expiresInMinutes: result.minutes,
      });
    }
  );

  /* ----------------------------------------------------------- cancel */

  app.post<{ Body: { orderId: string } }>(
    '/cancel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { orderId } = request.body || {};

      if (!orderId) {
        return reply.code(400).send({ error: 'Missing orderId' });
      }

      const rows = await app.prisma.$queryRaw<
        { user_id: string; status: string }[]
      >`
        SELECT user_id, status FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;
      if (!rows.length) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const order = rows[0];
      if (order.user_id !== userId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      if (order.status !== 'pending') {
        return reply.send({ ok: true, status: order.status });
      }

      await cancelOrder(orderId);

      try {
        await app.prisma.$executeRaw`
          UPDATE macvpay_orders
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = ${orderId} AND status = 'pending'
        `;
      } catch (err) {
        logger.error({ err, orderId }, 'Failed to update order status to cancelled');
      }

      logger.info({ userId, orderId }, 'FoluxPay order cancelled by user');
      return reply.send({ ok: true, status: 'cancelled' });
    }
  );

  /* ---------------------------------------------------------- webhook */

  app.post<{ Body: FoluxPayWebhookPayload }>('/webhook', async (request, reply) => {
    const payload = request.body;
    logger.info({ payload }, 'Received FoluxPay webhook');

    if (payload.status !== 'paid') {
      logger.info({ payload }, 'Ignored FoluxPay webhook (not paid)');
      return reply.send({ ok: true });
    }
    
    if (!payload.order_id) {
       return reply.code(400).send({ error: 'Missing order_id' });
    }

    const orderId = payload.order_id;
    const paidAmount = Number(payload.paid_amount);

    try {
      const rows = await app.prisma.$queryRaw<
        { user_id: string; status: string }[]
      >`
        SELECT user_id, status FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;

      if (!rows.length) {
        logger.warn({ orderId }, 'FoluxPay webhook for unknown order');
        return reply.send({ ok: true });
      }

      const order = rows[0];
      if (order.status === 'paid' || order.status === 'credited') {
        logger.info({ orderId }, 'FoluxPay webhook for already processed order');
        return reply.send({ ok: true });
      }

      if (order.status !== 'pending' && order.status !== 'expired') {
        logger.warn({ orderId, status: order.status }, 'FoluxPay webhook for non-pending/expired order');
        return reply.send({ ok: true });
      }

      await app.prisma.$transaction(async (tx) => {
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
              foluxPayOrderId: orderId,
              provider: 'foluxpay',
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
          WHERE id = ${orderId} AND status IN ('pending', 'expired')
        `;

        if (updateCount === 0) {
          throw new Error('Concurrent modification detected');
        }
      });

      logger.info(
        { orderId, userId: order.user_id, amount: paidAmount },
        'FoluxPay order credited successfully'
      );
      return reply.send({ ok: true });
    } catch (err) {
      logger.error({ err, orderId }, 'Failed to process FoluxPay webhook');
      return reply.code(500).send({ error: 'Internal error' });
    }
  });

  /* -------------------------------------------------------- reconcile */

  app.post<{ Params: { id: string } }>(
    '/reconcile/:id',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      
      const telegramId = Number((request as AuthenticatedRequest).user.telegramId);
      if (!(await isAdminTelegramIdAsync(telegramId))) {
        return reply.code(403).send({ error: 'Admin only' });
      }

      const { id: orderId } = request.params;

      const rows = await app.prisma.$queryRaw<
        { user_id: string; status: string; unique_amount: number }[]
      >`
        SELECT user_id, status, unique_amount
        FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;
      if (!rows.length) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const order = rows[0];
      if (order.status === 'paid' || order.status === 'credited') {
        return reply.send({ ok: true, msg: 'Already processed' });
      }

      const remoteStatus = await getOrderStatus(orderId);
      if (!remoteStatus.success) {
        return reply.code(500).send({ error: remoteStatus.error });
      }

      if (remoteStatus.status === 'paid') {
        const paidAmount = Number(remoteStatus.paid_amount) || Number(order.unique_amount);

        try {
          await app.prisma.$transaction(async (tx) => {
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
                  foluxPayOrderId: orderId,
                  provider: 'foluxpay',
                  source: 'miniapp_manual_reconcile',
                },
              },
            });

            const count = await tx.$executeRaw`
              UPDATE macvpay_orders
              SET status = 'credited',
                  paid_amount = ${paidAmount},
                  paid_at = NOW(),
                  credit_tx_id = ${txId},
                  updated_at = NOW()
              WHERE id = ${orderId} AND status != 'credited'
            `;
          });
          return reply.send({ ok: true, msg: 'Reconciled and credited' });
        } catch (err) {
          logger.error({ err, orderId }, 'Reconciliation failed');
          return reply.code(500).send({ error: 'DB transaction failed' });
        }
      }

      return reply.send({ ok: true, msg: `Order is ${remoteStatus.status}` });
    }
  );
}
