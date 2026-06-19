import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import {
  authenticate,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { balanceService } from '../services/balance-service.js';
import { logger } from '../utils/logger.js';

/**
 * User-facing Withdrawal Routes.
 *
 * Players submit a withdrawal request (BLIK or bank card). The amount is
 * debited atomically from the shared balance and a row is inserted into
 * `withdrawal_requests` with status='pending'. Admins later mark it
 * `paid` or `rejected` from /system/console/withdrawals.
 *
 * Idempotency note: the `user_id` column on `users` and `balances` is
 * `TEXT` (Prisma `String @id`), NOT `uuid`. An earlier revision cast it
 * to `::uuid` which produced a Postgres error and a 500 from this
 * route. The cast has been removed; we let Postgres compare TEXT
 * directly. Same applies to `withdrawal_requests.user_id` (TEXT).
 *
 * The conservative SQL ensures the user can never overdraft: the UPDATE
 * only succeeds when balance >= amount, otherwise the request is
 * rejected before the request row is inserted.
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
        return reply.code(400).send({
          ok: false,
          error: `Максимум за одну заявку — ${MAX_AMOUNT} zł`,
        });
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
          return reply.code(400).send({
            ok: false,
            error: 'Заполните номер телефона, банк и имя получателя',
          });
        }
        method = 'blik';
        destination = `${phone} (${bank})`;
        metadata = { phone, bank, holder };
      } else if (body.method === 'card') {
        const card = String(body.card ?? '').trim();
        const holder = String(body.holder ?? '').trim();
        if (!card || !holder) {
          return reply.code(400).send({
            ok: false,
            error: 'Заполните номер карты и имя владельца',
          });
        }
        method = 'card';
        destination = `${card.replace(/\s+/g, '')} (${holder})`;
        metadata = { card, holder };
      } else {
        return reply
          .code(400)
          .send({ ok: false, error: 'Неизвестный метод вывода' });
      }

      // ---- Optional block-flag check ---------------------------------
      // The `withdrawal_locked` column is added by the admin Phase 1
      // migration. If it isn't there yet on a particular deployment
      // we just skip the check rather than blowing up.
      try {
        const userRow = await app.prisma.$queryRaw<
          { withdrawal_locked: boolean }[]
        >`SELECT withdrawal_locked FROM users WHERE id = ${userId} LIMIT 1`;
        if (userRow[0]?.withdrawal_locked) {
          return reply.code(403).send({
            ok: false,
            error: 'Вывод временно заблокирован администратором',
          });
        }
      } catch {
        // Column missing — older deployment. Skip the check.
      }

      // ---- Atomic debit + request insert ----------------------------
      try {
        const requestId = `wd_${Date.now()}_${randomUUID().slice(0, 8)}`;
        const metadataJson = JSON.stringify(metadata);

        const result = await app.prisma.$transaction(async (tx) => {
          // --- Check Wager & Minimum Deposit Requirements ---
          const balanceRow = await tx.$queryRaw<{ wager_target: string, wager_progress: string }[]>`
            SELECT wager_target, wager_progress FROM balances 
            WHERE user_id = ${userId} AND demo_mode = FALSE LIMIT 1
          `;
          const wagerTarget = Number(balanceRow[0]?.wager_target ?? 0);
          const wagerProgress = Number(balanceRow[0]?.wager_progress ?? 0);

          if (wagerProgress < wagerTarget) {
            return { ok: false as const, error: `Вам необходимо отыграть вейджер. Осталось: ${(wagerTarget - wagerProgress).toFixed(2)} PLN` };
          }

          const depRow = await tx.$queryRaw<{ sum: string }[]>`
            SELECT SUM(amount) as sum FROM transactions
            WHERE user_id = ${userId} AND type = 'deposit'
          `;
          const totalDeposits = Number(depRow[0]?.sum ?? 0);
          
          if (totalDeposits === 0) {
            return { ok: false as const, error: 'Вы ни разу не пополняли баланс. Вывод заблокирован до первого депозита.' };
          }
          if (totalDeposits < 50) {
            return { ok: false as const, error: `Для вывода необходимо пополнить счет минимум на 50 PLN. (Ваши депозиты: ${totalDeposits.toFixed(2)} PLN)` };
          }

          const recentDepRow = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM transactions
            WHERE user_id = ${userId} 
              AND type = 'deposit' 
              AND created_at >= NOW() - INTERVAL '30 days'
            LIMIT 1
          `;
          if (recentDepRow.length === 0) {
            return { ok: false as const, error: 'Для вывода средств необходимо сделать хотя бы один депозит за последние 30 дней.' };
          }

          // Conditional debit. Only succeeds when there are enough funds.
          const debited = await tx.$executeRaw`
            UPDATE balances
            SET amount = amount - ${amount}::numeric,
                updated_at = NOW()
            WHERE user_id = ${userId}
              AND demo_mode = FALSE
              AND amount >= ${amount}::numeric
          `;
          if (debited !== 1) {
            return { ok: false as const };
          }

          const after = await tx.$queryRaw<{ amount: string }[]>`
            SELECT amount FROM balances
            WHERE user_id = ${userId} AND demo_mode = FALSE
          `;
          const balanceAfter = Number(after[0]?.amount ?? 0);
          const balanceBefore = balanceAfter + amount;

          // Insert pending request — id is generated client-side because
          // the table's PRIMARY KEY has no DEFAULT.
          await tx.$executeRaw`
            INSERT INTO withdrawal_requests
              (id, user_id, amount, currency, method, destination, status, metadata)
            VALUES
              (${requestId},
               ${userId},
               ${amount}::numeric,
               'PLN',
               ${method},
               ${destination},
               'pending',
               ${metadataJson}::jsonb)
          `;

          // Mirror as a transaction row so it shows up in the user's
          // history. `metadata` here is the Prisma-typed JSON column.
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

          return { ok: true as const, balanceAfter };
        });

        if (!result.ok) {
          return reply
            .code(400)
            .send({ ok: false, error: 'error' in result && typeof result.error === 'string' ? result.error : 'Недостаточно средств на балансе' });
        }

        // Push fresh balance to the user via WS + invalidate cache.
        await balanceService.notifyBalance(userId, result.balanceAfter);

        return reply.send({
          ok: true,
          requestId,
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
