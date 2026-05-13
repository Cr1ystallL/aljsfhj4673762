import { create } from 'zustand';

/**
 * WebSocket connection state store
 * Manages WebSocket connection status and reconnection
 */

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface WebSocketState {
  status: ConnectionStatus;
  reconnectAttempts: number;
  lastError: string | null;
  
  // Actions
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setError: (error: string | null) => void;
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  lastError: null,
  
  setStatus: (status) =>
    set({ status }),
  
  incrementReconnectAttempts: () =>
    set((state) => ({
      reconnectAttempts: state.reconnectAttempts + 1,
    })),
  
  resetReconnectAttempts: () =>
    set({ reconnectAttempts: 0 }),
  
  setError: (error) =>
    set({ lastError: error }),
}));
