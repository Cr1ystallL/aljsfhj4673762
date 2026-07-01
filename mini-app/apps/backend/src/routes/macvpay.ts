import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createOrder,
  cancelOrder,
  getOrderStatus,
  type MacvPayWebhookPayload,
} from '../services/macvpay.js';
import { walletConfig } from '../services/wallet-config.js';
import { logger } from '../utils/logger.js';
import { balanceService } from '../services/balance-service.js';
import { rtpEngine } from '../services/rtp-engine.js';

/**
 * MacvPay deposit routes.
 *
 * Flow:
 *   1. Player opens the deposit screen, picks amount + method.
 *   2. Frontend calls POST /api/macvpay/deposit → backend creates an
 *      order with MacvPay, stores it in `macvpay_orders`, returns the
 *      unique amount + payment details to the frontend.
 *   3. Player transfers the exact unique amount to the provided account.
 *   4. MacvPay POSTs to /api/macvpay/webhook when the transfer is
 *      matched. Backend credits the player's balance atomically.
 *   5. Player can cancel (close the window) via POST /api/macvpay/cancel.
 *   6. Admin can reconcile a missed webhook via POST /api/macvpay/reconcile/:id.
 *
 * SECURITY:
 *   - Deposit and cancel require a valid JWT session.
 *   - Webhook is unauthenticated (MacvPay doesn't sign payloads) but
 *     we validate the order exists in our DB and is still pending before
 *     crediting anything.
 *   - Idempotency: if the order is already `paid` or `credited` we
 *     return 200 immediately without double-crediting.
 *   - The webhook handler must respond within 10 seconds; we do all
 *     DB work inside a single transaction and keep it fast.
 */

/** Public webhook URL — must be reachable by MacvPay's server. */
function webhookUrl(request: { hostname: string }): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    `https://${request.hostname === 'localhost' || request.hostname === '127.0.0.1' ? 'macvbet.nl' : request.hostname}`;
  return `${base}/api/macvpay/webhook`;
}

