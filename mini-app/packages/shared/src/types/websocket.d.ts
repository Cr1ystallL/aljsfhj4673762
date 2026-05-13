import { z } from 'zod';
/**
 * WebSocket message types for real-time communication
 */
export declare const WSMessageTypeSchema: z.ZodEnum<["connect", "disconnect", "ping", "pong", "auth", "auth_success", "auth_error", "balance_update", "balance_sync", "game_join", "game_leave", "game_state", "game_error", "error", "rate_limit"]>;
export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;
/**
 * Base WebSocket message structure
 */
export declare const WSMessageSchema: z.ZodObject<{
    type: z.ZodEnum<["connect", "disconnect", "ping", "pong", "auth", "auth_success", "auth_error", "balance_update", "balance_sync", "game_join", "game_leave", "game_state", "game_error", "error", "rate_limit"]>;
    payload: z.ZodUnknown;
    timestamp: z.ZodNumber;
    nonce: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "error" | "connect" | "balance_update" | "disconnect" | "ping" | "pong" | "auth" | "auth_success" | "auth_error" | "balance_sync" | "game_join" | "game_leave" | "game_state" | "game_error" | "rate_limit";
    timestamp: number;
    nonce?: string | undefined;
    payload?: unknown;
}, {
    type: "error" | "connect" | "balance_update" | "disconnect" | "ping" | "pong" | "auth" | "auth_success" | "auth_error" | "balance_sync" | "game_join" | "game_leave" | "game_state" | "game_error" | "rate_limit";
    timestamp: number;
    nonce?: string | undefined;
    payload?: unknown;
}>;
export type WSMessage = z.infer<typeof WSMessageSchema>;
/**
 * WebSocket authentication message
 */
export declare const WSAuthMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"auth">;
    payload: z.ZodObject<{
        token: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        token: string;
    }, {
        token: string;
    }>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "auth";
    timestamp: number;
    payload: {
        token: string;
    };
}, {
    type: "auth";
    timestamp: number;
    payload: {
        token: string;
    };
}>;
export type WSAuthMessage = z.infer<typeof WSAuthMessageSchema>;
/**
 * WebSocket error message
 */
export declare const WSErrorMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"error">;
    payload: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        code: string;
        details?: unknown;
    }, {
        message: string;
        code: string;
        details?: unknown;
    }>;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "error";
    timestamp: number;
    payload: {
        message: string;
        code: string;
        details?: unknown;
    };
}, {
    type: "error";
    timestamp: number;
    payload: {
        message: string;
        code: string;
        details?: unknown;
    };
}>;
export type WSErrorMessage = z.infer<typeof WSErrorMessageSchema>;
//# sourceMappingURL=websocket.d.ts.map