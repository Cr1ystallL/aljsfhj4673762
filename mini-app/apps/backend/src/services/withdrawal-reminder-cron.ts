import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';
import { getAllAdminTelegramIds } from '../middleware/auth.js';

let cronInterval: NodeJS.Timeout | null = null;

export async function sendNewWithdrawalNotification(params: {
  requestId: string;
  userId: string;
  userName: string;
  telegramId?: number | null;
  amount: number;
  method: string;
  destination: string;
}) {
  try {
    const adminIds = await getAllAdminTelegramIds();
    if (!adminIds.length) return;

    const methodLabel = params.method === 'blik' ? 'BLIK / Телефон' : 'Банковская Карта';
    const tgIdStr = params.telegramId ? ` (ID: <code>${params.telegramId}</code>)` : '';

    const text =
      `<b>📥 НОВАЯ ЗАЯВКА НА ВЫВОД!</b>\n\n` +
      `<b>Игрок:</b> ${params.userName}${tgIdStr}\n` +
      `<b>Сумма:</b> <b>${params.amount.toFixed(2)} PLN</b>\n` +
      `<b>Способ:</b> ${methodLabel}\n` +
      `<b>Реквизиты:</b> <code>${params.destination}</code>\n` +
      `<b>ID заявки:</b> <code>${params.requestId}</code>\n\n` +
      `<i>Пожалуйста, проверьте консоль администратора для обработки.</i>`;

    await Promise.allSettled(
      adminIds.map((chatId) => telegramApi.sendMessage(chatId, text))
    );
    logger.info({ requestId: params.requestId, adminCount: adminIds.length }, 'Sent new withdrawal Telegram notifications to admins');
  } catch (err) {
    logger.error({ err, requestId: params.requestId }, 'Failed to send new withdrawal notification');
  }
}

export async function checkAndSendPendingWithdrawalsReminder() {
  try {
    const pendingRequests = await prisma.$queryRaw<
      Array<{
        id: string;
        amount: string;
        currency: string;
        method: string;
        destination: string;
        created_at: Date;
      }>
    >`
      SELECT id, amount, currency, method, destination, created_at
      FROM withdrawal_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `;

    if (!pendingRequests.length) return;

    const adminIds = await getAllAdminTelegramIds();
    if (!adminIds.length) return;

    const count = pendingRequests.length;
    const totalAmount = pendingRequests.reduce((acc, r) => acc + Number(r.amount), 0);

    const oldestMinutes = Math.floor(
      (Date.now() - new Date(pendingRequests[0].created_at).getTime()) / 60000
    );

    const text =
      `<b>⏰ НАПОМИНАНИЕ О ЗАЯВКАХ НА ВЫВОД!</b>\n\n` +
      `В очереди ожидают обработки <b>${count}</b> заявка(ок) на сумму <b>${totalAmount.toFixed(2)} PLN</b>.\n` +
      `Самая старая заявка находится в ожидании <b>${oldestMinutes} мин.</b>\n\n` +
      `<i>Пожалуйста, перейдите в панель администратора для обработки!</i>`;

    await Promise.allSettled(
      adminIds.map((chatId) => telegramApi.sendMessage(chatId, text))
    );
    logger.info({ count, totalAmount, adminCount: adminIds.length }, 'Sent pending withdrawal reminders to admins');
  } catch (err) {
    logger.error({ err }, 'Error during pending withdrawal reminder cron');
  }
}

export function startWithdrawalReminderCron() {
  if (cronInterval) return;

  logger.info('Starting withdrawal reminder cron (runs every 3 hours)');

  // Run every 3 hours (3 * 60 * 60 * 1000 ms)
  cronInterval = setInterval(() => {
    void checkAndSendPendingWithdrawalsReminder();
  }, 3 * 60 * 60 * 1000);
}

export function stopWithdrawalReminderCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    logger.info('Withdrawal reminder cron stopped');
  }
}
