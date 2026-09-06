import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideMinesClick,
  isMinesScalpCashout,
  shouldResetWinStreak,
  type MinesClickContext,
} from './mines-click-decision.js';

function base(over: Partial<MinesClickContext> = {}): MinesClickContext {
  return {
    drainActive: false,
    streak: 0,
    sessionProfit: -49,
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

describe('decideMinesClick', () => {
  it('hard-busts every click while SmartDrain is active', () => {
    const click = decideMinesClick(
      base({ drainActive: true, betAmount: 1, rng: () => 0.99 })
    );
    assert.equal(click.action, 'must_bust');
    assert.equal(click.reason, 'smartdrain');
  });

  it('hard-busts a 16zł 1.99x size-up even on the first click', () => {
    const click = decideMinesClick(
      base({
        betAmount: 16,
        scalpCashouts: 0,
        potentialMultiplier: 1.9917,
        rng: () => 0.99,
      })
    );
    assert.equal(click.action, 'must_bust');
    assert.equal(click.reason, 'mines_sizeup');
  });

  it('hard-busts a 1zł probe after one successful scalp cashout', () => {
    const click = decideMinesClick(
      base({
        betAmount: 1,
        scalpCashouts: 1,
        potentialMultiplier: 1.9917,
        rng: () => 0.99,
      })
    );
    assert.equal(click.action, 'must_bust');
    assert.equal(click.reason, 'mines_scalp_repeat');
  });

  it('lets a lone 1zł probe through when there is no drain or scalp history', () => {
    const click = decideMinesClick(base({ betAmount: 1, rng: () => 0.99 }));
    assert.equal(click.action, 'neutral');
  });

  it('does not grant hook must_win after repeated scalp cashouts', () => {
    const click = decideMinesClick(
      base({
        funnelPhase: 'hook',
        scalpCashouts: 3,
        sessionProfit: 10,
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

  it('never resets on a win', () => {
    assert.equal(shouldResetWinStreak(true, 1), false);
  });
});
