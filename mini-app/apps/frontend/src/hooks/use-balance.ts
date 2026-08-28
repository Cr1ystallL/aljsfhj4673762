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
        balance: { amount: number; currency: string; freeCases?: number; freeCasesJson?: Record<string, any>; wagerTarget?: number; wagerProgress?: number; };
        tournamentBalances?: Array<{ gameType: string; balance: number }>;
      }>(`/api/balance`);
      store.setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        freeCases: response.balance.freeCases ?? 0,
        freeCasesJson: response.balance.freeCasesJson ?? {},
        demoMode: false,
        wagerTarget: response.balance.wagerTarget,
        wagerProgress: response.balance.wagerProgress,
        lastSyncedAt: new Date(),
      }, response.tournamentBalances ?? useBalanceStore.getState().tournamentBalances);
    } catch (error: any) {
      if (error?.message === 'No access token provided' || error?.status === 401) {
        return; // Suppress expected error during initial load before auth token is set
      }
      console.error('Failed to fetch balance:', error);
    } finally {
      store.setLoading(false);
    }
  }, []);

  const syncBalance = useCallback(async () => {
    try {
      const response = await apiClient.post<{
        balance: { amount: number; currency: string; freeCases?: number; freeCasesJson?: Record<string, any>; wagerTarget?: number; wagerProgress?: number; };
        tournamentBalances?: Array<{ gameType: string; balance: number }>;
      }>('/api/balance/sync', {});
      useBalanceStore.getState().setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        freeCases: response.balance.freeCases ?? 0,
        freeCasesJson: response.balance.freeCasesJson ?? {},
        demoMode: false,
        wagerTarget: response.balance.wagerTarget,
        wagerProgress: response.balance.wagerProgress,
        lastSyncedAt: new Date(),
      }, response.tournamentBalances ?? useBalanceStore.getState().tournamentBalances);
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, []);

  const optimisticUpdate = useCallback((delta: number, gameType?: string) => {
    if (gameType) {
      const curT = useBalanceStore.getState().tournamentBalances.find(t => t.gameType === gameType);
      if (curT) {
        useBalanceStore.getState().updateBalance(curT.balance + delta, gameType);
      }
      return;
    }
    const cur = useBalanceStore.getState().balance;
    if (!cur) return;
    useBalanceStore.getState().updateBalance(cur.amount + delta);
  }, []);
  
  const freezeBalance = useCallback(() => {
    useBalanceStore.getState().freeze();
  }, []);

  const unfreezeBalance = useCallback(() => {
    useBalanceStore.getState().unfreeze();
  }, []);

  return {
    balance,
    isLoading,
    fetchBalance,
    syncBalance,
    optimisticUpdate,
    freezeBalance,
    unfreezeBalance,
  };
}
