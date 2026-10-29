import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addExperience,
  EXP_PER_LEVEL,
  progressionForTotalExp,
  tierForLevel,
} from './progression';

test('level 1 starts at zero EXP', () => {
  assert.deepEqual(progressionForTotalExp(0), {
    level: 1,
    exp: 0,
    totalExp: 0,
    tier: 'Sprout',
  });
});

test('every 100 total EXP is one level', () => {
  assert.equal(EXP_PER_LEVEL, 100);
  assert.equal(progressionForTotalExp(99).level, 1);
  assert.equal(progressionForTotalExp(99).exp, 99);
  assert.equal(progressionForTotalExp(100).level, 2);
  assert.equal(progressionForTotalExp(100).exp, 0);
  assert.equal(progressionForTotalExp(250).level, 3);
  assert.equal(progressionForTotalExp(250).exp, 50);
});

test('negative or fractional totals are clamped', () => {
  assert.equal(progressionForTotalExp(-500).level, 1);
  assert.equal(progressionForTotalExp(150.9).totalExp, 150);
});

test('tiers follow the documented boundaries', () => {
  assert.equal(tierForLevel(1), 'Sprout');
  assert.equal(tierForLevel(4), 'Sprout');
  assert.equal(tierForLevel(5), 'Bloom');
  assert.equal(tierForLevel(9), 'Bloom');
  assert.equal(tierForLevel(10), 'Blossom');
  assert.equal(tierForLevel(19), 'Blossom');
  assert.equal(tierForLevel(20), 'Flover');
  assert.equal(tierForLevel(34), 'Flover');
  assert.equal(tierForLevel(35), 'Star');
  assert.equal(tierForLevel(49), 'Star');
  assert.equal(tierForLevel(50), 'Moon');
  assert.equal(tierForLevel(120), 'Moon');
});

test('addExperience keeps the lifetime total', () => {
  const result = addExperience({ totalExp: 90 }, 50);
  assert.equal(result.level, 2);
  assert.equal(result.exp, 40);
  assert.equal(result.totalExp, 140);
});
