'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useWebSocketStore } from '@/store/websocket-store';
import { createAuthenticatedWebSocket } from '@/lib/websocket/authenticated-client';
import type { WSMessage } from '@casino/shared';

/**
 * WebSocket Provider
 * Manages WebSocket connection and real-time updates
 * 
 * CRITICAL: Handles balance sync and reconnection
 */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { user, isAuthenticated, sessionId } = useAuthStore();
  const { setBalance } = useBalanceStore();
  const { setStatus, setError, incrementReconnectAttempts, resetReconnectAttempts } = useWebSocketStore();

  useEffect(() => {
    if (!isAuthenticated || !user || !sessionId) {
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    const ws = createAuthenticatedWebSocket(wsUrl);
    wsRef.current = ws;

    // Connect and authenticate
    const connect = async () => {
      try {
        setStatus('connecting');
        
        await ws.connectAuthenticated(sessionId);
        setStatus('connected');
        setError(null);
        resetReconnectAttempts();

        // Listen for balance updates
        ws.onMessage((message: WSMessage) => {
          if (message.type === 'balance_update') {
            const payload = message.payload as {
              amount: number;
              currency: string;
              demoMode: boolean;
              timestamp: number;
            };

            setBalance({
              userId: user.id,
              amount: payload.amount,
              currency: payload.currency,
              demoMode: payload.demoMode,
              lastSyncedAt: new Date(payload.timestamp),
            });
          }
        });

        // Handle disconnection
        ws.onDisconnect(() => {
          setStatus('reconnecting');
          incrementReconnectAttempts();
          
          // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
          const delay = Math.min(1000 * Math.pow(2, useWebSocketStore.getState().reconnectAttempts), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        });
      } catch (error) {
        setStatus('error');
        setError(error instanceof Error ? error.message : 'Connection failed');
        incrementReconnectAttempts();
        
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, useWebSocketStore.getState().reconnectAttempts), 30000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      ws.disconnect();
    };
  }, [isAuthenticated, user, sessionId, setBalance, setStatus, setError, incrementReconnectAttempts, resetReconnectAttempts]);

  return <>{children}</>;
}
