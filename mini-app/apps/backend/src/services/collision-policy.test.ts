import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideCollisionAction } from './collision-policy.js';

describe('decideCollisionAction', () => {
  it('does not auto-ban on a shared IP alone', () => {
    const a = decideCollisionAction({
      ignoreIpCollision: false,
      hardwareMatch: false,
      sameIp: true,
      sameDeviceId: false,
      financialMatch: false,
    });
    assert.equal(a.ban, false);
    assert.equal(a.lockMainWithdrawals, false);
    assert.equal(a.lockNewWithdrawals, false);
    assert.equal(a.reason, 'single_signal');
  });

  it('does not auto-ban on a colliding hardware hash alone', () => {
    const a = decideCollisionAction({
      ignoreIpCollision: false,
      hardwareMatch: true,
      sameIp: false,
      sameDeviceId: false,
      financialMatch: false,
    });
    assert.equal(a.ban, false);
    assert.equal(a.lockMainWithdrawals, false);
  });

  it('bans when the same device is also on the same IP', () => {
    const a = decideCollisionAction({
      ignoreIpCollision: false,
      hardwareMatch: false,
      sameIp: true,
      sameDeviceId: true,
      financialMatch: false,
    });
    assert.equal(a.ban, true);
    assert.equal(a.reason, 'device_plus_network');
  });

  it('never bans a whitelisted account', () => {
    const a = decideCollisionAction({
      ignoreIpCollision: true,
      hardwareMatch: true,
      sameIp: true,
      sameDeviceId: true,
      financialMatch: true,
    });
    assert.equal(a.ban, false);
    assert.equal(a.reason, 'whitelisted');
  });
});
