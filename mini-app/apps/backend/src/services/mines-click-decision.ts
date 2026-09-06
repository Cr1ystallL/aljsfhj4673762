/**
 * Mines click policy.
 *
 * Must look like a real field, not a hard-rig:
 *   - first cells still win sometimes
 *   - other games are not "always lose"
 *   - a 13-mine / 1-click grinder cannot climb the bank
 *
 * Fair 13-mine first click already busts ~52%. We start near that and
 * only squeeze when the player is green vs session / waterline.
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
  /** Balance minus admin waterline. 0 when no waterline is set. */
  bankExcess?: number;
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function greenPressure(sessionProfit: number, bankExcess = 0): number {
  return Math.max(sessionProfit, bankExcess);
}

export function isScalpClick(mult: number): boolean {
  return mult >= MINES_SCALP_MULT_MIN && mult <= MINES_SCALP_MULT_MAX;
}

/**
 * Bust probability for a 1-click / low-mult cashout attempt.
 * Never 0, never 1 — the board still "breathes".
 */
export function scalpBustChance(ctx: MinesClickContext): number {
  const green = greenPressure(ctx.sessionProfit, ctx.bankExcess ?? 0);
  let p = 0.5;

  if (green > 0) p += Math.min(0.24, green / 90);
  if (ctx.betAmount >= MINES_SIZEUP_STAKE && green >= 0) p += 0.08;
  if (ctx.betAmount >= 16 && green > 5) p += 0.08;
  if (ctx.scalpCashouts >= 3) p += 0.06;
  if (green < -20) p -= 0.08;

  return clamp(p, 0.42, 0.86);
}

export function decideMinesClick(ctx: MinesClickContext): MinesClickDecision {
  const rng = ctx.rng ?? Math.random;
  const green = greenPressure(ctx.sessionProfit, ctx.bankExcess ?? 0);

  // Admin drain: heavy tilt, not a 100% mine on every cell.
  if (ctx.drainActive) {
    if (rng() < 0.78) {
      return { action: 'must_bust', reason: 'smartdrain' };
    }
    return { action: 'neutral', reason: 'smartdrain_pass' };
  }

  if (isScalpClick(ctx.potentialMultiplier)) {
    const p = scalpBustChance(ctx);
    if (rng() < p) {
      return { action: 'must_bust', reason: 'mines_scalp_pressure' };
    }
    return { action: 'neutral', reason: 'mines_scalp_live' };
  }

  if (ctx.streak >= 3) {
    let streakBustChance = 0.45;
    if (ctx.streak >= 5) streakBustChance = 0.7;
    else if (ctx.streak >= 4) streakBustChance = 0.58;
    if (green > 15) streakBustChance = Math.min(0.8, streakBustChance + 0.1);

    if (ctx.potentialMultiplier >= 1.2 && rng() < streakBustChance) {
      return { action: 'must_bust', reason: 'anti_scalper_streak' };
    }
  }

  if (ctx.depositIndex === 1 && ctx.potentialMultiplier > ctx.maxMultiplierCap) {
    if (rng() < 0.85) {
      return { action: 'must_bust', reason: 'dep1_mult_cap' };
    }
  }

  if (ctx.funnelPhase === 'drain' || ctx.funnelPhase === 'recapture') {
    let bustChance = 0.58;
    if (ctx.potentialMultiplier >= 2.5) bustChance = 0.78;
    else if (ctx.potentialMultiplier >= 1.6) bustChance = 0.68;
    if (green > 20) bustChance = Math.min(0.84, bustChance + 0.1);
    if (rng() < bustChance) {
      return { action: 'must_bust', reason: 'funnel_drain' };
    }
    return { action: 'neutral', reason: 'funnel_drain_pass' };
  }

  if (ctx.funnelPhase === 'plateau') {
    let plateauBustChance = 0.4;
    if (ctx.potentialMultiplier >= 2.0) plateauBustChance = 0.58;
    else if (ctx.potentialMultiplier >= 1.3) plateauBustChance = 0.48;
    if (green > 15) plateauBustChance = Math.min(0.72, plateauBustChance + 0.12);
    if (rng() < plateauBustChance) {
      return { action: 'must_bust', reason: 'funnel_plateau' };
    }
    return { action: 'neutral', reason: 'funnel_plateau_pass' };
  }

  if (ctx.funnelPhase === 'hook') {
    if (
      green < 10 &&
      ctx.streak < 2 &&
      ctx.scalpCashouts < 2 &&
      ctx.potentialMultiplier <= 2.0 &&
      rng() < 0.28
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
