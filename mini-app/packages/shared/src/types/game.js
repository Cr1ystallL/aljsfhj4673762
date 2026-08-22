import { z } from 'zod';
/**
 * Game types and enums
 * Core game logic will be implemented in later phases
 */
export const GameTypeSchema = z.enum([
    'crash',
    'mines',
    'cookies',
    'nuts',
    'keno',
    'coinflip',
]);
export const GameStatusSchema = z.enum([
    'waiting',
    'active',
    'completed',
    'cancelled',
]);
/**
 * Base game round structure
 */
export const GameRoundSchema = z.object({
    id: z.string().uuid(),
    gameType: GameTypeSchema,
    status: GameStatusSchema,
    startedAt: z.date().optional(),
    endedAt: z.date().optional(),
    serverSeedHash: z.string(), // For provably fair
    serverSeed: z.string().optional(), // Revealed after round ends
    createdAt: z.date(),
});
/**
 * Player bet structure
 */
export const BetSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    gameRoundId: z.string().uuid(),
    gameType: GameTypeSchema,
    amount: z.number().positive(),
    clientSeed: z.string(), // For provably fair
    status: z.enum(['pending', 'active', 'won', 'lost', 'cancelled']),
    payout: z.number().nonnegative().optional(),
    multiplier: z.number().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.date(),
    settledAt: z.date().optional(),
});
