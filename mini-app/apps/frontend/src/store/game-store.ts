import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { GameType, GameState, GameRoom, GameEvent, Bet } from '@/lib/game-engine/types';

/**
 * Global Game Store
 * Centralized state management for all games
 * 
 * ARCHITECTURE:
 * - One store for all game types
 * - Selective subscriptions to minimize rerenders
 * - Optimistic updates with server confirmation
 * - Event history for debugging
 * - Rollback-safe state updates
 */

interface GameStoreState {
  // Current game session
  currentGame: GameType | null;
  currentRoom: string | null;
  gameState: GameRoom | null;
  
  // Player state
  currentBet: Bet | null;
  isPlaying: boolean;
  isSpectating: boolean;
  
  // Event history (for debugging and replay)
  eventHistory: GameEvent[];
  maxHistorySize: number;
  
  // UI state
  isBetting: boolean;
  isAnimating: boolean;
  
  // Actions
  setCurrentGame: (gameType: GameType | null, roomId: string | null) => void;
  updateGameState: (state: GameRoom) => void;
  addEvent: (event: GameEvent) => void;
  setCurrentBet: (bet: Bet | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsSpectating: (isSpectating: boolean) => void;
  setIsBetting: (isBetting: boolean) => void;
  setIsAnimating: (isAnimating: boolean) => void;
  clearHistory: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentGame: null,
    currentRoom: null,
    gameState: null,
    currentBet: null,
    isPlaying: false,
    isSpectating: false,
    eventHistory: [],
    maxHistorySize: 100,
    isBetting: false,
    isAnimating: false,
    
    // Actions
    setCurrentGame: (gameType, roomId) =>
      set({
        currentGame: gameType,
        currentRoom: roomId,
      }),
    
    updateGameState: (state) =>
      set({
        gameState: state,
      }),
    
    addEvent: (event) =>
      set((state) => {
        const history = [...state.eventHistory, event];
        
        // Trim history if too large
        if (history.length > state.maxHistorySize) {
          history.shift();
        }
        
        return { eventHistory: history };
      }),
    
    setCurrentBet: (bet) =>
      set({ currentBet: bet }),
    
    setIsPlaying: (isPlaying) =>
      set({ isPlaying }),
    
    setIsSpectating: (isSpectating) =>
      set({ isSpectating }),
    
    setIsBetting: (isBetting) =>
      set({ isBetting }),
    
    setIsAnimating: (isAnimating) =>
      set({ isAnimating }),
    
    clearHistory: () =>
      set({ eventHistory: [] }),
    
    reset: () =>
      set({
        currentGame: null,
        currentRoom: null,
        gameState: null,
        currentBet: null,
        isPlaying: false,
        isSpectating: false,
        eventHistory: [],
        isBetting: false,
        isAnimating: false,
      }),
  }))
);

/**
 * Selector hooks for optimized subscriptions
 * Prevents unnecessary rerenders
 */

export const useCurrentGame = () => useGameStore((state) => state.currentGame);
export const useGameState = () => useGameStore((state) => state.gameState);
export const useCurrentBet = () => useGameStore((state) => state.currentBet);
export const useIsPlaying = () => useGameStore((state) => state.isPlaying);
export const useIsAnimating = () => useGameStore((state) => state.isAnimating);

/**
 * Subscribe to specific game events
 */
export function subscribeToGameEvents(
  eventType: string,
  callback: (event: GameEvent) => void
): () => void {
  return useGameStore.subscribe(
    (state) => state.eventHistory,
    (history) => {
      const latestEvent = history[history.length - 1];
      if (latestEvent && latestEvent.type === eventType) {
        callback(latestEvent);
      }
    }
  );
}
