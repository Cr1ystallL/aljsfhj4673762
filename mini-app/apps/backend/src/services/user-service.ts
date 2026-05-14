import { PrismaClient } from '@prisma/client';
import type { TelegramUser } from '../lib/telegram-auth.js';
import { logger } from '../utils/logger.js';

/**
 * User Service
 * Handles user creation and retrieval
 */

const prisma = new PrismaClient();

export class UserService {
  /**
   * Find user by Telegram ID
   */
  async findByTelegramId(telegramId: number) {
    return prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
  }

  /**
   * Find user by ID
   */
  async findById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Create or update user from Telegram data
   */
  async upsertFromTelegram(telegramUser: TelegramUser) {
    try {
      const user = await prisma.user.upsert({
        where: {
          telegramId: BigInt(telegramUser.id),
        },
        update: {
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          languageCode: telegramUser.language_code,
          isPremium: telegramUser.is_premium || false,
          photoUrl: telegramUser.photo_url ?? undefined,
          updatedAt: new Date(),
        },
        create: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          languageCode: telegramUser.language_code,
          isPremium: telegramUser.is_premium || false,
          photoUrl: telegramUser.photo_url,
        },
      });

      logger.info({ userId: user.id, telegramId: user.telegramId }, 'User upserted');

      return user;
    } catch (error) {
      logger.error(error, 'Failed to upsert user');
      throw error;
    }
  }

  /**
   * Get user with balance
   */
  async getUserWithBalance(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        balance: true,
      },
    });
  }
}

export const userService = new UserService();
