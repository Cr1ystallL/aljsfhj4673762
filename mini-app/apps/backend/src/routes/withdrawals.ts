import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { balanceService } from '../services/balance-service.js';
import { logger } from '../utils/logger.js';

/**
 * User-facing Withdrawal Routes.
 *
 * Players submit a withdrawal request (BLIK or bank card). The amount
 * is debited atomically from the shared balance and a row is inserted
 * into `withdrawal_requests` with status='pending'. Admins later mark
 * it `paid` or `rejected` from /system/console/withdrawals.
 *
 * The conservative SQL ensures the user can never overdraft: the
 * UPDATE only succeeds when balance >= amount, otherwise the request
 * is rejected before the row is inserted.
 */

interface BlikBody {
  method: 'blik';
  amount: number;
  phone: string;
  bank: string;
  holder: string;
}
interface CardBody {
  method: 'card';
  amount: number;
  card: string;
  holder: string;
}

type WithdrawBody = BlikBody | CardBody;

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 25000;

export async function withdrawalRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: WithdrawBody }>(
    '/',
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const body = request.body;

      // ---- Validation -----------------------------------------------------
      if (!body || typeof body !== 'object') {
        return reply.code(400).send({ ok: false, error: 'Bad request' });
      }
      const amount = Number((body as { amount?: unknown }).amount);
      if (!Number.isFinite(amount) || amount < MIN_AMOUNT) {
        return reply
          .code(400)
          .send({ ok: false, error: `Минимальная сумма — ${MIN_AMOUNT} zł` });
      }
      if (amount > MAX_AMOUNT) {
        return reply
          .code(400)
          .send({ ok: false, error: `Максимум за одну заявку — ${MAX_AMOUNT} zł` });
      }

      // ---- Method-specific destination + metadata ------------------------
      let method: 'blik' | 'card';
      let destination: string;
      let metadata: Record<string, string>;
      if (body.method === 'blik') {
        const phone = String(body.phone ?? '').trim();
        const bank = String(body.bank ?? '').trim();
        const holder = String(body.holder ?? '').trim();
        if (!phone || !bank || !holder) {
          return reply
            .code(400)
            .send({ ok: false, error: 'Заполните номер телефона, банк и имя получателя' });
        }
        method = 'blik';
        destination = `${phone} (${bank})`;
        metadata = { phone, bank, holder };
      } else if (body.method === 'card') {
        const card = String(body.card ?? '').trim();
        const holder = String(body.holder ?? '').trim();
        if (!card || !holder) {
          return reply
            .code(400)
            .send({ ok: false, error: 'Заполните номер карты и имя владельца' });
        }
        method = 'card';
        destination = `${card.replace(/\s+/g, '')} (${holder})`;
        metadata = { card, holder };
      } else {
        return reply
          .code(400)
          .send({ ok: false, error: 'Неизвестный метод вывода' });
      }

      // ---- Block flag check ----------------------------------------------
      try {
        const userRow = await app.prisma.$queryRaw<
          { withdrawal_locked: boolean }[]
        >`SELECT withdrawal_locked FROM users WHERE id = ${userId}::uuid`;
        if (userRow[0]?.withdrawal_locked) {
          return reply
            .code(403)
            .send({ ok: false, error: 'Вывод временно заблокирован администратором' });
        }
      } catch {
        // Column may not exist on older deployments — fall through.
      }

      // ---- Atomic debit + request insert in a single transaction ---------
      try {
        const result = await app.prisma.$transaction(async (tx) => {
          // Conditional debit. Only succeeds when there are enough funds.
          const debited = await tx.$executeRaw`
            UPDATE balances
            SET amount = amount - ${amount}::numeric,
                updated_at = NOW()
            WHERE user_id = ${userId}::uuid
              AND demo_mode = FALSE
              AND amount >= ${amount}::numeric
          `;
          if (debited !== 1) {
            return { ok: false as const, reason: 'insufficient' as const };
          }

          // Read fresh balance for transaction record.
          const after = await tx.$queryRaw<{ amount: string }[]>`
            SELECT amount FROM balances
            WHERE user_id = ${userId}::uuid AND demo_mode = FALSE
          `;
          const balanceAfter = Number(after[0]?.amount ?? 0);
          const balanceBefore = balanceAfter + amount;

          // Insert pending request.
          const inserted = await tx.$queryRaw<{ id: string }[]>`
            INSERT INTO withdrawal_requests
              (user_id, amount, currency, method, destination, status, metadata)
            VALUES
              (${userId}::uuid,
               ${amount}::numeric,
               'PLN',
               ${method},
               ${destination},
               'pending',
               ${Prisma.sql`${JSON.stringify(metadata)}::jsonb`})
            RETURNING id
          `;
          const requestId = inserted[0]?.id;

          // Mirror as a transaction row so it shows up in user history.
          await tx.transaction.create({
            data: {
              userId,
              type: 'withdraw_request',
              amount: -amount,
              balanceBefore,
              balanceAfter,
              metadata: {
                method,
                destination,
                requestId,
                ...metadata,
              },
            },
          });

          return { ok: true as const, requestId, balanceAfter };
        });

        if (!result.ok) {
          return reply
            .code(400)
            .send({ ok: false, error: 'Недостаточно средств на балансе' });
        }

        // Push fresh balance to the user via WS + invalidate cache.
        await balanceService.notifyBalance(userId, result.balanceAfter);

        return reply.send({
          ok: true,
          requestId: result.requestId,
          status: 'pending',
        });
      } catch (error) {
        logger.error(error, 'Withdrawal request failed');
        return reply
          .code(500)
          .send({ ok: false, error: 'Не удалось создать заявку' });
      }
    }
  );
}
