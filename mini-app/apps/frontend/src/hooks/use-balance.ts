import { useCallback } from 'react';
import { useBalanceStore } from '@/store/balance-store';
import { apiClient } from '@/lib/api/client';

/**
 * Balance hook — single source of truth for the user's real-money balance.
 *
 * The same `balances` row is shared between the Python Telegram bot and
 * the Node backend, so the figure rendered here always matches what the
 * user sees in the bot. There is no demo balance.
 */
export function useBalance() {
  const { balance, isLoading, setBalance, setLoading, updateBalance } =
    useBalanceStore();

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{
        balance: { amount: number; currency: string };
      }>(`/api/balance`);

      setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: false,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [setBalance, setLoading]);

  /**
   * Force a re-read from the shared DB. Useful right after the bot or the
   * mini-app makes a write that we want reflected immediately.
   */
  const syncBalance = useCallback(async () => {
    try {
      const response = await apiClient.post<{
        balance: { amount: number; currency: string };
      }>('/api/balance/sync', {});

      setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: false,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, [setBalance]);

  /**
   * Optimistic local-only adjustment. The WS broadcast or REST refresh
   * will reconcile shortly.
   */
  const optimisticUpdate = useCallback(
    (delta: number) => {
      if (!balance) return;
      updateBalance(balance.amount + delta);
    },
    [balance, updateBalance]
  );

  return {
    balance,
    isLoading,
    fetchBalance,
    syncBalance,
    optimisticUpdate,
  };
}
