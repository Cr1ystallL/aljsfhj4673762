/**
 * Wager contribution by game.
 *
 * Fraction of a stake that counts toward wager progress (deposit x2,
 * bonus wagers). 1 = 100%.
 *
 * Low values go to games where turnover can be farmed with near-50%
 * outcomes at ~2x or with near-riskless early cashout: those grind
 * `wager_progress` without real exposure to the house edge.
 *
 * Admins can override per game in Redis (`game_config:<type>`); these are
 * the defaults and the values shown in the FAQ when the API is unavailable.
 */

export type WagerGameType =
  | 'crash'
  | 'mines'
  | 'keno'
  | 'coinflip'
  | 'wheel'
  | 'blackjack'
  | 'hilo'
  | 'cases'
  | 'macvpot'
  | 'sports';

export const WAGER_CONTRIBUTION_DEFAULTS: Record<WagerGameType, number> = {
  // Fixed-odds, high edge, no early exit → full weight.
  wheel: 1.0,
  keno: 1.0,
  cases: 1.0,
  macvpot: 1.0,
  // Early cashout at 1.0x–1.2x is close to a no-risk churn.
  crash: 0.5,
  // 50/50 at 1.94x — the classic wager farm.
  coinflip: 0.5,
  // Low-odds singles (1.05–1.20) churn turnover; expresses still count full via odds cap.
  sports: 0.5,
  // 1-click cashout at ~2x with 13 mines.
  mines: 0.3,
  // Red/black at 1.92x plus "higher on 2" near 1.0x.
  hilo: 0.3,
  // ~99% RTP, low variance, strategy-driven.
  blackjack: 0.2,
};

export const WAGER_GAME_LABELS: Record<WagerGameType, string> = {
  crash: 'MacvJet (Crash)',
  wheel: 'Wheel',
  keno: 'Keno',
  cases: 'Кейсы',
  macvpot: 'MacvPot',
  coinflip: 'Coinflip',
  sports: 'Спорт',
  mines: 'Mines',
  hilo: 'Hi-Lo',
  blackjack: 'Blackjack',
};

/** Display order: full-weight games first, then descending. */
export const WAGER_GAME_ORDER: WagerGameType[] = [
  'crash',
  'wheel',
  'keno',
  'cases',
  'macvpot',
  'coinflip',
  'sports',
  'mines',
  'hilo',
  'blackjack',
];

export function wagerContributionPercent(fraction: number): number {
  if (!Number.isFinite(fraction)) return 100;
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}
