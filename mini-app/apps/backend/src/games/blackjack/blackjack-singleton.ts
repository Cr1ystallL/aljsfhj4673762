import { BlackjackEngine, blackjackRoomManager } from './blackjack-engine.js';

export const MAIN_BJ_ROOM_ID = 'bj_table_1';

class BlackjackSingletonManager {
  /**
   * Get or initialize the primary multiplayer table
   */
  getMainTable(): BlackjackEngine {
    return blackjackRoomManager.getOrCreateRoom(MAIN_BJ_ROOM_ID);
  }

  getTable(roomId: string): BlackjackEngine {
    return blackjackRoomManager.getOrCreateRoom(roomId || MAIN_BJ_ROOM_ID);
  }

  leaveAllTables(userId: string): void {
    blackjackRoomManager.leaveAllRooms(userId);
  }
}

export const blackjackSingleton = new BlackjackSingletonManager();
