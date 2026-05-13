import { z } from 'zod';
/**
 * Balance types for wallet system
 * Integrates with existing Python bot balance APIs
 */
export declare const BalanceSchema: z.ZodObject<{
    userId: z.ZodString;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    demoMode: z.ZodDefault<z.ZodBoolean>;
    lastSyncedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    userId: string;
    amount: number;
    currency: string;
    demoMode: boolean;
    lastSyncedAt: Date;
}, {
    userId: string;
    amount: number;
    lastSyncedAt: Date;
    currency?: string | undefined;
    demoMode?: boolean | undefined;
}>;
export type Balance = z.infer<typeof BalanceSchema>;
/**
 * Balance update event from WebSocket
 */
export declare const BalanceUpdateSchema: z.ZodObject<{
    userId: z.ZodString;
    amount: z.ZodNumber;
    previousAmount: z.ZodNumber;
    currency: z.ZodString;
    reason: z.ZodEnum<["bet", "win", "deposit", "withdrawal", "sync", "admin"]>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    userId: string;
    amount: number;
    currency: string;
    reason: "deposit" | "withdrawal" | "bet" | "win" | "sync" | "admin";
    previousAmount: number;
    timestamp: Date;
}, {
    userId: string;
    amount: number;
    currency: string;
    reason: "deposit" | "withdrawal" | "bet" | "win" | "sync" | "admin";
    previousAmount: number;
    timestamp: Date;
}>;
export type BalanceUpdate = z.infer<typeof BalanceUpdateSchema>;
/**
 * Transaction record
 */
export declare const TransactionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    type: z.ZodEnum<["bet", "win", "deposit", "withdrawal", "refund"]>;
    amount: z.ZodNumber;
    balanceBefore: z.ZodNumber;
    balanceAfter: z.ZodNumber;
    gameType: z.ZodOptional<z.ZodString>;
    gameRoundId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "deposit" | "withdrawal" | "bet" | "win" | "refund";
    userId: string;
    amount: number;
    createdAt: Date;
    balanceBefore: number;
    balanceAfter: number;
    gameType?: string | undefined;
    gameRoundId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    type: "deposit" | "withdrawal" | "bet" | "win" | "refund";
    userId: string;
    amount: number;
    createdAt: Date;
    balanceBefore: number;
    balanceAfter: number;
    gameType?: string | undefined;
    gameRoundId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type Transaction = z.infer<typeof TransactionSchema>;
//# sourceMappingURL=balance.d.ts.map