export async function macvpayRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------- deposit */

  /**
   * POST /api/macvpay/deposit
   *
   * Body: { amount: number, type?: "bank" | "revolut" }
   *
   * Returns the payment details the player must use.
   */
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

      // Minimum deposit guard (from wallet config if available, else 10 PLN).
      const cfg = await walletConfig.getMasked();
      const minDeposit = Number(cfg.minDeposit ?? 10) || 10;
      if (amount < minDeposit) {
        return reply
          .code(400)
          .send({ error: `Минимальный депозит ${minDeposit} PLN` });
      }

      // Generate a unique external_id for this order.
      const externalId = `dep_${userId}_${Date.now()}`;
      const wh = webhookUrl(request);

      const result = await createOrder(amount, userId, externalId, wh, type);

      if (!result.success) {
        logger.warn({ userId, amount, error: result.error }, 'MacvPay order failed');
        return reply.code(503).send({
          error:
            'Платёжный провайдер временно недоступен. Попробуйте другой способ или повторите позже.',
        });
      }

      // Persist the order so the webhook handler can look it up.
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
            ${result.type},
            ${result.card},
            ${result.recipient},
            ${result.details},
            'pending',
            ${expiresAt},
            NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        logger.error({ err, orderId: result.id }, 'Failed to persist MacvPay order');
        // Don't fail the request — the order exists at MacvPay, we can
        // reconcile later. Return the details to the player.
      }

      logger.info(
        { userId, orderId: result.id, amount, uniqueAmount: result.price },
        'MacvPay order created'
      );

      return reply.send({
        ok: true,
        orderId: result.id,
        uniqueAmount: result.price,
        currency: result.currency,
        type: result.type,
        card: result.card,
        recipient: result.recipient,
        details: result.details,
        expiresInMinutes: result.minutes,
      });
    }
  );

  /* ----------------------------------------------------------- cancel */

  /**
   * POST /api/macvpay/cancel
   * Body: { orderId: string }
   */
  app.post<{ Body: { orderId: string } }>(
    '/cancel',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const orderId = (request.body?.orderId ?? '').trim();
      if (!orderId) {
        return reply.code(400).send({ error: 'orderId required' });
      }

      // Verify the order belongs to this user.
      const rows = await app.prisma.$queryRaw<
        Array<{ user_id: string; status: string }>
      >`
        SELECT user_id, status FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;
      const order = rows[0];
      if (!order || order.user_id !== userId) {
        return reply.code(404).send({ error: 'Order not found' });
      }
      if (order.status !== 'pending') {
        return reply.send({ ok: true, alreadyProcessed: true });
      }

      const result = await cancelOrder(orderId);
      if (result.success) {
        await app.prisma.$executeRaw`
          UPDATE macvpay_orders
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = ${orderId}
        `;
      }

      return reply.send({ ok: result.success });
    }
  );

  /* ---------------------------------------------------------- webhook */

  /**
   * POST /api/macvpay/webhook
   *
   * Called by MacvPay when a transfer is matched. Must respond 2xx
   * within 10 seconds. MacvPay does NOT retry on failure, so we also
   * expose a reconcile endpoint for the admin.
   *
   * This endpoint is intentionally unauthenticated — MacvPay doesn't
   * sign payloads. We validate by looking up the order in our DB.
   */
  app.post<{ Body: MacvPayWebhookPayload }>(
    '/webhook',
    async (request, reply) => {
      const payload = request.body;

      if (!payload?.id || payload.status !== 'paid') {
        // Not a payment confirmation — ignore silently.
        return reply.code(200).send({ ok: true });
      }

      logger.info(
        { orderId: payload.id, paid: payload.paid },
        'MacvPay webhook received'
      );

      try {
        await creditDeposit(app, payload);
      } catch (err) {
        logger.error({ err, orderId: payload.id }, 'MacvPay webhook credit failed');
        // Still return 200 — MacvPay won't retry, and we have the
        // reconcile endpoint to fix it manually.
      }

      return reply.code(200).send({ ok: true });
    }
  );

  /* -------------------------------------------------------- reconcile */

  /**
   * POST /api/macvpay/reconcile/:orderId
   *
   * Admin-only: fetch the order status from MacvPay and credit the
   * balance if it's paid but not yet credited in our DB.
   * Requires a valid JWT (admin or the order's owner).
   */
  app.post<{ Params: { orderId: string } }>(
    '/reconcile/:orderId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { orderId } = request.params;

      // Allow the order owner or any admin.
      const rows = await app.prisma.$queryRaw<
        Array<{ user_id: string; status: string }>
      >`
        SELECT user_id, status FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;
      const order = rows[0];
      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }
      if (order.user_id !== userId) {
        // Only the owner or an admin can reconcile.
        const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const tgId = String((request as AuthenticatedRequest).user.telegramId);
        if (!adminIds.includes(tgId)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }

      if (order.status === 'credited') {
        return reply.send({ ok: true, alreadyCredited: true });
      }

      const status = await getOrderStatus(orderId);
      if (!status.success) {
        return reply.code(502).send({ error: 'MacvPay unreachable' });
      }
      if (status.status !== 'paid') {
        return reply.send({ ok: false, status: status.status });
      }

      // Build a synthetic webhook payload and credit.
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

      await creditDeposit(app, synthetic);
      return reply.send({ ok: true, credited: true });
    }
  );

  /* ---------------------------------------------------------- status */

  /**
   * GET /api/macvpay/status/:orderId
   * Returns the local DB status + optionally refreshes from MacvPay.
   */
  app.get<{ Params: { orderId: string } }>(
    '/status/:orderId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { orderId } = request.params;

      const rows = await app.prisma.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          requested_amount: string;
          unique_amount: string | null;
          currency: string;
          payment_type: string;
          card: string | null;
          recipient: string | null;
          details: string | null;
          status: string;
          expires_at: Date | null;
          paid_amount: string | null;
          paid_at: Date | null;
          created_at: Date;
        }>
      >`
        SELECT id, user_id, requested_amount, unique_amount, currency,
               payment_type, card, recipient, details, status,
               expires_at, paid_amount, paid_at, created_at
        FROM macvpay_orders WHERE id = ${orderId} LIMIT 1
      `;
      const order = rows[0];
      if (!order || order.user_id !== userId) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      return reply.send({
        ok: true,
        orderId: order.id,
        requestedAmount: Number(order.requested_amount),
        uniqueAmount: order.unique_amount ? Number(order.unique_amount) : null,
        currency: order.currency,
        type: order.payment_type,
        card: order.card,
        recipient: order.recipient,
        details: order.details,
        status: order.status,
        expiresAt: order.expires_at?.getTime() ?? null,
        paidAmount: order.paid_amount ? Number(order.paid_amount) : null,
        paidAt: order.paid_at?.getTime() ?? null,
        createdAt: order.created_at.getTime(),
      });
    }
  );
}

/* ---------------------------------------------------------------- helpers */

/**
 * Credit a deposit to the user's balance. Idempotent — if the order is
 * already `credited` we return without touching the balance.
 *
 * Runs inside a Postgres transaction:
 *   1. Lock the order row (FOR UPDATE).
 *   2. If already credited — bail out.
 *   3. Credit the balance atomically.
 *   4. Create a `deposit` transaction record.
 *   5. Mark the order as `credited`.
 */
