import { create } from 'zustand';
import type { Balance } from '@casino/shared';

/**
 * Balance state store
 * Manages user balance and demo mode
 */

interface BalanceState {
  balance: Balance | null;
  isLoading: boolean;
  isDemoMode: boolean;
  
  // Actions
  setBalance: (balance: Balance) => void;
  updateBalance: (amount: number) => void;
  setDemoMode: (isDemoMode: boolean) => void;
  setLoading: (loading: boolean) => void;
}

export const useBalanceStore = create<BalanceState>((set) => ({
  balance: null,
  isLoading: false,
  isDemoMode: false,
  
  setBalance: (balance) =>
    set({
      balance,
      isDemoMode: balance.demoMode,
      isLoading: false,
    }),
  
  updateBalance: (amount) =>
    set((state) => {
      if (!state.balance) return state;
      
      return {
        balance: {
          ...state.balance,
          amount,
          lastSyncedAt: new Date(),
        },
      };
    }),
  
  setDemoMode: (isDemoMode) =>
    set({ isDemoMode }),
  
  setLoading: (loading) =>
    set({ isLoading: loading }),
}));
