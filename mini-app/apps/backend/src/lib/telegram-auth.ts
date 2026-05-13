import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Telegram Mini App Authentication
 * 
 * SECURITY: Server-side validation of Telegram initData using HMAC-SHA256
 * Never trust client-provided user data without verification
 * 
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  auth_date: number;
  hash: string;
}

/**
 * Validate Telegram WebApp initData using HMAC-SHA256
 * 
 * Algorithm:
 * 1. Parse initData string into key-value pairs
 * 2. Sort pairs alphabetically (excluding 'hash')
 * 3. Create data-check-string: key=value\nkey=value...
 * 4. Compute HMAC-SHA256(secret_key, data-check-string)
 * 5. Compare computed hash with provided hash
 * 
 * @param initData - Raw initData string from Telegram WebApp
 * @returns Parsed and validated user data, or null if invalid
 */
export function validateTelegramInitData(initData: string): TelegramInitData | null {
  try {
    // Parse initData into URLSearchParams
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      logger.warn('Telegram initData missing hash');
      return null;
    }

    // Remove hash from params for validation
    params.delete('hash');

    // Create data-check-string
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Compute secret key: HMAC-SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.telegramBotToken)
      .digest();

    // Compute hash: HMAC-SHA256(secret_key, data-check-string)
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare hashes (constant-time comparison)
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash))) {
      logger.warn('Telegram initData hash mismatch');
      return null;
    }

    // Validate auth_date (not older than 1 hour)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 3600; // 1 hour

    if (now - authDate > maxAge) {
      logger.warn({ authDate, now, age: now - authDate }, 'Telegram initData expired');
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) {
      logger.warn('Telegram initData missing user');
      return null;
    }

    const user: TelegramUser = JSON.parse(userStr);

    // Validate user ID
    if (!user.id || user.id <= 0) {
      logger.warn('Invalid Telegram user ID');
      return null;
    }

    return {
      query_id: params.get('query_id') || undefined,
      user,
      auth_date: authDate,
      hash,
    };
  } catch (error) {
    logger.error(error, 'Failed to validate Telegram initData');
    return null;
  }
}

/**
 * Validate Telegram auth for web fallback
 * Used when user accesses via web browser instead of Telegram app
 * 
 * @param authData - Auth data from Telegram Login Widget
 * @returns Validated user data, or null if invalid
 */
export function validateTelegramWebAuth(authData: Record<string, string>): TelegramUser | null {
  try {
    const { hash, ...data } = authData;

    if (!hash) {
      logger.warn('Telegram web auth missing hash');
      return null;
    }

    // Create data-check-string
    const dataCheckString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    // Compute hash: HMAC-SHA256(bot_token, data-check-string)
    const secretKey = crypto
      .createHash('sha256')
      .update(config.telegramBotToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare hashes
    if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash))) {
      logger.warn('Telegram web auth hash mismatch');
      return null;
    }

    // Validate auth_date
    const authDate = parseInt(data.auth_date || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 86400; // 24 hours for web auth

    if (now - authDate > maxAge) {
      logger.warn({ authDate, now }, 'Telegram web auth expired');
      return null;
    }

    // Parse user data
    const user: TelegramUser = {
      id: parseInt(data.id, 10),
      first_name: data.first_name,
      last_name: data.last_name,
      username: data.username,
      photo_url: data.photo_url,
    };

    if (!user.id || user.id <= 0) {
      logger.warn('Invalid Telegram user ID in web auth');
      return null;
    }

    return user;
  } catch (error) {
    logger.error(error, 'Failed to validate Telegram web auth');
    return null;
  }
}
