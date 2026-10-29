import assert from 'node:assert/strict';
import { test } from 'node:test';

import { kstDate, kstMinutes, minutesApart, timeToMinutes } from './time';

test('kstDate rolls over at 15:00 UTC', () => {
  assert.equal(kstDate(new Date('2026-10-29T14:59:59Z')), '2026-10-29');
  assert.equal(kstDate(new Date('2026-10-29T15:00:00Z')), '2026-10-30');
  assert.equal(kstDate(new Date('2026-10-29T23:30:00Z')), '2026-10-30');
});

test('kstMinutes returns minutes since KST midnight', () => {
  assert.equal(kstMinutes(new Date('2026-10-29T15:00:00Z')), 0);
  assert.equal(kstMinutes(new Date('2026-10-29T23:59:00Z')), 539);
  assert.equal(kstMinutes(new Date('2026-10-30T00:30:00Z')), 570);
});

test('timeToMinutes parses HH:MM and rejects invalid values', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('23:59:59'), 1439);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes('9:30'), null);
  assert.equal(timeToMinutes('nope'), null);
});

test('minutesApart wraps around midnight', () => {
  assert.equal(minutesApart(23 * 60 + 58, 2), 4);
  assert.equal(minutesApart(9 * 60, 9 * 60 + 5), 5);
  assert.equal(minutesApart(0, 12 * 60), 720);
});
