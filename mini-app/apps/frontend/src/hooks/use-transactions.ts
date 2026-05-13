import { useCallback } from 'react';
import { useTransactionStore } from '@/store/transaction-store';
import { apiClient } from '@/lib/api/client';

/**
 * Transactions hook
 * Fetches and caches transaction history from Python bot
 */
export function useTransactions() {
  const { transactions, isLoading, setTransactions, setLoading } = useTransactionStore();

  const fetchTransactions = useCallback(async (limit: number = 50) => {
    setLoading(true);
    try {
      const response = await apiClient.get<{
        transactions: Array<{
          id: string;
          type: string;
          amount: number;
          createdAt: string;
          gameType?: string;
        }>;
      }>(`/api/balance/transactions?limit=${limit}`);

      setTransactions(
        response.transactions.map((tx) => ({
          ...tx,
          createdAt: new Date(tx.createdAt),
        }))
      );
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [setTransactions, setLoading]);

  return {
    transactions,
    isLoading,
    fetchTransactions,
  };
}
