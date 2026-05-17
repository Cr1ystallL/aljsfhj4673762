import { useCallback } from 'react';
import { useBalanceStore } from '@/store/balance-store';
import { apiClient } from '@/lib/api/client';

/**
 * Balance hook — single source of truth for the user's real-money balance.
 *
 * The same `balances` row is shared between the Python Telegram bot and
 * the Node backend, so the figure rendered here always matches what the
 * user sees in the bot. There is no demo balance.
 *
 * Selector-aware: each callback uses `useBalanceStore.getState()` so this
 * hook itself doesn't subscribe to the whole store. Pages that only need
 * the balance value should select it explicitly via `useBalanceStore(
 * (s) => s.balance)` to avoid re-rendering on `isLoading` flips.
 */
export function useBalance() {
  const balance = useBalanceStore((s) => s.balance);
  const isLoading = useBalanceStore((s) => s.isLoading);

  const fetchBalance = useCallback(async () => {
    const store = useBalanceStore.getState();
    store.setLoading(true);
    try {
      const response = await apiClient.get<{
        balance: { amount: number; currency: string };
      }>(`/api/balance`);
      store.setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: false,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      store.setLoading(false);
    }
  }, []);

  const syncBalance = useCallback(async () => {
    try {
      const response = await apiClient.post<{
        balance: { amount: number; currency: string };
      }>('/api/balance/sync', {});
      useBalanceStore.getState().setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: false,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, []);

  const optimisticUpdate = useCallback((delta: number) => {
    const cur = useBalanceStore.getState().balance;
    if (!cur) return;
    useBalanceStore.getState().updateBalance(cur.amount + delta);
  }, []);

  return {
    balance,
    isLoading,
    fetchBalance,
    syncBalance,
    optimisticUpdate,
  };
}
