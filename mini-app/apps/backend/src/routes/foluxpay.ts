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

async function recordFailedOrder(
  app: FastifyInstance,
  userId: string,
  amount: number,
  type: string,
  reason: string
) {
  try {
    const failId = `fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const extId = `dep_${userId}_${Date.now()}`;
    await app.prisma.$executeRaw`
      INSERT INTO macvpay_orders (
        id, user_id, external_id, requested_amount, unique_amount,
        currency, payment_type, card, recipient, details,
        status, expires_at, created_at, updated_at
      ) VALUES (
        ${failId},
        ${userId},
        ${extId},
        ${amount}::numeric,
        ${amount}::numeric,
        'PLN',
        ${type},
        '',
        NULL,
        ${reason},
        'failed',
        NOW(),
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to record failed deposit attempt');
  }
}

async function ensureMacvpayOrders(app: FastifyInstance) {
  try {
    await app.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS macvpay_orders (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL DEFAULT 'system',
        external_id VARCHAR(128) NOT NULL,
        requested_amount NUMERIC(12, 2) NOT NULL,
        unique_amount NUMERIC(12, 2),
        currency VARCHAR(16) NOT NULL DEFAULT 'PLN',
        payment_type VARCHAR(32) NOT NULL DEFAULT 'foluxpay',
        card VARCHAR(128),
        recipient VARCHAR(128),
        details TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMP WITH TIME ZONE,
        paid_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    const missingOrders = [
      { id: '832ef4bf', amount: 30.65, created_at: '2026-08-03T16:51:58Z' },
      { id: 'e5c76f50', amount: 20.09, created_at: '2026-08-02T13:19:16Z' },
      { id: 'de4efbe5', amount: 50.26, created_at: '2026-08-01T13:46:32Z' },
      { id: '2f10b4d6', amount: 30.79, created_at: '2026-07-31T21:48:19Z' },
      { id: '2d067d52', amount: 20.24, created_at: '2026-07-31T21:28:14Z' },
      { id: '34db4453', amount: 20.73, created_at: '2026-07-31T17:36:46Z' },
    ];

    for (const o of missingOrders) {
      await app.prisma.$executeRaw`
        INSERT INTO macvpay_orders (
          id, user_id, external_id, requested_amount, unique_amount,
          currency, payment_type, status, paid_at, created_at, updated_at
        )
        SELECT ${o.id}, 'system', ${o.id}, ${o.amount}::numeric, ${o.amount}::numeric,
               'PLN', 'foluxpay', 'paid', ${new Date(o.created_at)}, ${new Date(o.created_at)}, NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM macvpay_orders WHERE id = ${o.id} OR external_id = ${o.id}
        );
      `.catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, 'Failed to ensure macvpay_orders table and seed missing orders');
  }
}

export async function foluxpayRoutes(app: FastifyInstance): Promise<void> {
  await ensureMacvpayOrders(app);

  /* ----------------------------------------------------------- active */

  app.get('/active', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;

    try {
      const rows = await app.prisma.$queryRaw<
        {
          id: string;
          unique_amount: string;
          currency: string;
          payment_type: string;
          card: string;
          details: string;
          expires_at: Date;
        }[]
      >`
        SELECT id, unique_amount, currency, payment_type, card, details, expires_at
        FROM macvpay_orders
        WHERE user_id = ${userId}
          AND status = 'pending'
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (!rows.length) {
        return reply.send({ ok: true, activeOrder: null });
      }

      const order = rows[0];

      // Auto-reconcile on active order check if paid at provider
      try {
        const remoteStatus = await getOrderStatus(order.id);
        if (remoteStatus.success && remoteStatus.status === 'paid') {
          const paidAmount = Number(remoteStatus.paid_amount) || Number(order.unique_amount);

          await app.prisma.$transaction(async (tx) => {
            const balanceRows = await tx.$queryRaw<Array<{ amount: string }>>`
              UPDATE balances
              SET amount = amount + ${paidAmount}::numeric,
                  wager_target = wager_target + ${paidAmount * 2}::numeric,
                  auto_rtp_target = auto_rtp_target + ${paidAmount * 2}::numeric,
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
                VALUES (gen_random_uuid(), ${userId}, ${paidAmount}::numeric, 'PLN', false, ${paidAmount * 2}::numeric, ${paidAmount * 2}::numeric, NOW(), NOW())
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
                userId: userId,
                type: 'deposit',
                amount: paidAmount,
                balanceBefore: beforeAmount,
                balanceAfter: afterAmount,
                metadata: {
                  foluxPayOrderId: order.id,
                  provider: 'foluxpay',
                  source: 'active_check_auto_reconcile',
                },
              },
            });

            await tx.$executeRaw`
              UPDATE macvpay_orders
              SET status = 'credited',
                  paid_amount = ${paidAmount},
                  paid_at = NOW(),
                  credit_tx_id = ${txId},
                  updated_at = NOW()
              WHERE id = ${order.id} AND status IN ('pending', 'expired')
            `;
          });

          logger.info({ orderId: order.id, userId, paidAmount }, 'Auto-credited FoluxPay order on active check');
          return reply.send({ ok: true, activeOrder: null, credited: true });
        }
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Error checking live order status during /active');
      }

      const remainingMs = new Date(order.expires_at).getTime() - Date.now();
      const expiresInMinutes = Math.max(1, Math.ceil(remainingMs / 60000));

      return reply.send({
        ok: true,
        activeOrder: {
          orderId: order.id,
          uniqueAmount: Number(order.unique_amount),
          currency: order.currency || 'PLN',
          type: order.payment_type || 'bank',
          card: order.card || '',
          recipient: null,
          details: order.details || '',
          expiresInMinutes,
        },
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to fetch active FoluxPay order');
      return reply.send({ ok: true, activeOrder: null });
    }
  });

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
      if (!cfg.depositsEnabled) {
        const errorMsg = 'Пополнения временно недоступны. Технические работы.';
        await recordFailedOrder(app, userId, amount, type, errorMsg);
        return reply.code(403).send({ error: errorMsg });
      }

      const minDeposit = Number(cfg.minDeposit ?? 10) || 10;
      if (amount < minDeposit) {
        return reply
          .code(400)
          .send({ error: `Минимальный депозит ${minDeposit} PLN` });
      }

      // ---- Rate Limiting / Anti-Spam (10 minute cooldown after 3 orders) ----
      try {
        const recentOrders = await app.prisma.$queryRaw<Array<{ created_at: Date }>>`
          SELECT created_at FROM macvpay_orders
          WHERE user_id = ${userId}
            AND created_at >= NOW() - INTERVAL '10 minutes'
          ORDER BY created_at DESC
          LIMIT 3
        `;

        if (recentOrders.length >= 3) {
          const newestOrderTime = new Date(recentOrders[0].created_at).getTime();
          const cooldownEnd = newestOrderTime + 10 * 60 * 1000;
          const now = Date.now();
          if (cooldownEnd > now) {
            const remainingSec = Math.ceil((cooldownEnd - now) / 1000);
            const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
            const rateLimitMsg = `Слишком много заявок за короткий промежуток. Пожалуйста, подождите ${remainingMin} мин. перед созданием новой заявки.`;
            logger.warn(
              { userId, recentOrdersCount: recentOrders.length, remainingMin },
              'FoluxPay deposit rate limit / cooldown triggered'
            );
            await recordFailedOrder(app, userId, amount, type, `КД (10 мин): Превышен лимит 3 заявок`);
            return reply.code(429).send({
              error: rateLimitMsg,
            });
          }
        }
      } catch (rateLimitErr) {
        logger.error({ err: rateLimitErr, userId }, 'Failed to check order rate limit');
      }

      const externalId = `dep_${userId}_${Date.now()}`;
      const wh = webhookUrl(request);

      const result = await createOrder(amount, userId, externalId, wh, type);

      if (!result.success) {
        const failReason = result.error || 'Платёжный провайдер временно недоступен.';
        logger.warn({ userId, amount, error: result.error }, 'FoluxPay order failed');
        await recordFailedOrder(app, userId, amount, type, failReason);
        return reply.code(503).send({
          error: failReason,
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
        card: result.card || result.phone || '',
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
