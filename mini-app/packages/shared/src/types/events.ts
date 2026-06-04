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

// Blackjack client seat selection
export const ClientBlackjackSeatEventSchema = z.object({
  type: z.literal('bj:seat'),
  payload: z.object({
    roomId: z.string(),
    seatId: z.number().int().min(1).max(6),
    name: z.string().min(1).max(64),
    avatar: z.string().url().max(512).optional(),
  }),
  timestamp: z.number(),
});

export const ClientEventSchema = z.discriminatedUnion('type', [
  ClientAuthEventSchema,
  ClientPingEventSchema,
  ClientGameJoinEventSchema,
  ClientGameLeaveEventSchema,
  ClientBlackjackSeatEventSchema,
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

// Blackjack state sync for room
export const ServerBlackjackStateEventSchema = z.object({
  type: z.literal('bj:state'),
  payload: z.object({
    roomId: z.string(),
    label: z.string(),
    seats: z.array(
      z.object({
        id: z.number().int().min(1).max(6),
        occupant: z
          .object({ id: z.string(), name: z.string(), avatar: z.string().url().optional() })
          .nullable(),
      })
    ),
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

// Blackjack seat update broadcast
export const ServerBlackjackSeatUpdateEventSchema = z.object({
  type: z.literal('bj:seat_update'),
  payload: z.object({
    roomId: z.string(),
    seats: z.array(
      z.object({
        id: z.number().int().min(1).max(6),
        occupant: z
          .object({ id: z.string(), name: z.string(), avatar: z.string().url().optional() })
          .nullable(),
      })
    ),
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
export type ClientBlackjackSeatEvent = z.infer<typeof ClientBlackjackSeatEventSchema>;
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export type ServerAuthSuccessEvent = z.infer<typeof ServerAuthSuccessEventSchema>;
export type ServerAuthErrorEvent = z.infer<typeof ServerAuthErrorEventSchema>;
export type ServerPongEvent = z.infer<typeof ServerPongEventSchema>;
export type ServerGameJoinedEvent = z.infer<typeof ServerGameJoinedEventSchema>;
export type ServerGameLeftEvent = z.infer<typeof ServerGameLeftEventSchema>;
export type ServerBalanceUpdateEvent = z.infer<typeof ServerBalanceUpdateEventSchema>;
export type ServerErrorEvent = z.infer<typeof ServerErrorEventSchema>;
export type ServerBlackjackStateEvent = z.infer<typeof ServerBlackjackStateEventSchema>;
export type ServerBlackjackSeatUpdateEvent = z.infer<typeof ServerBlackjackSeatUpdateEventSchema>;
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
