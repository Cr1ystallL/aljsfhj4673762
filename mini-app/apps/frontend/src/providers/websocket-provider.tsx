'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { useWebSocketStore } from '@/store/websocket-store';
import { createAuthenticatedWebSocket } from '@/lib/websocket/authenticated-client';
import type { WSMessage } from '@casino/shared';

/**
 * WebSocket Provider
 *
 * Manages a single shared WebSocket connection used for cross-page
 * messages (balance updates etc). Per-game streams (e.g. crash live
 * stream) own their own sockets — this one is just the catch-all.
 *
 * Optimisation note: previously the effect listed the entire `user`
 * object plus several store actions in its dependency array, which made
 * React tear down and recreate the connection any time auth-store mutated
 * a single field. We now key purely on the immutable session id +
 * primary key (user.id) and pull store actions imperatively via
 * `getState()` so the connection survives unrelated re-renders.
 */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<ReturnType<typeof createAuthenticatedWebSocket> | null>(
    null
  );
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionId = useAuthStore((s) => s.sessionId);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!isAuthenticated || !sessionId || !userId) return;

    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';
    const base = baseRaw.replace(/\/$/, '');
    const wsUrl = /\/ws$/.test(base) ? base : `${base}/ws`;
    const ws = createAuthenticatedWebSocket(wsUrl);
    wsRef.current = ws;

    let cancelled = false;

    const connect = async () => {
      const wsStore = useWebSocketStore.getState();
      try {
        wsStore.setStatus('connecting');
        await ws.connectAuthenticated(sessionId);
        if (cancelled) return;
        wsStore.setStatus('connected');
        wsStore.setError(null);
        wsStore.resetReconnectAttempts();

        ws.onMessage((message: WSMessage) => {
          if (message.type === 'balance_update') {
            const payload = message.payload as {
              amount: number;
              currency: string;
              demoMode: boolean;
              timestamp: number;
            };
            useBalanceStore.getState().setBalance({
              userId,
              amount: payload.amount,
              currency: payload.currency,
              demoMode: payload.demoMode,
              lastSyncedAt: new Date(payload.timestamp),
            });
          }
        });

        ws.onDisconnect(() => {
          if (cancelled) return;
          const s = useWebSocketStore.getState();
          s.setStatus('reconnecting');
          s.incrementReconnectAttempts();
          const attempts = useWebSocketStore.getState().reconnectAttempts;
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
        });
      } catch (error) {
        if (cancelled) return;
        const s = useWebSocketStore.getState();
        s.setStatus('error');
        s.setError(error instanceof Error ? error.message : 'Connection failed');
        s.incrementReconnectAttempts();
        const attempts = useWebSocketStore.getState().reconnectAttempts;
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      ws.disconnect();
    };
  }, [isAuthenticated, sessionId, userId]);

  return <>{children}</>;
}
