import { z } from 'zod';
/**
 * User entity shared between frontend and backend
 */
export const UserSchema = z.object({
    id: z.string().uuid(),
    telegramId: z.number().int().positive(),
    username: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    languageCode: z.string().optional(),
    isPremium: z.boolean().default(false),
    createdAt: z.date(),
    updatedAt: z.date(),
});
/**
 * User session data
 */
export const UserSessionSchema = z.object({
    userId: z.string().uuid(),
    telegramId: z.number().int().positive(),
    username: z.string().optional(),
    sessionId: z.string(),
    expiresAt: z.date(),
});
