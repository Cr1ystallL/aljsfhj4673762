import type { WsSocket } from './ws-socket.js';
import { logger } from '../utils/logger.js';
import { redisClient } from './redis.js';

/**
 * WebSocket connection manager
 * Handles connection tracking, broadcasting, and pub/sub for horizontal scaling
 */

interface Connection {
  socket: WsSocket;
  userId: string | null;
  sessionId: string | null;
  gameRooms: Set<string>; // Track which game rooms user is in
  connectedAt: Date;
  lastPing: Date;
}

export class WebSocketManager {
  private connections: Map<string, Connection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private roomConnections: Map<string, Set<string>> = new Map(); // roomId -> connectionIds
  private maxConnectionsPerUser = 5;

  constructor() {
    // Pub/sub setup moved to init() to ensure Redis is connected first
  }

  /**
   * Initialize pub/sub after Redis connection is established
   */
  async init(): Promise<void> {
    await this.setupPubSub();
  }

  /**
   * Get list of rooms for a connection
   */
  getConnectionRooms(connectionId: string): string[] {
    const connection = this.connections.get(connectionId);
    if (!connection) return [];
    return Array.from(connection.gameRooms);
  }

  /**
   * Setup Redis pub/sub for broadcasting across servers
   */
  private async setupPubSub(): Promise<void> {
    try {
      const subscriber = redisClient.getSubscriber();
      
      // Subscribe to broadcast channel
      await subscriber.subscribe('ws:broadcast');
      
      subscriber.on('message', (channel, message) => {
        if (channel === 'ws:broadcast') {
          try {
            const data = JSON.parse(message);
            this.handleBroadcastMessage(data);
          } catch (error) {
            logger.error(error, 'Failed to parse broadcast message');
          }
        }
      });
    } catch (error) {
      logger.warn(error, 'Redis pub/sub not available, broadcasting will be local only');
    }
  }

  /**
   * Handle broadcast message from Redis
   */
  private handleBroadcastMessage(data: {
    userId?: string;
    room?: string;
    message: unknown;
  }): void {
    if (data.userId) {
      this.sendToUser(data.userId, data.message);
    } else if (data.room) {
      this.broadcastToRoom(data.room, data.message);
    } else {
      this.broadcastToAll(data.message);
    }
  }

  /**
   * Add new connection
   */
  addConnection(connectionId: string, socket: WsSocket): boolean {
    if (this.connections.has(connectionId)) {
      logger.warn({ connectionId }, 'Connection already exists');
      return false;
    }

    this.connections.set(connectionId, {
      socket,
      userId: null,
      sessionId: null,
      gameRooms: new Set(),
      connectedAt: new Date(),
      lastPing: new Date(),
    });

    logger.info({ connectionId, total: this.connections.size }, 'Connection added');
    return true;
  }

  /**
   * Associate connection with user and session
   */
  authenticateConnection(connectionId: string, userId: string, sessionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Check max connections per user
    const userConns = this.userConnections.get(userId) || new Set();
    if (userConns.size >= this.maxConnectionsPerUser) {
      logger.warn({ userId, count: userConns.size }, 'Max connections per user reached');
      return false;
    }

    connection.userId = userId;
    connection.sessionId = sessionId;
    userConns.add(connectionId);
    this.userConnections.set(userId, userConns);

    logger.info({ connectionId, userId, sessionId }, 'Connection authenticated');
    return true;
  }

  /**
   * Join game room
   */
  joinRoom(connectionId: string, roomId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.userId) {
      logger.warn({ connectionId, roomId }, 'Cannot join room: not authenticated');
      return false;
    }

    connection.gameRooms.add(roomId);

    const roomConns = this.roomConnections.get(roomId) || new Set();
    roomConns.add(connectionId);
    this.roomConnections.set(roomId, roomConns);

    logger.info({ connectionId, userId: connection.userId, roomId }, 'Joined game room');
    return true;
  }

  /**
   * Leave game room
   */
  leaveRoom(connectionId: string, roomId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.gameRooms.delete(roomId);
    }

    const roomConns = this.roomConnections.get(roomId);
    if (roomConns) {
      roomConns.delete(connectionId);
      if (roomConns.size === 0) {
        this.roomConnections.delete(roomId);
      }
    }

    logger.info({ connectionId, roomId }, 'Left game room');
  }

  /**
   * Remove connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from user connections
    if (connection.userId) {
      const userConns = this.userConnections.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // Remove from all game rooms
    connection.gameRooms.forEach((roomId) => {
      this.leaveRoom(connectionId, roomId);
    });

    // Clear game rooms set
    connection.gameRooms.clear();

    this.connections.delete(connectionId);
    logger.info({ connectionId, userId: connection.userId, total: this.connections.size }, 'Connection removed');
  }

  /**
   * Update last ping time
   */
  updatePing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPing = new Date();
    }
  }

  /**
   * Send message to specific user (all their connections)
   */
  sendToUser(userId: string, message: unknown): void {
    const userConns = this.userConnections.get(userId);
    if (!userConns) {
      return;
    }

    const messageStr = JSON.stringify(message);
    let sent = 0;

    userConns.forEach((connectionId) => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.socket.readyState === 1) {
        connection.socket.send(messageStr);
        sent++;
      }
    });

    logger.debug({ userId, sent }, 'Message sent to user');
  }

  /**
   * Broadcast to all connections
   */
  broadcastToAll(message: unknown): void {
    const messageStr = JSON.stringify(message);
    let sent = 0;

    this.connections.forEach((connection) => {
      if (connection.socket.readyState === 1) {
        connection.socket.send(messageStr);
        sent++;
      }
    });

    logger.debug({ sent }, 'Message broadcast to all');
  }

  /**
   * Broadcast to game room
   */
  broadcastToRoom(roomId: string, message: unknown): void {
    const roomConns = this.roomConnections.get(roomId);
    if (!roomConns || roomConns.size === 0) {
      return;
    }

    const messageStr = JSON.stringify(message);
    let sent = 0;

    roomConns.forEach((connectionId) => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.socket.readyState === 1) {
        connection.socket.send(messageStr);
        sent++;
      }
    });

    logger.debug({ roomId, sent }, 'Message broadcast to room');
  }

  /**
   * Publish message to Redis for cross-server broadcasting
   */
  async publishBroadcast(data: {
    userId?: string;
    room?: string;
    message: unknown;
  }): Promise<void> {
    try {
      const publisher = redisClient.getPublisher();
      await publisher.publish('ws:broadcast', JSON.stringify(data));
    } catch (error) {
      logger.warn(error, 'Failed to publish broadcast, falling back to local');
      // Fallback to local broadcast
      this.handleBroadcastMessage(data);
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get user connection count
   */
  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  /**
   * Get room connection count
   */
  getRoomConnectionCount(roomId: string): number {
    return this.roomConnections.get(roomId)?.size || 0;
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(maxAgeMs: number = 300000): void {
    const now = Date.now();
    const stale: string[] = [];

    this.connections.forEach((connection, connectionId) => {
      const age = now - connection.lastPing.getTime();
      if (age > maxAgeMs) {
        stale.push(connectionId);
      }
    });

    stale.forEach((connectionId) => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.socket.close();
        this.removeConnection(connectionId);
      }
    });

    if (stale.length > 0) {
      logger.info({ count: stale.length }, 'Cleaned up stale connections');
    }
  }
}

export const wsManager = new WebSocketManager();
