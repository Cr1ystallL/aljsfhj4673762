import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerCardWeight, playerWinStreak, type BjPlayerDrawCtx } from './blackjack-player-draw.js';

function ctx(over: Partial<BjPlayerDrawCtx> = {}): BjPlayerDrawCtx {
  return {
    context: 'player_hit',
    currentTotal: 14,
    currentCards: 2,
    winStreak: 0,
    bias: 0,
    ...over,
  };
}

describe('playerWinStreak', () => {
  it('counts consecutive wins and stops on a loss', () => {
    const n = playerWinStreak(
      [
        { players: [{ userId: 'u', result: 'win' }] },
        { players: [{ userId: 'u', result: 'blackjack' }] },
        { players: [{ userId: 'u', result: 'lose' }] },
        { players: [{ userId: 'u', result: 'win' }] },
      ],
      'u'
    );
    assert.equal(n, 2);
  });
});

describe('playerCardWeight', () => {
  it('on a stiff hit prefers bust and leftover stiff over 20', () => {
    const hit = ctx({ currentTotal: 15 });
    const bust = playerCardWeight(22, hit);
    const made = playerCardWeight(20, hit);
    const short = playerCardWeight(16, hit);
    assert.ok(bust > made, `bust=${bust} made=${made}`);
    assert.ok(short > made, `short=${short} made=${made}`);
  });

  it('squeezes harder after a 5-win streak', () => {
    const flat = playerCardWeight(22, ctx({ currentTotal: 14, winStreak: 0 }));
    const hot = playerCardWeight(22, ctx({ currentTotal: 14, winStreak: 5 }));
    assert.ok(hot > flat, `hot=${hot} flat=${flat}`);
  });

  it('does not turn hook bias into a 20/21 giveaway on double', () => {
    const hook = ctx({
      context: 'player_double',
      currentTotal: 11,
      bias: -0.3,
    });
    const high = playerCardWeight(21, hook);
    const short = playerCardWeight(14, hook);
    assert.ok(short >= high, `hook must not prefer 21 over недобор (${high} vs ${short})`);
  });

  it('on deal 2 suppresses naturals vs a stiff', () => {
    const deal = ctx({ context: 'deal_player', currentCards: 1, currentTotal: 10 });
    const bj = playerCardWeight(21, deal);
    const stiff = playerCardWeight(14, deal);
    assert.ok(stiff > bj, `stiff=${stiff} bj=${bj}`);
  });

  it('deals a first-card ten more often than an ace', () => {
    const deal = ctx({ context: 'deal_player', currentCards: 0, currentTotal: 0 });
    const ten = playerCardWeight(10, deal);
    const ace = playerCardWeight(11, deal);
    assert.ok(ten > ace, `ten=${ten} ace=${ace}`);
  });
});
