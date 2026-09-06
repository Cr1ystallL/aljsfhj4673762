import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SPORTS_ODDS,
  calculateFootballLiveOdds,
  calculatePrematchOdds,
  footballRemainingMinutes,
  getTeamPowerRating,
  resolveFootballLiveMinute,
  teamStrength,
} from './odds.js';

describe('team name matching', () => {
  it('does not treat Villarreal as Real Madrid', () => {
    const villa = getTeamPowerRating('Villarreal');
    const madrid = getTeamPowerRating('Real Madrid');
    assert.ok(madrid > 90, `Real Madrid should be elite, got ${madrid}`);
    assert.ok(villa < 88, `Villarreal must not inherit Real Madrid rating, got ${villa}`);
    assert.notEqual(villa, madrid);
  });

  it('matches Deportivo as its own club', () => {
    assert.equal(getTeamPowerRating('Deportivo'), 74);
    assert.equal(getTeamPowerRating('Villarreal CF'), 82);
  });
});

describe('prematch line', () => {
  it('prices Villarreal vs Deportivo like a league game, not 35.00', () => {
    const o = calculatePrematchOdds('football', 'Villarreal', 'Deportivo', true);
    assert.ok((o.p1 ?? 0) >= 1.4 && (o.p1 ?? 0) <= 2.4, `home ${o.p1}`);
    assert.ok((o.x ?? 0) >= 2.8 && (o.x ?? 0) <= 5.5, `draw ${o.x}`);
    assert.ok((o.p2 ?? 0) >= 2.8 && (o.p2 ?? 0) < 12, `away ${o.p2}`);
    assert.ok((o.p2 ?? 0) < MAX_SPORTS_ODDS);
  });
});

describe('live football 1X2', () => {
  const villa = teamStrength('Villarreal');
  const depor = teamStrength('Deportivo');

  it('2-2 at 70 minutes stays on the board with BK-like prices', () => {
    const o = calculateFootballLiveOdds(70, 2, 2, villa, depor);
    assert.equal(o.available?.p1, true);
    assert.equal(o.available?.x, true);
    assert.equal(o.available?.p2, true);
    assert.ok(o.p1 >= 1.8 && o.p1 <= 6, `p1 ${o.p1}`);
    assert.ok((o.x ?? 0) >= 1.4 && (o.x ?? 0) <= 5, `x ${o.x}`);
    assert.ok(o.p2 >= 1.8 && o.p2 <= 8, `p2 ${o.p2}`);
    assert.ok(o.p2 < 15);
  });

  it('2-2 at 90 minutes does not dump 35.00 on either side', () => {
    const o = calculateFootballLiveOdds(90, 2, 2, villa, depor);
    assert.ok((o.x ?? 99) < 2.2, `draw should be favorite, got ${o.x}`);
    assert.ok(o.p1 < MAX_SPORTS_ODDS);
    assert.ok(o.p2 < MAX_SPORTS_ODDS);
    if (o.available?.p2) {
      assert.ok(o.p2 <= 15 && o.p2 >= 4, `late away ${o.p2}`);
    }
  });

  it('2-2 deep in stoppage suspends or shortens the 1/2', () => {
    const o = calculateFootballLiveOdds(94, 2, 2, villa, depor);
    assert.ok((o.x ?? 99) <= 1.4 || o.available?.x === true);
    assert.ok(!o.available?.p1 || o.p1 < MAX_SPORTS_ODDS);
    assert.ok(!o.available?.p2 || o.p2 < MAX_SPORTS_ODDS);
    assert.notEqual(o.p2, 35);
  });
});

describe('clock sanity', () => {
  it('keeps ~4 minutes of football at 90:00, not 9 seconds', () => {
    const rem = footballRemainingMinutes(90);
    assert.ok(rem >= 3.5 && rem <= 5, `remaining ${rem}`);
  });

  it('rejects a 90 clock when the match is only ~50 minutes old', () => {
    const start = 1_700_000_000_000;
    const now = start + 52 * 60_000;
    const minute = resolveFootballLiveMinute(90, start, now, 'live');
    assert.ok(minute >= 50 && minute <= 55, `resolved ${minute}`);
  });

  it('fills a missing clock from kickoff elapsed', () => {
    const start = 1_700_000_000_000;
    const now = start + 40 * 60_000;
    assert.equal(resolveFootballLiveMinute(undefined, start, now, 'live'), 40);
  });
});
