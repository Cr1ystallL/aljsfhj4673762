import { z } from 'zod';

/**
 * Balance types for wallet system
 * Integrates with existing Python bot balance APIs
 */

export const BalanceSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().nonnegative(),
  currency: z.string().default('USD'),
  freeCases: z.number().optional(),
  freeCasesJson: z.record(z.unknown()).optional(),
  demoMode: z.boolean().default(false),
  wagerTarget: z.number().optional(),
  wagerProgress: z.number().optional(),
  lastSyncedAt: z.date(),
});

export type Balance = z.infer<typeof BalanceSchema>;

/**
 * Balance update event from WebSocket
 */
export const BalanceUpdateSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().nonnegative(),
  previousAmount: z.number().nonnegative(),
  currency: z.string(),
  reason: z.enum(['bet', 'win', 'deposit', 'withdrawal', 'sync', 'admin']),
  timestamp: z.date(),
});

export type BalanceUpdate = z.infer<typeof BalanceUpdateSchema>;

/**
 * Transaction record
 */
export const TransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['bet', 'win', 'deposit', 'withdrawal', 'refund']),
  amount: z.number(),
  balanceBefore: z.number().nonnegative(),
  balanceAfter: z.number().nonnegative(),
  gameType: z.string().optional(),
  gameRoundId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
