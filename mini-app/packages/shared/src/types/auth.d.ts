import { z } from 'zod';
/**
 * Authentication and authorization types
 */
/**
 * Telegram WebApp initData structure
 */
export declare const TelegramInitDataSchema: z.ZodObject<{
    query_id: z.ZodOptional<z.ZodString>;
    user: z.ZodString;
    auth_date: z.ZodString;
    hash: z.ZodString;
    signature: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    hash: string;
    auth_date: string;
    user: string;
    query_id?: string | undefined;
    signature?: string | undefined;
}, {
    hash: string;
    auth_date: string;
    user: string;
    query_id?: string | undefined;
    signature?: string | undefined;
}>;
export type TelegramInitData = z.infer<typeof TelegramInitDataSchema>;
/**
 * Parsed Telegram user from initData
 */
export declare const TelegramUserSchema: z.ZodObject<{
    id: z.ZodNumber;
    first_name: z.ZodOptional<z.ZodString>;
    last_name: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    language_code: z.ZodOptional<z.ZodString>;
    is_premium: z.ZodOptional<z.ZodBoolean>;
    photo_url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: number;
    first_name?: string | undefined;
    last_name?: string | undefined;
    username?: string | undefined;
    photo_url?: string | undefined;
    language_code?: string | undefined;
    is_premium?: boolean | undefined;
}, {
    id: number;
    first_name?: string | undefined;
    last_name?: string | undefined;
    username?: string | undefined;
    photo_url?: string | undefined;
    language_code?: string | undefined;
    is_premium?: boolean | undefined;
}>;
export type TelegramUser = z.infer<typeof TelegramUserSchema>;
/**
 * JWT payload structure
 */
export declare const JWTPayloadSchema: z.ZodObject<{
    userId: z.ZodString;
    telegramId: z.ZodNumber;
    sessionId: z.ZodString;
    iat: z.ZodNumber;
    exp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    userId: string;
    sessionId: string;
    telegramId: number;
    iat: number;
    exp: number;
}, {
    userId: string;
    sessionId: string;
    telegramId: number;
    iat: number;
    exp: number;
}>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
/**
 * Auth response from backend
 */
export declare const AuthResponseSchema: z.ZodObject<{
    token: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        telegramId: z.ZodNumber;
        username: z.ZodOptional<z.ZodString>;
        firstName: z.ZodOptional<z.ZodString>;
        lastName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        telegramId: number;
        username?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
    }, {
        id: string;
        telegramId: number;
        username?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
    }>;
    expiresAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    user: {
        id: string;
        telegramId: number;
        username?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
    };
    expiresAt: string;
    token: string;
}, {
    user: {
        id: string;
        telegramId: number;
        username?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
    };
    expiresAt: string;
    token: string;
}>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
//# sourceMappingURL=auth.d.ts.map