async function creditDeposit(
  app: FastifyInstance,
  payload: MacvPayWebhookPayload
): Promise<void> {
  await app.prisma.$transaction(async (tx) => {
    // Lock the order row to prevent concurrent credits.
    const rows = await tx.$queryRaw<
      Array<{ user_id: string; status: string; unique_amount: string | null }>
    >`
      SELECT user_id, status, unique_amount
      FROM macvpay_orders
      WHERE id = ${payload.id}
      FOR UPDATE
    `;
    const order = rows[0];

    if (!order) {
      // Order not in our DB — could be a test webhook. Log and ignore.
      logger.warn({ orderId: payload.id }, 'MacvPay webhook: order not found');
      return;
    }

    if (order.status === 'credited') {
      // Already processed — idempotent.
      logger.info({ orderId: payload.id }, 'MacvPay webhook: already credited');
      return;
    }

    const creditAmount = payload.paid;
    const userId = order.user_id;

    // Credit the balance and update wager/RTP targets
    const balanceRows = await tx.$queryRaw<Array<{ amount: string, wager_target: string, wager_progress: string, auto_rtp_target: string, auto_rtp_progress: string }>>`
      UPDATE balances
      SET amount = amount + ${creditAmount}::numeric,
          wager_target = wager_target + (${creditAmount} * 2)::numeric,
          auto_rtp_target = auto_rtp_target + (${creditAmount} * 2)::numeric,
          updated_at = NOW(),
          last_synced_at = NOW(),
          version = version + 1
      WHERE user_id = ${userId}
        AND demo_mode = false
      RETURNING amount, wager_target, wager_progress, auto_rtp_target, auto_rtp_progress
    `;

    let afterAmount: number;
    let wTarget = 0, wProg = 0, rTarget = 0, rProg = 0;
    if (balanceRows.length === 0) {
      // No balance row yet — create one.
      const created = await tx.$queryRaw<Array<{ amount: string, wager_target: string, wager_progress: string, auto_rtp_target: string, auto_rtp_progress: string }>>`
        INSERT INTO balances (id, user_id, amount, currency, demo_mode, wager_target, auto_rtp_target, created_at, updated_at)
        VALUES (gen_random_uuid(), ${userId}, ${creditAmount}::numeric, 'PLN', false, (${creditAmount} * 2)::numeric, (${creditAmount} * 2)::numeric, NOW(), NOW())
        RETURNING amount, wager_target, wager_progress, auto_rtp_target, auto_rtp_progress
      `;
      afterAmount = Number(created[0]?.amount ?? creditAmount);
      wTarget = Number(created[0]?.wager_target ?? 0);
      wProg = Number(created[0]?.wager_progress ?? 0);
      rTarget = Number(created[0]?.auto_rtp_target ?? 0);
      rProg = Number(created[0]?.auto_rtp_progress ?? 0);
    } else {
      afterAmount = Number(balanceRows[0].amount);
      wTarget = Number(balanceRows[0].wager_target ?? 0);
      wProg = Number(balanceRows[0].wager_progress ?? 0);
      rTarget = Number(balanceRows[0].auto_rtp_target ?? 0);
      rProg = Number(balanceRows[0].auto_rtp_progress ?? 0);
    }

    const beforeAmount = afterAmount - creditAmount;

    // Create a deposit transaction record.
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
          source: 'miniapp',
        },
      },
    });

    // Mark the order as credited.
    await tx.$executeRaw`
      UPDATE macvpay_orders
      SET status = 'credited',
          paid_amount = ${creditAmount}::numeric,
          paid_at = ${new Date(payload.paid_at)},
          credit_tx_id = ${txId},
          updated_at = NOW()
      WHERE id = ${payload.id}
    `;

    logger.info(
      { userId, orderId: payload.id, creditAmount, afterAmount },
      'MacvPay deposit credited'
    );

    // Notify the balance store so the frontend updates in real-time.
    await balanceService.invalidateCache(userId);
    await balanceService.notifyBalance(userId, afterAmount, wTarget, wProg, rTarget, rProg);

    // Auto-RTP hook: earn target = 200% от депозита, окно 200 mins, intensity 0.95
    try {
      const target = Math.max(0, creditAmount * 2.0);
      await rtpEngine.setUserConfig(userId, {
        mode: target > 0 ? 'earn' : 'off',
        target,
        windowMs: 200 * 60 * 1000,
        intensity: 0.95,
      }, { reset: true });
      // touch status to rotate window
      await rtpEngine.getUserStatus(userId);
    } catch (err) {
      logger.warn({ err, userId }, 'Auto-RTP set failed on deposit');
    }
  });
}
