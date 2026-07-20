import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class TelegramApi {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = `https://api.telegram.org/bot${config.telegramBotToken}`;
  }

  async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    try {
      if (!config.telegramBotToken) {
        logger.warn('Cannot send Telegram message: Bot token is missing');
        return false;
      }

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ chatId, status: response.status, errorData }, 'Failed to send Telegram message');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ chatId, error }, 'Exception sending Telegram message');
      return false;
    }
  }
  async sendMessageAndGetId(chatId: string | number, text: string): Promise<number | null> {
    try {
      if (!config.telegramBotToken) {
        logger.warn('Cannot send Telegram message: Bot token is missing');
        return null;
      }

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ chatId, status: response.status, errorData }, 'Failed to send Telegram message');
        return null;
      }

      const data = await response.json() as any;
      return data.result?.message_id || null;
    } catch (error) {
      logger.error({ chatId, error }, 'Exception sending Telegram message');
      return null;
    }
  }

  async editMessageText(chatId: string | number, messageId: number, text: string): Promise<boolean> {
    try {
      if (!config.telegramBotToken) {
        return false;
      }

      const response = await fetch(`${this.baseUrl}/editMessageText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ chatId, messageId, status: response.status, errorData }, 'Failed to edit Telegram message');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ chatId, messageId, error }, 'Exception editing Telegram message');
      return false;
    }
  }
}

export const telegramApi = new TelegramApi();
