import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VIP_XP_PER_ZL,
  VIP_ZL_PER_XP,
  VIP_RANKS,
  xpFromWagerZl,
  wagerRemainderAfterXp,
  getVipTierByXp,
} from '@casino/shared';

test('10 zł of turnover equals 1 XP', () => {
  assert.equal(VIP_ZL_PER_XP, 10);
  assert.equal(VIP_XP_PER_ZL, 0.1);
  assert.equal(xpFromWagerZl(10), 1);
  assert.equal(xpFromWagerZl(1), 0);
  assert.equal(xpFromWagerZl(9.99), 0);
  assert.equal(xpFromWagerZl(19.9), 1);
  assert.equal(xpFromWagerZl(20), 2);
  assert.equal(xpFromWagerZl(16498.6), 1649);
});

test('small bets keep a remainder instead of granting a free XP', () => {
  assert.equal(wagerRemainderAfterXp(1), 1);
  assert.equal(wagerRemainderAfterXp(8), 8);
  assert.equal(wagerRemainderAfterXp(10), 0);
  assert.equal(wagerRemainderAfterXp(24), 4);
});

test('rank wager labels match 10 zł = 1 XP', () => {
  const bronze = VIP_RANKS.find((r) => r.level === 1);
  const diamond = VIP_RANKS.find((r) => r.level === 5);
  assert.equal(bronze?.wagerZl, 5000);
  assert.equal(diamond?.wagerZl, 1_000_000);
  assert.equal(getVipTierByXp(499).level, 0);
  assert.equal(getVipTierByXp(500).level, 1);
});
