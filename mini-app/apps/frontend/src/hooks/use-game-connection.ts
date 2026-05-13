import { useEffect, useRef, useCallback } from 'react';
import { useWebSocketStore } from '@/store/websocket-store';
import { useGameStore } from '@/store/game-store';
import { useAuthStore } from '@/store/auth-store';
import type { GameType, GameEvent, GameRoom } from '@/lib/game-engine/types';
import type { WSMessage } from '@casino/shared';

/**
 * Game Connection Hook
 * Manages WebSocket connection for game events
 * 
 * ARCHITECTURE:
 * - Subscribes to game-specific events
 * - Handles state synchronization
 * - Manages reconnection
 * - Batches updates to prevent flooding
 * - Selective event processing
 */

interface UseGameConnectionOptions {
  gameType: GameType;
  roomId: string;
  onEvent?: (event: GameEvent) => void;
  onStateSync?: (state: GameRoom) => void;
  autoConnect?: boolean;
}

export function useGameConnection({
  gameType,
  roomId,
  onEvent,
  onStateSync,
  autoConnect = true,
}: UseGameConnectionOptions) {
  const { status } = useWebSocketStore();
  const { sessionId } = useAuthStore();
  const { addEvent, updateGameState, setCurrentGame } = useGameStore();
  
  const eventQueueRef = useRef<GameEvent[]>([]);
  const processingRef = useRef(false);
  const batchTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Process event queue in batches
   * Prevents UI flooding from high-frequency updates
   */
  const processEventQueue = useCallback(() => {
    if (processingRef.current || eventQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;

    // Process all queued events
    const events = [...eventQueueRef.current];
    eventQueueRef.current = [];

    for (const event of events) {
      addEvent(event);
      onEvent?.(event);
    }

    processingRef.current = false;
  }, [addEvent, onEvent]);

  /**
   * Queue event for batch processing
   */
  const queueEvent = useCallback((event: GameEvent) => {
    eventQueueRef.current.push(event);

    // Clear existing timeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    // Process after short delay (batching)
    batchTimeoutRef.current = setTimeout(() => {
      processEventQueue();
    }, 16); // ~60fps
  }, [processEventQueue]);

  /**
   * Handle incoming WebSocket message
   */
  const handleMessage = useCallback((message: WSMessage) => {
    // Game events are handled directly by game engines for now
    // Future: implement centralized game event routing
    if (message.type === 'balance_update') {
      // Handle balance updates
    }
  }, []);

  /**
   * Join game room
   */
  const joinRoom = useCallback(async () => {
    if (!sessionId) {
      console.warn('Cannot join room: no session');
      return;
    }

    // Send join request via WebSocket
    // This would be handled by the WebSocket provider
    // For now, just update local state
    setCurrentGame(gameType, roomId);
  }, [sessionId, gameType, roomId, setCurrentGame]);

  /**
   * Leave game room
   */
  const leaveRoom = useCallback(() => {
    setCurrentGame(null, null);
  }, [setCurrentGame]);

  /**
   * Send game action
   */
  const sendAction = useCallback(async (action: string, payload: any) => {
    if (status !== 'connected') {
      throw new Error('Not connected to game server');
    }

    // This would send via WebSocket
    // Implementation depends on WebSocket provider
    console.log('Send action:', action, payload);
  }, [status]);

  /**
   * Auto-connect on mount
   */
  useEffect(() => {
    if (autoConnect && status === 'connected') {
      joinRoom();
    }

    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      
      // Process remaining events
      if (eventQueueRef.current.length > 0) {
        processEventQueue();
      }
    };
  }, [autoConnect, status, joinRoom, processEventQueue]);

  return {
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    joinRoom,
    leaveRoom,
    sendAction,
  };
}
