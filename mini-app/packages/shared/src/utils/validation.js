import { z } from 'zod';
/**
 * Shared validation utilities
 */
/**
 * Validate and parse data with Zod schema
 */
export function validateData(schema, data) {
    try {
        const parsed = schema.parse(data);
        return { success: true, data: parsed };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
            };
        }
        return { success: false, error: 'Validation failed' };
    }
}
/**
 * Safe parse with default value
 */
export function safeParseWithDefault(schema, data, defaultValue) {
    const result = schema.safeParse(data);
    return result.success ? result.data : defaultValue;
}
