import { create } from 'zustand';

/**
 * Transaction store
 * Caches transaction history from Python bot
 */

interface Transaction {
  id: string;
  type: string;
  amount: number;
  createdAt: Date;
  gameType?: string;
}

interface TransactionState {
  transactions: Transaction[];
  isLoading: boolean;
  
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  setLoading: (loading: boolean) => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  isLoading: false,
  
  setTransactions: (transactions) =>
    set({ transactions, isLoading: false }),
  
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
    })),
  
  setLoading: (loading) =>
    set({ isLoading: loading }),
}));
