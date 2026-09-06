/**
 * Multi-account auto-action policy.
 *
 * A single shared IP (CGNAT / office / family) or a colliding TMA
 * hardware hash (identical iPhone WebView fingerprints) is NOT enough
 * to ban. Auto-ban requires two independent signals.
 */

export interface CollisionSignals {
  ignoreIpCollision: boolean;
  hardwareMatch: boolean;
  sameIp: boolean;
  sameDeviceId: boolean;
  financialMatch: boolean;
}

export interface CollisionAction {
  /** Hard ban the new account (isBlocked). */
  ban: boolean;
  /** Freeze withdrawals on the new account only. */
  lockNewWithdrawals: boolean;
  /** Freeze withdrawals on the older/main account. */
  lockMainWithdrawals: boolean;
  reason: string;
}

export function decideCollisionAction(s: CollisionSignals): CollisionAction {
  if (s.ignoreIpCollision) {
    return {
      ban: false,
      lockNewWithdrawals: false,
      lockMainWithdrawals: false,
      reason: 'whitelisted',
    };
  }

  const devicePlusNetwork = s.sameDeviceId && (s.sameIp || s.hardwareMatch);
  const moneyPlusOther = s.financialMatch && (s.hardwareMatch || s.sameIp || s.sameDeviceId);

  if (devicePlusNetwork || moneyPlusOther) {
    return {
      ban: true,
      lockNewWithdrawals: true,
      lockMainWithdrawals: true,
      reason: devicePlusNetwork ? 'device_plus_network' : 'financial_plus_other',
    };
  }

  if (s.hardwareMatch || s.sameDeviceId || s.financialMatch) {
    return {
      ban: false,
      lockNewWithdrawals: true,
      lockMainWithdrawals: false,
      reason: 'single_signal',
    };
  }

  if (s.sameIp) {
    return {
      ban: false,
      lockNewWithdrawals: false,
      lockMainWithdrawals: false,
      reason: 'single_signal',
    };
  }

  return {
    ban: false,
    lockNewWithdrawals: false,
    lockMainWithdrawals: false,
    reason: 'none',
  };
}
