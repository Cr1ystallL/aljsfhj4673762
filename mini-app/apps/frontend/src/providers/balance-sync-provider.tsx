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
 *   - On a 8-second timer as a defence-in-depth (was 20s before, but
 *     bot-side bets land faster than that and players were ending up
 *     with a stale balance pill — the fetch is a single tiny GET so
 *     bumping it to 8s is fine).
 *   - Immediately after any API error reports `INSUFFICIENT_BALANCE`
 *     (see `lib/api/errors.ts`). That error means the server's view of
 *     the balance is lower than what the client thinks, so we
 *     reconcile right away instead of waiting for the next tick.
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
    // Кастомный ивент, который шлём из reportApiError при попадании в
    // INSUFFICIENT_BALANCE. Без него баланс рассинхрона ждал до 8с
    // следующего тика — и игрок видел «есть 100 zł», но ставку 11 zł
    // не мог сделать. Теперь сразу подтягиваем актуальное значение.
    const onForceSync = () => void sync();
    const id = setInterval(() => void sync(), 8_000);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('balance:force-sync', onForceSync);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('balance:force-sync', onForceSync);
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
