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
  ServerBlackjackSeatUpdateEvent,
  ServerBlackjackStateEvent,
  ServerCrashStateEvent,
} from '@casino/shared';
import { crashManager } from '../game-engine/crash-room-singleton.js';
import { getBlackjackRooms, joinBlackjackSeat, leaveBlackjackRoom, serializeRoom } from '../services/blackjack-room-store.js';
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
          await handleAuth(socket, connectionId, validMessage.payload, authTimeout);
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

          // If blackjack room, send current state snapshot
          if (roomId.startsWith('blackjack')) {
            const rooms = await getBlackjackRooms();
            const room = rooms.find((r) => r.id === roomId);
            if (room) {
              const stateEvent = createEvent<ServerBlackjackStateEvent>('bj:state', serializeRoom(room));
              socket.send(JSON.stringify(stateEvent));
            }
          }

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
                  payout: number;
                  timestamp: number;
                }>;
                history: Array<{ crashPoint: number; roundId?: string }>;
                stats: { playerCount: number; totalWagered: number; betsCount: number };
                crashPointPreview?: number | null;
              };

              const stateEvent = createEvent<ServerCrashStateEvent>('crash:state', {
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
          return;
        }

        // Handle game room leave
        if (validMessage.type === 'game:leave') {
          const { roomId } = validMessage.payload;
          wsManager.leaveRoom(connectionId, roomId);
          const leftEvent = createEvent<ServerGameLeftEvent>('game:left', { roomId });
          socket.send(JSON.stringify(leftEvent));

          if (roomId.startsWith('blackjack') && socket.userId) {
            const updated = await leaveBlackjackRoom(roomId, socket.userId);
            if (updated) {
              const updateEvent = createEvent<ServerBlackjackSeatUpdateEvent>('bj:seat_update', {
                roomId: updated.id,
                seats: updated.seats,
              });
              wsManager.broadcastToRoom(roomId, updateEvent);
            }
          }
          return;
        }

        // Handle blackjack seat selection
        if (validMessage.type === 'bj:seat') {
          if (!socket.userId) {
            const errorEvent = createEvent<ServerErrorEvent>('error', {
              code: 'AUTH_REQUIRED',
              message: 'Authentication required',
            });
            socket.send(JSON.stringify(errorEvent));
            return;
          }
          const { roomId, seatId, name, avatar } = validMessage.payload as {
            roomId: string;
            seatId: number;
            name: string;
            avatar?: string;
          };

          const updatedRoom = await joinBlackjackSeat(roomId, seatId, {
            id: socket.userId,
            name,
            avatar,
          });

          if (!updatedRoom) {
            const errorEvent = createEvent<ServerErrorEvent>('error', {
              code: 'SEAT_FAILED',
              message: 'Cannot take seat',
            });
            socket.send(JSON.stringify(errorEvent));
            return;
          }

          const updateEvent = createEvent<ServerBlackjackSeatUpdateEvent>('bj:seat_update', {
            roomId: updatedRoom.id,
            seats: updatedRoom.seats,
          });
          wsManager.broadcastToRoom(updatedRoom.id, updateEvent);
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
      if (socket.userId) {
        const rooms = wsManager.getConnectionRooms(connectionId);
        for (const roomId of rooms) {
          if (roomId.startsWith('blackjack')) {
            const updated = await leaveBlackjackRoom(roomId, socket.userId);
            if (updated) {
              const updateEvent = createEvent<ServerBlackjackSeatUpdateEvent>('bj:seat_update', {
                roomId: updated.id,
                seats: updated.seats,
              });
              wsManager.broadcastToRoom(roomId, updateEvent);
            }
          }
        }
      }
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
 * 
 * SECURITY:
 * - Validates session token from Redis
 * - Associates connection with user
 * - Supports reconnection with existing session
 */
async function handleAuth(
  socket: AuthenticatedWebSocket,
  connectionId: string,
  payload: { sessionId: string },
  authTimeout: NodeJS.Timeout
): Promise<void> {
  try {
    const { sessionId } = payload;

    if (!sessionId) {
      const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
        code: 'MISSING_CREDENTIALS',
        message: 'sessionId required',
      });
      socket.send(JSON.stringify(errorEvent));
      return;
    }

    // Get session from Redis
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
        code: 'INVALID_SESSION',
        message: 'Session not found or expired',
      });
      socket.send(JSON.stringify(errorEvent));
      return;
    }

    // Authenticate connection
    const authenticated = wsManager.authenticateConnection(connectionId, session.userId, sessionId);

    if (!authenticated) {
      const errorEvent = createEvent<ServerAuthErrorEvent>('auth_error', {
        code: 'MAX_CONNECTIONS',
        message: 'Maximum connections per user reached',
      });
      socket.send(JSON.stringify(errorEvent));
      socket.close();
      return;
    }

    // Mark socket as authenticated
    socket.isAuthenticated = true;
    socket.userId = session.userId;
    socket.sessionId = session.sessionId;

    // Clear auth timeout
    clearTimeout(authTimeout);

    // Update session activity
    await sessionManager.updateActivity(session.sessionId);

    // Send success response
    const successEvent = createEvent<ServerAuthSuccessEvent>('auth_success', {
      userId: session.userId,
      sessionId: session.sessionId,
    });
    socket.send(JSON.stringify(successEvent));

    logger.info(
      { connectionId, userId: session.userId, sessionId: session.sessionId },
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
