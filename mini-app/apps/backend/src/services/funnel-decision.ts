/**
 * Deposit-lifecycle funnel (качели).
 *
 * Hook / plateau / drain exist only as a short after-deposit window.
 * A first deposit from weeks ago + empty wager_progress must NOT keep
 * a player on -0.30 hook while they farm turnover.
 */

export const FUNNEL_WINDOW_MS = 32 * 60 * 1000;
/** Already sitting on this much before the new dep → drain, never hook. */
export const FUNNEL_BANKROLL_FLOOR = 70;

export type FunnelPhase = 'hook' | 'plateau' | 'drain' | 'recapture' | 'normal';

export interface FunnelInputs {
  depositIndex: number;
  depositAmount: number;
  lastDepositAt: Date | string | null | undefined;
  currentBalance: number;
  wagerProgress: number;
  completedWdCount: number;
  trustScore: number;
  now?: number;
}

export interface FunnelDecision {
  phase: FunnelPhase;
  bias: number;
  targetPeakMultiplier: number;
  maxMultiplierCap: number;
  windowActive: boolean;
  msSinceDeposit: number | null;
}

export function msSinceDeposit(
  lastDepositAt: FunnelInputs['lastDepositAt'],
  now = Date.now()
): number | null {
  if (!lastDepositAt) return null;
  const t =
    lastDepositAt instanceof Date
      ? lastDepositAt.getTime()
      : new Date(lastDepositAt).getTime();
  if (!Number.isFinite(t)) return null;
  return now - t;
}

export function isFunnelWindowOpen(
  lastDepositAt: FunnelInputs['lastDepositAt'],
  now = Date.now()
): boolean {
  const age = msSinceDeposit(lastDepositAt, now);
  if (age === null) return false;
  return age <= FUNNEL_WINDOW_MS;
}

export function resolveFunnelPhase(input: FunnelInputs): FunnelDecision {
  const now = input.now ?? Date.now();
  const age = msSinceDeposit(input.lastDepositAt, now);
  const depositAmount = Number(input.depositAmount) || 0;
  const depositIndex = Number(input.depositIndex) || 0;
  const currentBalance = Number(input.currentBalance) || 0;
  const wagerProgress = Number(input.wagerProgress) || 0;
  const completedWdCount = Number(input.completedWdCount) || 0;
  const trustScore = Number(input.trustScore) || 0;

  const idle = (
    over: Partial<FunnelDecision> = {}
  ): FunnelDecision => ({
    phase: 'normal',
    bias: 0,
    targetPeakMultiplier: 1,
    maxMultiplierCap: 3.5,
    windowActive: false,
    msSinceDeposit: age,
    ...over,
  });

  if (trustScore < 50) {
    return idle({
      bias: 0.05,
      phase: 'normal',
    });
  }

  // No real deposit, or the after-dep window already closed → no качели.
  if (depositIndex < 1 || depositAmount <= 0 || age === null || age > FUNNEL_WINDOW_MS) {
    return idle();
  }

  let targetPeakMultiplier = 1.65;
  let maxMultiplierCap = 3.5;
  let phase: FunnelPhase = 'normal';
  let bias = 0;

  // 300 + dep 50 → withdraw 350: leftover is already house money.
  const leftover = currentBalance - depositAmount;

  if (leftover >= FUNNEL_BANKROLL_FLOOR) {
    return {
      phase: 'drain',
      bias: 0.45,
      targetPeakMultiplier: 1,
      maxMultiplierCap: 3.5,
      windowActive: true,
      msSinceDeposit: age,
    };
  }

  if (depositIndex === 1) {
    targetPeakMultiplier = 1.65;
    maxMultiplierCap = 3.5;

    const hookCeiling = depositAmount + FUNNEL_BANKROLL_FLOOR;
    const ceilingBalance = depositAmount * 1.85;

    if (
      depositAmount >= FUNNEL_BANKROLL_FLOOR &&
      currentBalance < hookCeiling &&
      wagerProgress < depositAmount * 2.5
    ) {
      phase = 'hook';
      bias = -0.3;
    } else if (currentBalance >= hookCeiling && currentBalance <= ceilingBalance) {
      phase = 'plateau';
      bias = 0.05;
    } else if (currentBalance > ceilingBalance) {
      phase = 'drain';
      bias = 0.4;
    } else {
      phase = 'normal';
      bias = 0;
    }
  } else if (depositIndex === 2) {
    if (completedWdCount > 0) {
      targetPeakMultiplier = 1.15;
      maxMultiplierCap = 3.5;
      if (currentBalance > depositAmount * 1.2) {
        phase = 'recapture';
        bias = 0.35;
      } else if (
        depositAmount >= FUNNEL_BANKROLL_FLOOR &&
        currentBalance < depositAmount * 1.05 &&
        wagerProgress < depositAmount * 0.8
      ) {
        phase = 'hook';
        bias = -0.15;
      } else {
        phase = 'normal';
        bias = 0;
      }
    } else {
      targetPeakMultiplier = 1.35;
      maxMultiplierCap = 3.5;
      if (
        depositAmount >= FUNNEL_BANKROLL_FLOOR &&
        currentBalance < depositAmount * 1.25 &&
        wagerProgress < depositAmount * 2.0
      ) {
        phase = 'hook';
        bias = -0.2;
      } else if (currentBalance > depositAmount * 1.4) {
        phase = 'drain';
        bias = 0.4;
      } else {
        phase = 'normal';
        bias = 0;
      }
    }
  } else {
    phase = 'normal';
    bias = 0;
  }

  return {
    phase,
    bias,
    targetPeakMultiplier,
    maxMultiplierCap,
    windowActive: true,
    msSinceDeposit: age,
  };
}
