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
  isFrozen: boolean;
  pendingBalance: Balance | null;
  pendingTournamentBalances: Array<{ gameType: string; balance: number }> | null;

  setBalance: (balance: Balance, tournamentBalances?: Array<{ gameType: string; balance: number }>) => void;
  updateBalance: (amount: number, gameType?: string) => void;
  setLoading: (loading: boolean) => void;
  freeze: () => void;
  unfreeze: () => void;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: null,
  tournamentBalances: [],
  isLoading: false,
  isFrozen: false,
  pendingBalance: null,
  pendingTournamentBalances: null,

  setBalance: (balance, tournamentBalances) => {
    const state = get();
    const cleanBalance = balance ? { ...balance, amount: Math.max(0, balance.amount) } : null;
    const effectiveTb = (tournamentBalances !== undefined ? tournamentBalances : state.tournamentBalances).map((t) => ({
      ...t,
      balance: Math.max(0, t.balance),
    }));
    if (state.isFrozen) {
      set({ pendingBalance: cleanBalance, pendingTournamentBalances: effectiveTb });
    } else {
      set({ balance: cleanBalance, tournamentBalances: effectiveTb, isLoading: false, pendingBalance: null, pendingTournamentBalances: null });
    }
  },

  updateBalance: (amount, gameType) =>
    set((state) => {
      const nonNegative = Math.max(0, amount);
      if (gameType) {
        return {
          tournamentBalances: state.tournamentBalances.map((t) => 
            t.gameType === gameType ? { ...t, balance: nonNegative } : t
          ),
        };
      }
      
      if (!state.balance) return state;

      return {
        balance: {
          ...state.balance,
          amount: nonNegative,
          lastSyncedAt: new Date(),
        },
      };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  
  freeze: () => set({ isFrozen: true }),
  
  unfreeze: () => {
    const state = get();
    set({ isFrozen: false });
    if (state.pendingBalance) {
      set({ 
        balance: state.pendingBalance, 
        tournamentBalances: state.pendingTournamentBalances || state.tournamentBalances,
        pendingBalance: null, 
        pendingTournamentBalances: null 
      });
    }
  }
}));
