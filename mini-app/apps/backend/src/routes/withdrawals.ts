import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import {
  authenticate,
  isAdminTelegramIdAsync,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { balanceService } from '../services/balance-service.js';
import { sendNewWithdrawalNotification } from '../services/withdrawal-reminder-cron.js';
import { logger } from '../utils/logger.js';

interface DetailsObject {
  phone?: string;
  bank?: string;
  holder?: string;
  card?: string;
}

interface WithdrawBody {
  method: 'blik' | 'card';
  amount: number;
  phone?: string;
  bank?: string;
  holder?: string;
  card?: string;
  details?: DetailsObject;
}

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 25000;
const MIN_LIFETIME_DEPOSITS = 100;

export async function withdrawalRoutes(app: FastifyInstance): Promise<void> {
  const handleCreateWithdrawal = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const body = request.body as WithdrawBody;

    // ---- Validation -----------------------------------------------------
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ ok: false, error: 'Bad request' });
    }
    const amount = Number(body.amount);
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
    
    const details = body.details || {};
    const rawPhone = body.phone || details.phone;
    const rawBank = body.bank || details.bank;
    const rawHolder = body.holder || details.holder;
    const rawCard = body.card || details.card;

    if (body.method === 'blik') {
      const phone = String(rawPhone ?? '').trim();
      const bank = String(rawBank ?? '').trim();
      const holder = String(rawHolder ?? '').trim();
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
      const card = String(rawCard ?? '').trim();
      const holder = String(rawHolder ?? '').trim();
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
    try {
      const userRow = await app.prisma.$queryRaw<
        { withdrawal_locked: boolean; telegram_id: bigint }[]
      >`SELECT withdrawal_locked, telegram_id FROM users WHERE id = ${userId} LIMIT 1`;
      
      let locked = userRow[0]?.withdrawal_locked;
      if (locked && userRow[0]?.telegram_id) {
        if (await isAdminTelegramIdAsync(Number(userRow[0].telegram_id))) {
          locked = false;
        }
      }
      
      if (locked) {
        return reply.code(403).send({
          ok: false,
          error: 'Вывод временно заблокирован администратором',
        });
      }
    } catch {
      // Column missing — older deployment. Skip the check.
    }

    // ---- Financial destination anti-abuse check ------------------
    try {
      const { securityService } = await import('../services/security-service.js');
      const finCheck = await securityService.checkWithdrawalCollision(userId, destination);
      if (finCheck.collision) {
        return reply.code(403).send({
          ok: false,
          error: 'Ошибка верификации платежных реквизитов: данные реквизиты уже используются на платформе. Вывод заморожен администрацией.',
        });
      }
    } catch (finErr) {
      logger.error({ finErr, userId, destination }, 'Financial collision check error');
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
        if (totalDeposits < MIN_LIFETIME_DEPOSITS) {
          return { ok: false as const, error: `Для вывода необходимо пополнить счет минимум на ${MIN_LIFETIME_DEPOSITS} PLN. (Ваши депозиты: ${totalDeposits.toFixed(2)} PLN)` };
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

        // Insert pending request
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

        // Mirror as a transaction row
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

      // Push fresh balance to the user via WS
      await balanceService.notifyBalance(userId, result.balanceAfter);

      // Notify admins via Telegram bot
      try {
        const uRows = await app.prisma.$queryRaw<
          Array<{ first_name: string | null; username: string | null; telegram_id: bigint | null }>
        >`SELECT first_name, username, telegram_id FROM users WHERE id = ${userId} LIMIT 1`;
        const u = uRows[0];
        const userName = u?.first_name || u?.username || 'Игрок';
        const telegramId = u?.telegram_id ? Number(u.telegram_id) : null;

        void sendNewWithdrawalNotification({
          requestId,
          userId,
          userName,
          telegramId,
          amount,
          method,
          destination,
        });
      } catch (err) {
        logger.error({ err, requestId }, 'Failed to fetch user info for admin withdrawal notification');
      }

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
  };

  app.post('/', { preHandler: authenticate }, handleCreateWithdrawal);
  app.post('/create', { preHandler: authenticate }, handleCreateWithdrawal);
}
