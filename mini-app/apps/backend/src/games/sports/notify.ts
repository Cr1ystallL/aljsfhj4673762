import { prisma } from '../../lib/prisma.js';
import { telegramApi } from '../../lib/telegram-api.js';
import { redisClient } from '../../lib/redis.js';
import { logger } from '../../utils/logger.js';

export async function notifySportsUser(
  userId: string,
  text: string,
  options?: { isGoalAlert?: boolean }
): Promise<void> {
  try {
    if (options?.isGoalAlert) {
      try {
        const disabled = await redisClient.getClient().get(`user:sports:disable_goals:${userId}`);
        if (disabled === '1') return;
      } catch {}
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    const chatId = user?.telegramId ? Number(user.telegramId) : 0;
    if (!chatId) return;

    if (options?.isGoalAlert) {
      try {
        const tgDisabled = await redisClient.getClient().get(`user:sports:disable_goals:${chatId}`);
        if (tgDisabled === '1') return;
      } catch {}

      const markup = {
        inline_keyboard: [
          [
            {
              text: '🔕 Выключить голы',
              callback_data: `disable_goals:${userId}`,
            },
          ],
        ],
      };
      await telegramApi.sendMessageWithMarkup(chatId, text, markup);
      return;
    }

    await telegramApi.sendMessage(chatId, text);
  } catch (err) {
    logger.warn({ err, userId }, 'Sports telegram notify failed');
  }
}

export function sportsGoalText(
  eventName: string,
  score1: number,
  score2: number,
  team: 1 | 2,
  sport?: string
): string {
  const icon = sport === 'hockey' ? '🏒' : '⚽';
  const title = sport === 'hockey' ? 'ШАЙБА!' : 'ГОЛ!';
  const side = team === 1 ? 'Команда 1' : 'Команда 2';

  return [
    `${icon} <b>${title}</b>`,
    `<b>${eventName}</b>`,
    `📊 Счёт: <b>${score1} : ${score2}</b> (${side})`,
  ].join('\n');
}

export function sportsSettleText(
  eventName: string,
  type: string,
  state: 'won' | 'lost' | 'void' | 'cashed_out',
  payout: number,
  odds?: number,
  stake?: number
): string {
  const isExpress = type === 'express';
  const typeTag = isExpress ? '🚂 Экспресс' : '🎯 Одинар';

  if (state === 'won') {
    return [
      `🏆 <b>СТАВКА ВЫИГРАЛА!</b>`,
      `📋 ${typeTag} · <b>${eventName}</b>`,
      `💰 Выигрыш: <b>+${payout.toFixed(2)} zł</b>`,
      odds ? `📈 Коэффициент: <b>x${odds.toFixed(2)}</b>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state === 'lost') {
    return [
      `❌ <b>Ставка не сыграла</b>`,
      `📋 ${typeTag} · <b>${eventName}</b>`,
      stake ? `📉 Сумма ставки: <b>${stake.toFixed(2)} zł</b>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (state === 'cashed_out') {
    return [
      `⚡ <b>Выкуп ставки (Cashout)</b>`,
      `📋 ${typeTag} · <b>${eventName}</b>`,
      `💵 Получено: <b>+${payout.toFixed(2)} zł</b>`,
    ].join('\n');
  }

  return [
    `🔄 <b>Возврат ставки</b>`,
    `📋 ${typeTag} · <b>${eventName}</b>`,
    `💵 Возвращено: <b>${payout.toFixed(2)} zł</b>`,
  ].join('\n');
}
