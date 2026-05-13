import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Adapter for integrating with existing Python bot APIs
 * Handles balance synchronization and user data
 * 
 * This is a placeholder interface - actual implementation
 * will be completed in Phase 4 when balance system is built
 */

export interface PythonBotBalance {
  userId: string;
  amount: number;
  currency: string;
}

export interface PythonBotTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'win';
  amount: number;
  timestamp: string;
}

export class PythonBotAdapter {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = config.pythonBotApiUrl;
    this.apiKey = config.pythonBotApiKey;
  }

  /**
   * Fetch user balance from Python bot
   */
  async getBalance(telegramId: number): Promise<PythonBotBalance | null> {
    try {
      const response = await fetch(`${this.baseURL}/api/balance/${telegramId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        logger.error(
          { status: response.status, telegramId },
          'Failed to fetch balance from Python bot'
        );
        return null;
      }

      const data = await response.json() as PythonBotBalance;
      return data;
    } catch (error) {
      logger.error(error, 'Error fetching balance from Python bot');
      return null;
    }
  }

  /**
   * Sync balance update to Python bot
   */
  async syncBalance(
    telegramId: number,
    amount: number,
    reason: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/balance/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegram_id: telegramId,
          amount,
          reason,
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error(error, 'Error syncing balance to Python bot');
      return false;
    }
  }

  /**
   * Fetch transaction history from Python bot
   */
  async getTransactions(
    telegramId: number,
    limit: number = 50
  ): Promise<PythonBotTransaction[]> {
    try {
      const response = await fetch(
        `${this.baseURL}/api/transactions/${telegramId}?limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as PythonBotTransaction[];
      return data;
    } catch (error) {
      logger.error(error, 'Error fetching transactions from Python bot');
      return [];
    }
  }
}

export const pythonBotAdapter = new PythonBotAdapter();
