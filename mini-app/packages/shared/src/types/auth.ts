import { z } from 'zod';

/**
 * Authentication and authorization types
 */

/**
 * Telegram WebApp initData structure
 */
export const TelegramInitDataSchema = z.object({
  query_id: z.string().optional(),
  user: z.string(), // JSON string of user object
  auth_date: z.string(),
  hash: z.string(),
  signature: z.string().optional(),
});

export type TelegramInitData = z.infer<typeof TelegramInitDataSchema>;

/**
 * Parsed Telegram user from initData
 */
export const TelegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

/**
 * JWT payload structure
 */
export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  telegramId: z.number().int().positive(),
  sessionId: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

/**
 * Auth response from backend
 */
export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    telegramId: z.number().int().positive(),
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }),
  expiresAt: z.string(), // ISO date string
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
