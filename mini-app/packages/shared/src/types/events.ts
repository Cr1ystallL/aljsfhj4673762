import { z } from 'zod';

/**
 * Centralized Event Schema System
 * All WebSocket and game events use these typed schemas
 * 
 * RULES:
 * - All events must have runtime validation
 * - No 'any' types
 * - Strict payload typing
 * - Version compatibility
 */

// Base event structure
export const BaseEventSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.number(),
});

// Client → Server Events
export const ClientAuthEventSchema = z.object({
  type: z.literal('auth'),
  payload: z.object({
    sessionId: z.string(),
  }),
  timestamp: z.number(),
});

export const ClientPingEventSchema = z.object({
  type: z.literal('ping'),
  payload: z.object({}),
  timestamp: z.number(),
});

export const ClientGameJoinEventSchema = z.object({
  type: z.literal('game:join'),
  payload: z.object({
    roomId: z.string(),
  }),
  timestamp: z.number(),
});

export const ClientGameLeaveEventSchema = z.object({
  type: z.literal('game:leave'),
  payload: z.object({
    roomId: z.string(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackJoinSeatEventSchema = z.object({
  type: z.literal('blackjack:join_seat'),
  payload: z.object({
    roomId: z.string(),
    seatId: z.number().int().min(1).max(5),
    bet: z.number().positive().default(10),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackLeaveSeatEventSchema = z.object({
  type: z.literal('blackjack:leave_seat'),
  payload: z.object({
    roomId: z.string(),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackBetEventSchema = z.object({
  type: z.literal('blackjack:bet'),
  payload: z.object({
    roomId: z.string(),
    bet: z.number().min(0),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackActionEventSchema = z.object({
  type: z.literal('blackjack:action'),
  payload: z.object({
    roomId: z.string(),
    action: z.enum(['hit', 'stand', 'double', 'split']),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackChatEventSchema = z.object({
  type: z.literal('blackjack:chat'),
  payload: z.object({
    roomId: z.string(),
    text: z.string().max(300),
    emoji: z.string().optional(),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

export const ClientBlackjackReadyToDealEventSchema = z.object({
  type: z.literal('blackjack:ready_to_deal'),
  payload: z.object({
    roomId: z.string(),
    isReady: z.boolean().optional(),
    userId: z.string().optional(),
  }),
  timestamp: z.number(),
});

// Full client events union
export const ClientEventSchema = z.discriminatedUnion('type', [
  ClientAuthEventSchema,
  ClientPingEventSchema,
  ClientGameJoinEventSchema,
  ClientGameLeaveEventSchema,
  ClientBlackjackJoinSeatEventSchema,
  ClientBlackjackLeaveSeatEventSchema,
  ClientBlackjackBetEventSchema,
  ClientBlackjackActionEventSchema,
  ClientBlackjackChatEventSchema,
  ClientBlackjackReadyToDealEventSchema,
]);

// Server → Client Events
export const ServerAuthSuccessEventSchema = z.object({
  type: z.literal('auth_success'),
  payload: z.object({
    userId: z.string(),
    sessionId: z.string(),
  }),
  timestamp: z.number(),
});

export const ServerAuthErrorEventSchema = z.object({
  type: z.literal('auth_error'),
  payload: z.object({
    code: z.string(),
    message: z.string(),
  }),
  timestamp: z.number(),
});

export const ServerPongEventSchema = z.object({
  type: z.literal('pong'),
  payload: z.object({}),
  timestamp: z.number(),
});

export const ServerGameJoinedEventSchema = z.object({
  type: z.literal('game:joined'),
  payload: z.object({
    roomId: z.string(),
  }),
  timestamp: z.number(),
});

export const ServerGameLeftEventSchema = z.object({
  type: z.literal('game:left'),
  payload: z.object({
    roomId: z.string(),
  }),
  timestamp: z.number(),
});

// Crash state sync for room (sent when joining to show current players)
export const ServerCrashStateEventSchema = z.object({
  type: z.literal('crash:state'),
  payload: z.object({
    roomId: z.string(),
    phase: z.enum(['idle', 'waiting', 'starting', 'active', 'resolving', 'completed']),
    multiplier: z.number(),
    elapsedTime: z.number(),
    phaseEndsAt: z.number().nullable(),
    serverSeedHash: z.string(),
    activePlayers: z.array(z.object({
      userId: z.string(),
      slot: z.number(),
      betAmount: z.number(),
      user: z.object({
        userId: z.string(),
        username: z.string().nullable().optional(),
        firstName: z.string().nullable().optional(),
        photoUrl: z.string().nullable().optional(),
      }).nullable().optional(),
    })),
    cashedOut: z.array(z.object({
      userId: z.string(),
      slot: z.number(),
      multiplier: z.number(),
      payout: z.number(),
      timestamp: z.number(),
    })),
    history: z.array(z.object({
      crashPoint: z.number(),
      roundId: z.string().optional(),
    })),
    stats: z.object({
      playerCount: z.number(),
      totalWagered: z.number(),
      betsCount: z.number(),
    }),
    crashPointPreview: z.number().nullable().optional(),
  }),
  timestamp: z.number(),
});

export const ServerBalanceUpdateEventSchema = z.object({
  type: z.literal('balance_update'),
  payload: z.object({
    amount: z.number(),
    currency: z.string(),
    demoMode: z.boolean(),
  }),
  timestamp: z.number(),
});

export const ServerErrorEventSchema = z.object({
  type: z.literal('error'),
  payload: z.object({
    code: z.string(),
    message: z.string(),
  }),
  timestamp: z.number(),
});

// Game Events (Server → Client)
export const GameRoundCreatedEventSchema = z.object({
  type: z.literal('round:created'),
  payload: z.object({
    roundId: z.string(),
    serverSeedHash: z.string(),
    history: z.array(z.unknown()).optional(),
  }),
  timestamp: z.number(),
});

export const GamePhaseWaitingEventSchema = z.object({
  type: z.literal('phase:waiting'),
  payload: z.object({
    duration: z.number(),
  }),
  timestamp: z.number(),
});

export const GamePhaseCountdownEventSchema = z.object({
  type: z.literal('phase:countdown'),
  payload: z.object({
    duration: z.number(),
  }),
  timestamp: z.number(),
});

export const GamePhaseActiveEventSchema = z.object({
  type: z.literal('phase:active'),
  payload: z.object({
    startTime: z.number(),
  }),
  timestamp: z.number(),
});

export const GameMultiplierUpdateEventSchema = z.object({
  type: z.literal('multiplier:update'),
  payload: z.object({
    multiplier: z.number(),
    elapsedTime: z.number(),
    activePlayers: z.array(z.object({
      userId: z.string(),
      betAmount: z.number(),
    })),
  }),
  timestamp: z.number(),
});

export const GameCrashedEventSchema = z.object({
  type: z.literal('game:crashed'),
  payload: z.object({
    crashPoint: z.number(),
    finalMultiplier: z.number(),
    cashedOutCount: z.number(),
    totalPlayers: z.number(),
  }),
  timestamp: z.number(),
});

export const GamePlayerCashoutEventSchema = z.object({
  type: z.literal('player:cashout'),
  payload: z.object({
    userId: z.string(),
    multiplier: z.number(),
    payout: z.number(),
    timestamp: z.number(),
  }),
  timestamp: z.number(),
});

export const GamePlayerLostEventSchema = z.object({
  type: z.literal('player:lost'),
  payload: z.object({
    userId: z.string(),
    betAmount: z.number(),
    crashPoint: z.number(),
  }),
  timestamp: z.number(),
});

export const GameRoundCompletedEventSchema = z.object({
  type: z.literal('round:completed'),
  payload: z.object({
    roundId: z.string(),
    crashPoint: z.number().optional(),
    serverSeed: z.string(),
    clientSeed: z.string(),
    nonce: z.number(),
    cashedOutPlayers: z.array(z.unknown()).optional(),
  }),
  timestamp: z.number(),
});

// Type exports
export type ClientAuthEvent = z.infer<typeof ClientAuthEventSchema>;
export type ClientPingEvent = z.infer<typeof ClientPingEventSchema>;
export type ClientGameJoinEvent = z.infer<typeof ClientGameJoinEventSchema>;
export type ClientGameLeaveEvent = z.infer<typeof ClientGameLeaveEventSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export type ServerAuthSuccessEvent = z.infer<typeof ServerAuthSuccessEventSchema>;
export type ServerAuthErrorEvent = z.infer<typeof ServerAuthErrorEventSchema>;
export type ServerPongEvent = z.infer<typeof ServerPongEventSchema>;
export type ServerGameJoinedEvent = z.infer<typeof ServerGameJoinedEventSchema>;
export type ServerGameLeftEvent = z.infer<typeof ServerGameLeftEventSchema>;
export type ServerBalanceUpdateEvent = z.infer<typeof ServerBalanceUpdateEventSchema>;
export type ServerErrorEvent = z.infer<typeof ServerErrorEventSchema>;
export type ServerCrashStateEvent = z.infer<typeof ServerCrashStateEventSchema>;

export type GameRoundCreatedEvent = z.infer<typeof GameRoundCreatedEventSchema>;
export type GamePhaseWaitingEvent = z.infer<typeof GamePhaseWaitingEventSchema>;
export type GamePhaseCountdownEvent = z.infer<typeof GamePhaseCountdownEventSchema>;
export type GamePhaseActiveEvent = z.infer<typeof GamePhaseActiveEventSchema>;
export type GameMultiplierUpdateEvent = z.infer<typeof GameMultiplierUpdateEventSchema>;
export type GameCrashedEvent = z.infer<typeof GameCrashedEventSchema>;
export type GamePlayerCashoutEvent = z.infer<typeof GamePlayerCashoutEventSchema>;
export type GamePlayerLostEvent = z.infer<typeof GamePlayerLostEventSchema>;
export type GameRoundCompletedEvent = z.infer<typeof GameRoundCompletedEventSchema>;

// Helper to create typed events
export function createEvent<T extends { type: string; payload: unknown }>(
  type: T['type'],
  payload: T['payload']
): T {
  return {
    type,
    payload,
    timestamp: Date.now(),
  } as unknown as T;
}

// Safe event parser
export function parseClientEvent(data: unknown): ClientEvent | null {
  const result = ClientEventSchema.safeParse(data);
  return result.success ? result.data : null;
}
