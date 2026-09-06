import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideMinesClick,
  isMinesScalpCashout,
  scalpBustChance,
  shouldResetWinStreak,
  type MinesClickContext,
} from './mines-click-decision.js';

function base(over: Partial<MinesClickContext> = {}): MinesClickContext {
  return {
    drainActive: false,
    streak: 0,
    sessionProfit: 0,
    bankExcess: 0,
    scalpCashouts: 0,
    betAmount: 1,
    potentialMultiplier: 1.9917,
    funnelPhase: 'normal',
    depositIndex: 1,
    maxMultiplierCap: 3.5,
    rng: () => 0.99,
    ...over,
  };
}

describe('scalpBustChance', () => {
  it('stays near a live field when the player is flat or red', () => {
    const flat = scalpBustChance(base({ sessionProfit: -5, bankExcess: 0, betAmount: 1 }));
    const red = scalpBustChance(base({ sessionProfit: -30, bankExcess: -25, betAmount: 1 }));
    assert.ok(flat >= 0.42 && flat <= 0.58, `flat=${flat}`);
    assert.ok(red < flat, `red=${red} flat=${flat}`);
  });

  it('squeezes size-ups once the bank is green, but never to 100%', () => {
    const p = scalpBustChance(
      base({ sessionProfit: 25, bankExcess: 25, betAmount: 16 })
    );
    assert.ok(p >= 0.7, `green size-up p=${p}`);
    assert.ok(p <= 0.86, `must not be a hard-rig p=${p}`);
  });
});

describe('decideMinesClick', () => {
  it('lets a drain click survive sometimes so it does not look scripted', () => {
    const live = decideMinesClick(base({ drainActive: true, rng: () => 0.99 }));
    const bust = decideMinesClick(base({ drainActive: true, rng: () => 0.1 }));
    assert.equal(live.action, 'neutral');
    assert.equal(bust.action, 'must_bust');
  });

  it('lets a flat 1zł first-click through when the roll misses', () => {
    const click = decideMinesClick(base({ betAmount: 1, rng: () => 0.99 }));
    assert.equal(click.action, 'neutral');
  });

  it('busts a green 16zł 1.99x size-up on a mid roll', () => {
    const click = decideMinesClick(
      base({
        betAmount: 16,
        sessionProfit: 20,
        bankExcess: 20,
        rng: () => 0.55,
      })
    );
    assert.equal(click.action, 'must_bust');
    assert.equal(click.reason, 'mines_scalp_pressure');
  });

  it('does not grant hook must_win when the player is already green', () => {
    const click = decideMinesClick(
      base({
        funnelPhase: 'hook',
        sessionProfit: 20,
        bankExcess: 20,
        rng: () => 0.01,
      })
    );
    assert.notEqual(click.action, 'must_win');
  });
});

describe('isMinesScalpCashout', () => {
  it('flags the 13-mine 1-click 1.99x cashout', () => {
    assert.equal(isMinesScalpCashout(16, 31.87), true);
  });

  it('ignores a bust and a deep multi-click win', () => {
    assert.equal(isMinesScalpCashout(16, 0), false);
    assert.equal(isMinesScalpCashout(10, 40), false);
  });
});

describe('shouldResetWinStreak', () => {
  it('keeps the streak after a 1zł probe loss', () => {
    assert.equal(shouldResetWinStreak(false, 1), false);
  });

  it('resets the streak after a real-size loss', () => {
    assert.equal(shouldResetWinStreak(false, 16), true);
  });
});
