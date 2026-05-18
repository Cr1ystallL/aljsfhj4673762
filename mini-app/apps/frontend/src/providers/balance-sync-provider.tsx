'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useBalanceStore } from '@/store/balance-store';
import { apiClient } from '@/lib/api/client';

/**
 * BalanceSyncProvider — keeps the user's balance fresh in real-time.
 *
 * Primary path: the WebSocket broadcasts a `balance_update` event on
 * every server-side mutation (bet placed, win, deposit credited,
 * withdrawal debited). That path lives in `WebSocketProvider`.
 *
 * This component is the *fallback*: when the WS isn't connected (e.g.
 * the user just opened the app, or backgrounded it for a minute and
 * the socket was killed) we still want the balance pill to be right.
 * It pulls a fresh value:
 *
 *   - Once on mount.
 *   - Whenever the page becomes visible again (`visibilitychange`).
 *   - On window focus.
 *   - On a 20-second timer as a defence-in-depth.
 *
 * The fetch is cheap (a single GET /api/balance) and the result is
 * compared against the current store value — if they match, no React
 * re-render is triggered.
 */
export function BalanceSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const sync = async () => {
      try {
        const res = await apiClient.get<{
          balance: { amount: number; currency: string };
        }>('/api/balance');
        if (cancelled) return;
        const next = res.balance;
        const cur = useBalanceStore.getState().balance;
        // Skip the setBalance call when the value is already current —
        // setBalance triggers a render via Zustand even when the value
        // is identical because the object reference changes.
        if (
          cur &&
          cur.amount === next.amount &&
          cur.currency === next.currency
        ) {
          return;
        }
        useBalanceStore.getState().setBalance({
          userId: cur?.userId ?? '',
          amount: next.amount,
          currency: next.currency,
          demoMode: false,
          lastSyncedAt: new Date(),
        });
      } catch {
        // Best-effort. Failures are silent — WS will reconcile.
      }
    };

    void sync();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onFocus = () => void sync();
    const id = setInterval(() => void sync(), 20_000);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
