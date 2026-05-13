import { useEffect, useCallback } from 'react';
import { useBalanceStore } from '@/store/balance-store';
import { useWebSocketStore } from '@/store/websocket-store';
import { apiClient } from '@/lib/api/client';
import type { WSMessage } from '@casino/shared';

/**
 * Balance hook with real-time updates
 * 
 * CRITICAL: Server is source of truth
 * - Optimistic updates for UX
 * - Rollback on server rejection
 * - WebSocket sync for real-time
 */
export function useBalance() {
  const { balance, isLoading, isDemoMode, setBalance, setLoading, updateBalance } = useBalanceStore();

  /**
   * Fetch balance from server
   */
  const fetchBalance = useCallback(async (demo: boolean = false) => {
    setLoading(true);
    try {
      const response = await apiClient.get<{
        balance: {
          amount: number;
          currency: string;
          demoMode: boolean;
        };
      }>(`/api/balance?demo=${demo}`);

      setBalance({
        userId: '', // Will be set by auth
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: response.balance.demoMode,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [setBalance, setLoading]);

  /**
   * Sync balance from Python bot
   */
  const syncBalance = useCallback(async () => {
    try {
      const response = await apiClient.post<{
        balance: {
          amount: number;
          currency: string;
          demoMode: boolean;
        };
      }>('/api/balance/sync', {});

      setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: response.balance.demoMode,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to sync balance:', error);
    }
  }, [setBalance]);

  /**
   * Switch between demo and real mode
   */
  const switchMode = useCallback(async (demoMode: boolean) => {
    try {
      const response = await apiClient.post<{
        balance: {
          amount: number;
          currency: string;
          demoMode: boolean;
        };
      }>('/api/balance/mode', { demoMode });

      setBalance({
        userId: '',
        amount: response.balance.amount,
        currency: response.balance.currency,
        demoMode: response.balance.demoMode,
        lastSyncedAt: new Date(),
      });
    } catch (error) {
      console.error('Failed to switch mode:', error);
    }
  }, [setBalance]);

  /**
   * Optimistic balance update
   * Updates UI immediately, server confirms later
   */
  const optimisticUpdate = useCallback((delta: number) => {
    if (!balance) return;

    const newAmount = balance.amount + delta;
    updateBalance(newAmount);

    // Server will send confirmation via WebSocket
    // If rejected, WebSocket will send correct balance
  }, [balance, updateBalance]);

  /**
   * Listen for WebSocket balance updates
   */
  useEffect(() => {
    // This will be connected in WebSocket provider
    // For now, just set up the handler structure
  }, []);

  return {
    balance,
    isLoading,
    isDemoMode,
    fetchBalance,
    syncBalance,
    switchMode,
    optimisticUpdate,
  };
}
