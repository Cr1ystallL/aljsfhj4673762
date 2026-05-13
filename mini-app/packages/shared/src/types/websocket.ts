import { z } from 'zod';

/**
 * WebSocket message types for real-time communication
 */

export const WSMessageTypeSchema = z.enum([
  // Connection
  'connect',
  'disconnect',
  'ping',
  'pong',
  'auth',
  'auth_success',
  'auth_error',
  
  // Balance
  'balance_update',
  'balance_sync',
  
  // Game events (to be expanded in later phases)
  'game_join',
  'game_leave',
  'game_state',
  'game_error',
  
  // System
  'error',
  'rate_limit',
]);

export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;

/**
 * Base WebSocket message structure
 */
export const WSMessageSchema = z.object({
  type: WSMessageTypeSchema,
  payload: z.unknown(),
  timestamp: z.number(),
  nonce: z.string().optional(), // For anti-replay protection
});

export type WSMessage = z.infer<typeof WSMessageSchema>;

/**
 * WebSocket authentication message
 */
export const WSAuthMessageSchema = z.object({
  type: z.literal('auth'),
  payload: z.object({
    token: z.string(),
  }),
  timestamp: z.number(),
});

export type WSAuthMessage = z.infer<typeof WSAuthMessageSchema>;

/**
 * WebSocket error message
 */
export const WSErrorMessageSchema = z.object({
  type: z.literal('error'),
  payload: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  timestamp: z.number(),
});

export type WSErrorMessage = z.infer<typeof WSErrorMessageSchema>;
