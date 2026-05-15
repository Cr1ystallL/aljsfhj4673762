import { create } from 'zustand';
import type { Balance } from '@casino/shared';

/**
 * Balance state store
 *
 * Backed by the shared PostgreSQL `balances` table. The Python bot and the
 * Node backend both write to the same row for each user, so the value
 * here always reflects what the user sees in the bot too — no demo
 * mode, no separate "play money" track.
 */

interface BalanceState {
  balance: Balance | null;
  isLoading: boolean;

  setBalance: (balance: Balance) => void;
  updateBalance: (amount: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useBalanceStore = create<BalanceState>((set) => ({
  balance: null,
  isLoading: false,

  setBalance: (balance) =>
    set({
      balance,
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

  setLoading: (loading) => set({ isLoading: loading }),
}));
