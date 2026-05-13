import { EventEmitter } from 'events';
import { wsManager } from '../lib/websocket-manager.js';
import { logger } from '../utils/logger.js';
import type { BaseGameEngine } from './base-game-engine.js';
import type { GameType, GameEvent } from './types.js';

/**
 * Game Room Manager
 * Manages multiple game instances and player routing
 * 
 * ARCHITECTURE:
 * - One manager per game type
 * - Handles room creation/destruction
 * - Routes events to WebSocket clients
 * - Manages spectator synchronization
 * - Handles late join synchronization
 */

export class GameRoomManager extends EventEmitter {
  private rooms: Map<string, BaseGameEngine> = new Map();
  private playerRooms: Map<string, string> = new Map(); // userId -> roomId
  private spectatorRooms: Map<string, Set<string>> = new Map(); // userId -> Set<roomId>

  constructor(private gameType: GameType) {
    super();
  }

  /**
   * Create new game room
   */
  createRoom(roomId: string, engine: BaseGameEngine): void {
    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists`);
    }

    this.rooms.set(roomId, engine);

    // Listen to game events and broadcast
    engine.on('event', (event: GameEvent) => {
      this.broadcastToRoom(roomId, event);
    });

    logger.info({ roomId, gameType: this.gameType }, 'Game room created');
  }

  /**
   * Get game room
   */
  getRoom(roomId: string): BaseGameEngine | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Delete game room
   */
  deleteRoom(roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (engine) {
      engine.stop();
      engine.removeAllListeners();
    }

    this.rooms.delete(roomId);

    // Clean up player mappings
    for (const [userId, mappedRoomId] of this.playerRooms.entries()) {
      if (mappedRoomId === roomId) {
        this.playerRooms.delete(userId);
      }
    }

    // Clean up spectator mappings
    for (const [userId, roomIds] of this.spectatorRooms.entries()) {
      roomIds.delete(roomId);
      if (roomIds.size === 0) {
        this.spectatorRooms.delete(userId);
      }
    }

    logger.info({ roomId, gameType: this.gameType }, 'Game room deleted');
  }

  /**
   * Join player to room
   */
  joinRoom(userId: string, roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (!engine) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Leave current room if any
    const currentRoom = this.playerRooms.get(userId);
    if (currentRoom && currentRoom !== roomId) {
      this.leaveRoom(userId, currentRoom);
    }

    engine.addPlayer(userId);
    this.playerRooms.set(userId, roomId);

    // Send current state to player (late join sync)
    this.syncPlayerState(userId, roomId);

    logger.info({ userId, roomId, gameType: this.gameType }, 'Player joined room');
  }

  /**
   * Leave room
   */
  leaveRoom(userId: string, roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (engine) {
      engine.removePlayer(userId);
    }

    this.playerRooms.delete(userId);

    logger.info({ userId, roomId, gameType: this.gameType }, 'Player left room');
  }

  /**
   * Join as spectator
   */
  spectateRoom(userId: string, roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (!engine) {
      throw new Error(`Room ${roomId} not found`);
    }

    engine.addSpectator(userId);

    let rooms = this.spectatorRooms.get(userId);
    if (!rooms) {
      rooms = new Set();
      this.spectatorRooms.set(userId, rooms);
    }
    rooms.add(roomId);

    // Send current state to spectator
    this.syncPlayerState(userId, roomId);

    logger.info({ userId, roomId, gameType: this.gameType }, 'Spectator joined room');
  }

  /**
   * Stop spectating room
   */
  stopSpectating(userId: string, roomId: string): void {
    const engine = this.rooms.get(roomId);
    if (engine) {
      engine.removeSpectator(userId);
    }

    const rooms = this.spectatorRooms.get(userId);
    if (rooms) {
      rooms.delete(roomId);
      if (rooms.size === 0) {
        this.spectatorRooms.delete(userId);
      }
    }

    logger.info({ userId, roomId, gameType: this.gameType }, 'Spectator left room');
  }

  /**
   * Broadcast event to all players in room
   */
  private async broadcastToRoom(roomId: string, event: GameEvent): Promise<void> {
    // Use WebSocket manager to broadcast to room
    await wsManager.publishBroadcast({
      room: roomId,
      message: {
        type: 'game:event',
        payload: event,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Sync current game state to player (late join)
   */
  private async syncPlayerState(userId: string, roomId: string): Promise<void> {
    const engine = this.rooms.get(roomId);
    if (!engine) {
      return;
    }

    const state = engine.getState();

    await wsManager.publishBroadcast({
      userId,
      message: {
        type: 'game:state_sync',
        payload: {
          roomId,
          gameType: this.gameType,
          state: {
            ...state,
            players: Array.from(state.players.entries()).map(([id, player]) => ({
              id,
              bet: player.bet,
              demoMode: player.demoMode,
            })),
            spectators: Array.from(state.spectators),
          },
        },
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get player's current room
   */
  getPlayerRoom(userId: string): string | undefined {
    return this.playerRooms.get(userId);
  }

  /**
   * Get all rooms player is spectating
   */
  getSpectatingRooms(userId: string): Set<string> {
    return this.spectatorRooms.get(userId) || new Set();
  }

  /**
   * Get all active rooms
   */
  getAllRooms(): Map<string, BaseGameEngine> {
    return new Map(this.rooms);
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Get total player count across all rooms
   */
  getTotalPlayerCount(): number {
    let count = 0;
    for (const engine of this.rooms.values()) {
      count += engine.getState().players.size;
    }
    return count;
  }
}
