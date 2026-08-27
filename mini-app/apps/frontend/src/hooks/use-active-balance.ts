import { useBalanceStore } from '@/store/balance-store';
import { useBalance } from '@/hooks/use-balance';

export interface ActiveBalance {
  /** Funds available for this game. Zero until the balance has loaded. */
  amount: number;
  /** False while the first `/api/balance` response is still in flight. */
  isReady: boolean;
  /** True when a tournament balance is in play instead of the wallet. */
  isTournament: boolean;
  /** Currency marker to render next to `amount`. */
  currencyLabel: string;
  /** Refreshes balance from server via GET /api/balance */
  fetchBalance: () => Promise<void>;
  /** Forces balance sync from server via POST /api/balance/sync */
  syncBalance: () => Promise<void>;
}

/**
 * Balance a game is allowed to stake, tournament funds taking precedence.
 *
 * Games used to fall back to `balance?.amount ?? 10000`, which handed the UI
 * ten thousand imaginary zloty for as long as the balance request was in
 * flight: bet buttons looked affordable, and the rejection only surfaced after
 * the user committed. `isReady` exists so callers can hold the controls until
 * a real figure has arrived rather than guessing.
 */
export function useActiveBalance(gameType: string): ActiveBalance {
  const balance = useBalanceStore((s) => s.balance);
  const tournamentBalances = useBalanceStore((s) => s.tournamentBalances);
  const { fetchBalance, syncBalance } = useBalance();

  const tournament = tournamentBalances.find((t) => t.gameType === gameType);
  const isTournament = tournament !== undefined;

  return {
    amount: tournament?.balance ?? balance?.amount ?? 0,
    isReady: isTournament || balance !== null,
    isTournament,
    currencyLabel: isTournament ? '🏆' : 'zł',
    fetchBalance,
    syncBalance,
  };
}
