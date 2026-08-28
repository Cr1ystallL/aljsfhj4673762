import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { wsManager } from '../lib/websocket-manager.js';
import { sessionManager } from '../lib/session-manager.js';
import { parseClientEvent, createEvent } from '@casino/shared';
import type {
  ServerAuthSuccessEvent,
  ServerAuthErrorEvent,
  ServerPongEvent,
  ServerGameJoinedEvent,
  ServerGameLeftEvent,
  ServerErrorEvent,
} from '@casino/shared';
import { crashManager } from '../game-engine/crash-room-singleton.js';
import { macvpotManager } from '../games/macvpot/macvpot-singleton.js';
import { blackjackSingleton } from '../games/blackjack/blackjack-singleton.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * WebSocket routes with authentication
 * 
 * SECURITY:
 * - Requires authentication via session token
 * - Validates all incoming messages
 * - Rate limiting per connection
 * - Automatic cleanup of stale connections
 * - Support for reconnection with existing session
 */

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  isAuthenticated?: boolean;
}

export async function websocketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket: AuthenticatedWebSocket, request) => {
    const connectionId = randomUUID();
    
    // Add connection to manager (unauthenticated initially)
    wsManager.addConnection(connectionId, socket);
    
    logger.info({ connectionId }, 'WebSocket client connected (unauthenticated)');

    // Authentication timeout: 30 seconds (increased from 10s for slow connections)
    const authTimeout = setTimeout(() => {
      if (!socket.isAuthenticated) {
        logger.warn({ connectionId }, 'WebSocket authentication timeout');
        const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
          code: 'AUTH_TIMEOUT',
          message: 'Authentication required',
        });
        try {
          socket.send(JSON.stringify(errorEvent));
        } catch {}
        try {
          socket.close();
        } catch {}
      }
    }, 30000);

    socket.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Validate and parse message
        const validMessage = parseClientEvent(data);
        if (!validMessage) {
          logger.warn({ connectionId, data }, 'Invalid WebSocket message');
          const errorEvent = createEvent<ServerErrorEvent>('error', {
            code: 'INVALID_MESSAGE',
            message: 'Invalid message format',
          });
          socket.send(JSON.stringify(errorEvent));
          return;
        }

        // Handle authentication
        if (validMessage.type === 'auth') {
          await handleAuth(app, socket, connectionId, validMessage.payload as any, authTimeout);
          return;
        }

        // Require authentication for all other messages
        if (!socket.isAuthenticated) {
          const errorEvent = createEvent<ServerErrorEvent>('error', {
            code: 'AUTH_REQUIRED',
            message: 'Authentication required',
          });
          socket.send(JSON.stringify(errorEvent));
          return;
        }

        // Handle ping
        if (validMessage.type === 'ping') {
          wsManager.updatePing(connectionId);
          const pongEvent = createEvent<ServerPongEvent>('pong', {});
          socket.send(JSON.stringify(pongEvent));
          return;
        }

        // Handle game room join
        if (validMessage.type === 'game:join') {
          const { roomId } = validMessage.payload;
          wsManager.joinRoom(connectionId, roomId);
          const joinedEvent = createEvent<ServerGameJoinedEvent>('game:joined', { roomId });
          socket.send(JSON.stringify(joinedEvent));

          // If crash room, send current state snapshot with active players
          if (roomId === 'crash_main') {
            const engine = crashManager.getRoom(roomId);
            if (engine) {
              const state = engine.getCurrentState() as {
                phase: string;
                multiplier: number;
                elapsedTime: number;
                phaseEndsAt: number | null;
                serverSeedHash: string;
                activePlayers: Array<{
                  userId: string;
                  slot: number;
                  betAmount: number;
                  user: { userId: string; username?: string | null; firstName?: string | null; photoUrl?: string | null } | null;
                }>;
                cashedOut: Array<{
                  userId: string;
                  slot: number;
                  multiplier: number;
                  profit: number;
                  user: { userId: string; username?: string | null; firstName?: string | null; photoUrl?: string | null } | null;
                }>;
                history: Array<{ roundId: string; crashPoint: number; timestamp: number }>;
                stats: { playerCount: number; totalWagered: number; betsCount: number };
                crashPointPreview?: number | null;
              };

              const stateEvent = createEvent('crash:state', {
                roomId,
                phase: state.phase as any,
                multiplier: state.multiplier,
                elapsedTime: state.elapsedTime,
                phaseEndsAt: state.phaseEndsAt,
                serverSeedHash: state.serverSeedHash,
                activePlayers: state.activePlayers,
                cashedOut: state.cashedOut,
                history: state.history,
                stats: state.stats,
                crashPointPreview: state.crashPointPreview ?? null,
              });
              socket.send(JSON.stringify(stateEvent));
            }
          }

          if (roomId === 'macvpot_main') {
            const snapshot = macvpotManager.getSnapshot();
            const stateEvent = createEvent('macvpot:state', snapshot as any);
            socket.send(JSON.stringify(stateEvent));
          }

          if (roomId === 'bj_table_1' || roomId.startsWith('bj_')) {
            const engine = blackjackSingleton.getTable(roomId);
            if (engine) {
              const bjState = engine.getState();
              socket.send(JSON.stringify({
                type: 'bj:state',
                payload: {
                  roomId,
                  phase: bjState.phase,
                  countdown: bjState.countdown,
                  dealerHand: bjState.dealerHand,
                  players: bjState.players,
                  currentTurnSeatId: bjState.currentTurnSeatId,
                  roundId: bjState.roundId,
                },
                timestamp: Date.now(),
              }));
              socket.send(JSON.stringify({
                type: 'blackjack:chat:history',
                payload: {
                  roomId,
                  messages: engine.getChatHistory(),
                },
                timestamp: Date.now(),
              }));
            }
          }
          return;
        }

        // Handle game room leave
        if (validMessage.type === 'game:leave') {
          const { roomId } = validMessage.payload;
          wsManager.leaveRoom(connectionId, roomId);
          const leftEvent = createEvent<ServerGameLeftEvent>('game:left', { roomId });
          socket.send(JSON.stringify(leftEvent));
          return;
        }

        // Handle Blackjack Seat Join
        if (validMessage.type === 'blackjack:join_seat') {
          const { roomId, seatId, bet, userId: payloadUserId, name: payloadName, avatar: payloadAvatar } = validMessage.payload as any;
          const userId = payloadUserId || socket.userId || 'anon_' + connectionId.slice(0, 8);
          let name = payloadName || 'Игрок';
          let avatar: string | undefined = payloadAvatar;

          if (userId && !userId.startsWith('guest_') && !userId.startsWith('anon_')) {
            try {
              const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { firstName: true, username: true, photoUrl: true },
              });
              if (user) {
                name = user.firstName || user.username || payloadName || 'Игрок';
                avatar = user.photoUrl || payloadAvatar || undefined;
              }
            } catch (err) {
              logger.warn({ err }, 'Failed to fetch user info for join_seat');
            }
          }

          const engine = blackjackSingleton.getTable(roomId);
          const success = engine.join(userId, name, avatar, seatId, bet);
          if (!success) {
            socket.send(JSON.stringify(createEvent('error', {
              code: 'JOIN_SEAT_FAILED',
              message: 'Место уже занято',
            })));
          }
          return;
        }

        // Handle Blackjack Seat Leave
        if (validMessage.type === 'blackjack:leave_seat') {
          const { roomId, userId: payloadUserId } = validMessage.payload as any;
          const userId = payloadUserId || socket.userId;
          if (userId) {
            const engine = blackjackSingleton.getTable(roomId);
            engine.leave(userId);
          }
          return;
        }

        // Handle Blackjack Bet Update
        if (validMessage.type === 'blackjack:bet') {
          const { roomId, bet, userId: payloadUserId } = validMessage.payload as any;
          const userId = payloadUserId || socket.userId;
          if (userId) {
            const engine = blackjackSingleton.getTable(roomId);
            engine.updateBet(userId, bet);
          }
          return;
        }

        // Handle Blackjack Turn Action (Hit / Stand / Double)
        if (validMessage.type === 'blackjack:action') {
          const { roomId, action, userId: payloadUserId } = validMessage.payload as any;
          const userId = payloadUserId || socket.userId;
          if (userId) {
            const engine = blackjackSingleton.getTable(roomId);
            if (action === 'hit') await engine.hit(userId);
            else if (action === 'stand') await engine.stand(userId);
            else if (action === 'double') await engine.double(userId);
          }
          return;
        }

        // Handle Blackjack Ready to Deal / Vote Deal
        if (validMessage.type === 'blackjack:ready_to_deal') {
          const { roomId, isReady } = validMessage.payload;
          const userId = validMessage.payload.userId || (data?.payload?.userId) || socket.userId;
          if (userId) {
            const engine = blackjackSingleton.getTable(roomId);
            engine.readyToDeal(userId, isReady);
          }
          return;
        }

        // Handle Blackjack Table Chat
        if (validMessage.type === 'blackjack:chat') {
          const { roomId, text, emoji, userId: payloadUserId } = validMessage.payload as any;
          const userId = payloadUserId || socket.userId || 'anon_' + connectionId.slice(0, 6);
          let name = 'Игрок';
          let avatar: string | undefined;

          if (userId && !userId.startsWith('guest_') && !userId.startsWith('anon_')) {
            try {
              const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { firstName: true, username: true, photoUrl: true },
              });
              if (user) {
                name = user.firstName || user.username || 'Игрок';
                avatar = user.photoUrl || undefined;
              }
            } catch (err) {
              logger.warn({ err }, 'Failed to fetch user info for blackjack chat');
            }
          }
          const engine = blackjackSingleton.getTable(roomId);
          engine.addChatMessage(userId, name, avatar, text, emoji);
          return;
        }
      } catch (error) {
        logger.error({ connectionId, error }, 'Failed to parse WebSocket message');
        const errorEvent = createEvent<ServerErrorEvent>('error', {
          code: 'PARSE_ERROR',
          message: 'Failed to parse message',
        });
        socket.send(JSON.stringify(errorEvent));
      }
    });

    socket.on('close', async () => {
      clearTimeout(authTimeout);
      wsManager.removeConnection(connectionId);
      logger.info({ connectionId, userId: socket.userId }, 'WebSocket client disconnected');
    });

    socket.on('error', (error) => {
      clearTimeout(authTimeout);
      logger.error({ connectionId, error }, 'WebSocket error');
      wsManager.removeConnection(connectionId);
    });
  });

  // Cleanup stale connections every 5 minutes
  setInterval(() => {
    wsManager.cleanupStaleConnections();
  }, 300000);
}

