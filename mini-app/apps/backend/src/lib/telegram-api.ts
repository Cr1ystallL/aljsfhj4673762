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

  async sendMessageWithMarkup(
    chatId: string | number,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
  ): Promise<boolean> {
    try {
      if (!config.telegramBotToken) {
        logger.warn('Cannot send Telegram message: Bot token is missing');
        return false;
      }

      const body: Record<string, any> = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      };
      if (replyMarkup) {
        body.reply_markup = replyMarkup;
      }

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ chatId, status: response.status, errorData }, 'Failed to send Telegram message with markup');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ chatId, error }, 'Exception sending Telegram message with markup');
      return false;
    }
  }

  async sendMessageWithMarkupAndGetId(
    chatId: string | number,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
  ): Promise<number | null> {
    try {
      if (!config.telegramBotToken) {
        logger.warn('Cannot send Telegram message: Bot token is missing');
        return null;
      }

      const body: Record<string, any> = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      };
      if (replyMarkup) {
        body.reply_markup = replyMarkup;
      }

      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ chatId, status: response.status, errorData }, 'Failed to send Telegram message with markup');
        return null;
      }

      const data = (await response.json()) as any;
      return data.result?.message_id || null;
    } catch (error) {
      logger.error({ chatId, error }, 'Exception sending Telegram message with markup');
      return null;
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

  async deleteMessage(chatId: string | number, messageId: number | bigint): Promise<boolean> {
    try {
      if (!config.telegramBotToken) {
        return false;
      }

      const response = await fetch(`${this.baseUrl}/deleteMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: String(chatId),
          message_id: Number(messageId),
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.warn({ chatId, messageId, status: response.status, errorData }, 'Failed to delete Telegram message');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ chatId, messageId, error }, 'Exception deleting Telegram message');
      return false;
    }
  }
}

export const telegramApi = new TelegramApi();
