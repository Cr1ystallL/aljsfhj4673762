import { z } from 'zod';
/**
 * User entity shared between frontend and backend
 */
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    telegramId: z.ZodNumber;
    username: z.ZodOptional<z.ZodString>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    languageCode: z.ZodOptional<z.ZodString>;
    isPremium: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    telegramId: number;
    isPremium: boolean;
    createdAt: Date;
    updatedAt: Date;
    username?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    languageCode?: string | undefined;
}, {
    id: string;
    telegramId: number;
    createdAt: Date;
    updatedAt: Date;
    username?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    languageCode?: string | undefined;
    isPremium?: boolean | undefined;
}>;
export type User = z.infer<typeof UserSchema>;
/**
 * User session data
 */
export declare const UserSessionSchema: z.ZodObject<{
    userId: z.ZodString;
    telegramId: z.ZodNumber;
    username: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodString;
    expiresAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    userId: string;
    sessionId: string;
    telegramId: number;
    expiresAt: Date;
    username?: string | undefined;
}, {
    userId: string;
    sessionId: string;
    telegramId: number;
    expiresAt: Date;
    username?: string | undefined;
}>;
export type UserSession = z.infer<typeof UserSessionSchema>;
//# sourceMappingURL=user.d.ts.map