import { z } from 'zod';
/**
 * Shared validation utilities
 */
/**
 * Validate and parse data with Zod schema
 */
export declare function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/**
 * Safe parse with default value
 */
export declare function safeParseWithDefault<T>(schema: z.ZodSchema<T>, data: unknown, defaultValue: T): T;
//# sourceMappingURL=validation.d.ts.map