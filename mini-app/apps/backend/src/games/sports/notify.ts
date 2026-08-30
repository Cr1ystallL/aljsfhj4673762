import { prisma } from '../../lib/prisma.js';
import { telegramApi } from '../../lib/telegram-api.js';
import { logger } from '../../utils/logger.js';

export async function notifySportsUser(userId: string, text: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    const chatId = user?.telegramId ? Number(user.telegramId) : 0;
    if (!chatId) return;
    await telegramApi.sendMessage(chatId, text);
  } catch (err) {
    logger.warn({ err, userId }, 'Sports telegram notify failed');
  }
}

export function sportsGoalText(eventName: string, score1: number, score2: number, team: 1 | 2): string {
  return [
    '<b>Спорт · гол</b>',
    eventName,
    `Счёт ${score1}:${score2}${team === 1 ? ' · хозяева' : ' · гости'}`,
  ].join('\n');
}

export function sportsSettleText(
  eventName: string,
  type: string,
  state: 'won' | 'lost' | 'void' | 'cashed_out',
  payout: number
): string {
  const label =
    state === 'won'
      ? 'выигрыш'
      : state === 'lost'
        ? 'проигрыш'
        : state === 'cashed_out'
          ? 'выкуп'
          : 'возврат';
  return [
    `<b>Спорт · ${type === 'express' ? 'экспресс' : 'одинар'}</b>`,
    eventName,
    `${label}${payout > 0 ? ` · ${payout.toFixed(2)} zł` : ''}`,
  ].join('\n');
}
