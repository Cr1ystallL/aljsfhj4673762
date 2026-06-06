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
  tournamentBalances: Array<{ gameType: string; balance: number }>;
  isLoading: boolean;

  setBalance: (balance: Balance, tournamentBalances?: Array<{ gameType: string; balance: number }>) => void;
  updateBalance: (amount: number, gameType?: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useBalanceStore = create<BalanceState>((set) => ({
  balance: null,
  tournamentBalances: [],
  isLoading: false,

  setBalance: (balance, tournamentBalances = []) =>
    set({
      balance,
      tournamentBalances,
      isLoading: false,
    }),

  updateBalance: (amount, gameType) =>
    set((state) => {
      if (gameType) {
        return {
          tournamentBalances: state.tournamentBalances.map(t => 
            t.gameType === gameType ? { ...t, balance: amount } : t
          )
        };
      }
      
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