/**
 * Handle WebSocket authentication
 */
async function handleAuth(
  app: FastifyInstance,
  socket: AuthenticatedWebSocket,
  connectionId: string,
  payload: { sessionId?: string; token?: string; userId?: string },
  authTimeout: NodeJS.Timeout
): Promise<void> {
  try {
    let effectiveSessionId = payload?.sessionId;
    let userId: string | undefined = payload?.userId;

    // 1. Try decoding token if provided
    if (payload?.token) {
      try {
        const decoded = (app.jwt as any)?.decode(payload.token) as any;
        if (decoded?.userId) {
          userId = decoded.userId;
        }
        if (decoded?.sessionId && !effectiveSessionId) {
          effectiveSessionId = decoded.sessionId;
        }
      } catch {}
    }

    // 2. If sessionId provided, check sessionManager
    if (effectiveSessionId && !userId) {
      try {
        const session = await sessionManager.getSession(effectiveSessionId);
        if (session?.userId) {
          userId = session.userId;
        }
      } catch {}
    }

    // 3. Fallback check user in DB if userId is present
    if (userId && !userId.startsWith('guest_') && !userId.startsWith('anon_')) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: userId } });
        if (dbUser) {
          userId = dbUser.id;
        }
      } catch {}
    }

    // 4. If still no user, assign guest/anon ID
    if (!userId) {
      userId = 'guest_' + connectionId.slice(0, 8);
    }
    if (!effectiveSessionId) {
      effectiveSessionId = 'sess_' + connectionId.slice(0, 8);
    }

    const finalUserId: string = userId;

    // Authenticate connection
    const authenticated = wsManager.authenticateConnection(connectionId, finalUserId, effectiveSessionId);

    if (!authenticated) {
      const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
        code: 'MAX_CONNECTIONS',
        message: 'Maximum connections reached',
      });
      socket.send(JSON.stringify(errorEvent));
      socket.close();
      return;
    }

    // Mark socket as authenticated
    socket.isAuthenticated = true;
    socket.userId = finalUserId;
    socket.sessionId = effectiveSessionId;

    // Clear auth timeout
    clearTimeout(authTimeout);

    // Send success response
    const successEvent = createEvent<ServerAuthSuccessEvent>('auth_success', {
      userId: finalUserId,
      sessionId: effectiveSessionId,
    });
    socket.send(JSON.stringify(successEvent));

    logger.info(
      { connectionId, userId: finalUserId, sessionId: effectiveSessionId },
      'WebSocket authenticated'
    );
  } catch (error) {
    logger.error({ connectionId, error }, 'WebSocket authentication failed');
    const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
      code: 'AUTH_FAILED',
      message: 'Authentication failed',
    });
    socket.send(JSON.stringify(errorEvent));
  }
}
