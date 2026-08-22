import { z } from 'zod';
/**
 * Game types and enums
 * Core game logic will be implemented in later phases
 */
export declare const GameTypeSchema: z.ZodEnum<["crash", "mines", "cookies", "nuts", "keno", "coinflip"]>;
export type GameType = z.infer<typeof GameTypeSchema>;
export declare const GameStatusSchema: z.ZodEnum<["waiting", "active", "completed", "cancelled"]>;
export type GameStatus = z.infer<typeof GameStatusSchema>;
/**
 * Base game round structure
 */
export declare const GameRoundSchema: z.ZodObject<{
    id: z.ZodString;
    gameType: z.ZodEnum<["crash", "mines", "cookies", "nuts", "keno", "coinflip"]>;
    status: z.ZodEnum<["waiting", "active", "completed", "cancelled"]>;
    startedAt: z.ZodOptional<z.ZodDate>;
    endedAt: z.ZodOptional<z.ZodDate>;
    serverSeedHash: z.ZodString;
    serverSeed: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "waiting" | "active" | "completed" | "cancelled";
    createdAt: Date;
    gameType: "crash" | "mines" | "cookies" | "nuts" | "keno" | "coinflip";
    serverSeedHash: string;
    startedAt?: Date | undefined;
    endedAt?: Date | undefined;
    serverSeed?: string | undefined;
}, {
    id: string;
    status: "waiting" | "active" | "completed" | "cancelled";
    createdAt: Date;
    gameType: "crash" | "mines" | "cookies" | "nuts" | "keno" | "coinflip";
    serverSeedHash: string;
    startedAt?: Date | undefined;
    endedAt?: Date | undefined;
    serverSeed?: string | undefined;
}>;
export type GameRound = z.infer<typeof GameRoundSchema>;
/**
 * Player bet structure
 */
export declare const BetSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    gameRoundId: z.ZodString;
    gameType: z.ZodEnum<["crash", "mines", "cookies", "nuts", "keno", "coinflip"]>;
    amount: z.ZodNumber;
    clientSeed: z.ZodString;
    status: z.ZodEnum<["pending", "active", "won", "lost", "cancelled"]>;
    payout: z.ZodOptional<z.ZodNumber>;
    multiplier: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
    settledAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    id: string;
    userId: string;
    status: "active" | "cancelled" | "pending" | "won" | "lost";
    amount: number;
    createdAt: Date;
    gameType: "crash" | "mines" | "cookies" | "nuts" | "keno" | "coinflip";
    gameRoundId: string;
    clientSeed: string;
    metadata?: Record<string, unknown> | undefined;
    payout?: number | undefined;
    multiplier?: number | undefined;
    settledAt?: Date | undefined;
}, {
    id: string;
    userId: string;
    status: "active" | "cancelled" | "pending" | "won" | "lost";
    amount: number;
    createdAt: Date;
    gameType: "crash" | "mines" | "cookies" | "nuts" | "keno" | "coinflip";
    gameRoundId: string;
    clientSeed: string;
    metadata?: Record<string, unknown> | undefined;
    payout?: number | undefined;
    multiplier?: number | undefined;
    settledAt?: Date | undefined;
}>;
export type Bet = z.infer<typeof BetSchema>;
//# sourceMappingURL=game.d.ts.map