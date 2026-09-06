import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNNEL_WINDOW_MS,
  isFunnelWindowOpen,
  resolveFunnelPhase,
  type FunnelInputs,
} from './funnel-decision.js';

const MIN = 60 * 1000;

function depAt(agoMs: number, now = Date.now()): Date {
  return new Date(now - agoMs);
}

function base(over: Partial<FunnelInputs> = {}): FunnelInputs {
  const now = 1_700_000_000_000;
  return {
    depositIndex: 1,
    depositAmount: 100,
    lastDepositAt: depAt(10 * MIN, now),
    currentBalance: 90,
    wagerProgress: 0,
    completedWdCount: 0,
    trustScore: 100,
    now,
    ...over,
  };
}

describe('isFunnelWindowOpen', () => {
  it('is closed without a deposit', () => {
    assert.equal(isFunnelWindowOpen(null), false);
    assert.equal(isFunnelWindowOpen(undefined), false);
  });

  it('is open for 32 minutes and closed after', () => {
    const now = Date.now();
    assert.equal(isFunnelWindowOpen(depAt(31 * MIN, now), now), true);
    assert.equal(isFunnelWindowOpen(depAt(FUNNEL_WINDOW_MS, now), now), true);
    assert.equal(isFunnelWindowOpen(depAt(33 * MIN, now), now), false);
    assert.equal(isFunnelWindowOpen(depAt(40 * MIN, now), now), false);
  });
});

describe('resolveFunnelPhase', () => {
  it('stays normal when the player never deposited', () => {
    const d = resolveFunnelPhase(
      base({ depositIndex: 0, depositAmount: 0, lastDepositAt: null })
    );
    assert.equal(d.phase, 'normal');
    assert.equal(d.bias, 0);
    assert.equal(d.windowActive, false);
  });

  it('does not keep hook on an old first deposit with empty wager (Albina case)', () => {
    const now = 1_700_000_000_000;
    const d = resolveFunnelPhase(
      base({
        depositIndex: 1,
        depositAmount: 100,
        lastDepositAt: depAt(14 * 24 * 60 * MIN, now),
        currentBalance: 99.83,
        wagerProgress: 0,
        trustScore: 100,
        now,
      })
    );
    assert.equal(d.phase, 'normal');
    assert.equal(d.bias, 0);
    assert.equal(d.windowActive, false);
  });

  it('hooks only inside the 32-minute window after dep 1', () => {
    const live = resolveFunnelPhase(base({ lastDepositAt: depAt(12 * MIN, base().now) }));
    assert.equal(live.phase, 'hook');
    assert.equal(live.bias, -0.3);
    assert.equal(live.windowActive, true);

    const expired = resolveFunnelPhase(
      base({ lastDepositAt: depAt(35 * MIN, base().now) })
    );
    assert.equal(expired.phase, 'normal');
    assert.equal(expired.bias, 0);
    assert.equal(expired.windowActive, false);
  });

  it('still drains a fresh dep-1 player who ran through the ceiling', () => {
    const d = resolveFunnelPhase(base({ currentBalance: 200 }));
    assert.equal(d.phase, 'drain');
    assert.ok(d.bias > 0);
  });

  it('does not hook dep 3+ even right after a deposit', () => {
    const d = resolveFunnelPhase(base({ depositIndex: 3, lastDepositAt: depAt(5 * MIN, base().now) }));
    assert.equal(d.phase, 'normal');
    assert.equal(d.bias, 0);
  });

  it('skips hook for low trust even on a fresh first deposit', () => {
    const d = resolveFunnelPhase(base({ trustScore: 40 }));
    assert.equal(d.phase, 'normal');
    assert.equal(d.windowActive, false);
  });

  it('drains a fat stack that tops up with a small first deposit', () => {
    const d = resolveFunnelPhase(
      base({
        depositIndex: 1,
        depositAmount: 50,
        currentBalance: 415,
        wagerProgress: 20,
      })
    );
    assert.equal(d.phase, 'drain');
    assert.ok(d.bias >= 0.4);
  });

  it('hooks a clean first deposit of 70+ with little leftover', () => {
    const d = resolveFunnelPhase(
      base({
        depositIndex: 1,
        depositAmount: 70,
        currentBalance: 65,
        wagerProgress: 0,
      })
    );
    assert.equal(d.phase, 'hook');
    assert.equal(d.bias, -0.3);
  });

  it('does not hook a first deposit under 70', () => {
    const d = resolveFunnelPhase(
      base({
        depositIndex: 1,
        depositAmount: 50,
        currentBalance: 48,
        wagerProgress: 0,
      })
    );
    assert.notEqual(d.phase, 'hook');
  });
});
