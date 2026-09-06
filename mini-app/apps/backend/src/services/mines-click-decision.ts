/**
 * Pure Mines click decision — kept free of Redis/Prisma so the
 * drain / anti-scalp rules can be unit-tested without a live stack.
 *
 * Production context (Albina / 13-mine 1-click 1.99x martingale):
 *   - Admin SmartDrain used to be a coin-flip and burned 30 rounds
 *     on 1 zł probe losses in ~2 minutes.
 *   - Win-streak anti-scalp never fired because every probe loss
 *     reset the streak to 0.
 */

export const MINES_PROBE_STAKE = 5;
export const MINES_SCALP_MULT_MIN = 1.15;
export const MINES_SCALP_MULT_MAX = 2.2;
export const MINES_SIZEUP_STAKE = 8;

export type MinesClickAction = 'must_win' | 'must_bust' | 'neutral';

export interface MinesClickContext {
  drainActive: boolean;
  streak: number;
  sessionProfit: number;
  /** Recent 1-click / low-mult mines cashouts (rolling window). */
  scalpCashouts: number;
  betAmount: number;
  potentialMultiplier: number;
  funnelPhase: 'hook' | 'plateau' | 'drain' | 'recapture' | 'normal';
  depositIndex: number;
  maxMultiplierCap: number;
  rng?: () => number;
}

export interface MinesClickDecision {
  action: MinesClickAction;
  reason: string;
}

function isScalpClick(mult: number): boolean {
  return mult >= MINES_SCALP_MULT_MIN && mult <= MINES_SCALP_MULT_MAX;
}

export function decideMinesClick(ctx: MinesClickContext): MinesClickDecision {
  const rng = ctx.rng ?? Math.random;

  // 1. Admin / auto SmartDrain: hard bust. No coin-flip, no 1zł escape.
  if (ctx.drainActive) {
    return { action: 'must_bust', reason: 'smartdrain' };
  }

  // 2. One-click scalp (13 mines → 1.99x, 10 mines → 1.59x, …).
  //    Size-up is never allowed. After the first cheap 1.99x cashout,
  //    even 1zł probes in this band are mines for the rest of the window.
  if (isScalpClick(ctx.potentialMultiplier)) {
    if (ctx.betAmount >= MINES_SIZEUP_STAKE) {
      return { action: 'must_bust', reason: 'mines_sizeup' };
    }
    if (ctx.scalpCashouts >= 1) {
      return { action: 'must_bust', reason: 'mines_scalp_repeat' };
    }
  }

  // 3. Cashout-streak resistance (streak ignores 1zł probe losses).
  if (ctx.streak >= 3) {
    let streakBustChance = 0.5;
    if (ctx.streak >= 5) streakBustChance = 0.85;
    else if (ctx.streak >= 4) streakBustChance = 0.7;

    if (ctx.potentialMultiplier >= 1.2 && rng() < streakBustChance) {
      return { action: 'must_bust', reason: 'anti_scalper_streak' };
    }
  }

  // 4. Hard multiplier cap on first deposit.
  if (ctx.depositIndex === 1 && ctx.potentialMultiplier > ctx.maxMultiplierCap) {
    if (rng() < 0.85) {
      return { action: 'must_bust', reason: 'dep1_mult_cap' };
    }
  }

  // 5. Funnel drain / recapture — still probabilistic, not admin drain.
  if (ctx.funnelPhase === 'drain' || ctx.funnelPhase === 'recapture') {
    let bustChance = 0.65;
    if (ctx.potentialMultiplier >= 2.5) bustChance = 0.85;
    else if (ctx.potentialMultiplier >= 1.6) bustChance = 0.75;
    else if (ctx.potentialMultiplier >= 1.25) bustChance = 0.6;
    else bustChance = 0.45;

    if (ctx.streak >= 2) bustChance = Math.min(0.9, bustChance + 0.15);
    if (ctx.sessionProfit >= 40) bustChance = Math.min(0.9, bustChance + 0.1);
    if (ctx.betAmount >= 50) bustChance = Math.min(0.9, bustChance + 0.1);

    if (rng() < bustChance) {
      return { action: 'must_bust', reason: 'funnel_drain' };
    }
    return { action: 'neutral', reason: 'funnel_drain_pass' };
  }

  // 6. Plateau swings around the first-deposit peak.
  if (ctx.funnelPhase === 'plateau') {
    let plateauBustChance = 0.4;
    if (ctx.potentialMultiplier >= 2.0) plateauBustChance = 0.65;
    else if (ctx.potentialMultiplier >= 1.3) plateauBustChance = 0.5;

    if (ctx.streak >= 2) plateauBustChance = Math.min(0.8, plateauBustChance + 0.2);

    if (rng() < plateauBustChance) {
      return { action: 'must_bust', reason: 'funnel_plateau' };
    }
    return { action: 'neutral', reason: 'funnel_plateau_pass' };
  }

  // 7. Hook: only help if they are not already scalping.
  if (ctx.funnelPhase === 'hook') {
    if (
      ctx.streak < 2 &&
      ctx.sessionProfit < 35 &&
      ctx.scalpCashouts < 2 &&
      ctx.potentialMultiplier <= 2.0 &&
      rng() < 0.35
    ) {
      return { action: 'must_win', reason: 'funnel_hook' };
    }
    return { action: 'neutral', reason: 'funnel_hook_pass' };
  }

  return { action: 'neutral', reason: 'organic' };
}

export function isMinesScalpCashout(betAmount: number, payout: number): boolean {
  if (!(betAmount > 0) || !(payout > betAmount)) return false;
  const mult = payout / betAmount;
  return mult >= MINES_SCALP_MULT_MIN && mult <= MINES_SCALP_MULT_MAX;
}

export function shouldResetWinStreak(won: boolean, betAmount: number): boolean {
  if (won) return false;
  return betAmount >= MINES_PROBE_STAKE;
}
