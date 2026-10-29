import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import {
  attendanceTable,
  experienceEntriesTable,
  membersTable,
} from '@workspace/db';

import {
  createTestDatabase,
  expectHttpError,
  type TestDatabase,
} from '../test-utils';
import { recordAttendance } from './attendance';

let context: TestDatabase;

before(async () => {
  context = await createTestDatabase();
});

after(async () => {
  await context.close();
});

beforeEach(async () => {
  await context.client.exec(
    'truncate table attendance, experience_entries, members restart identity cascade',
  );
});

const createMember = async (status: 'active' | 'inactive' = 'active') => {
  const [member] = await context.db
    .insert(membersTable)
    .values({
      memberNumber: status === 'active' ? '000123' : '000124',
      clerkUserId: `clerk-${status}`,
      displayName: '하늘',
      openChatNickname: `sky-${status}`,
      linkStatus: 'pending',
      status,
    })
    .returning();

  return member;
};

test('the first check-in of a KST day grants EXP once', async () => {
  const member = await createMember();
  const result = await recordAttendance(
    context.db,
    member.id,
    new Date('2026-10-29T01:00:00Z'),
  );

  assert.equal(result.attendanceDate, '2026-10-29');
  assert.equal(result.expGranted, 50);
  assert.equal(result.member.totalExp, 50);
  assert.equal(result.member.exp, 50);
  assert.equal(result.member.level, 1);
  assert.equal(result.gainedLevels, 0);

  const records = await context.db.select().from(attendanceTable);
  const entries = await context.db.select().from(experienceEntriesTable);
  assert.equal(records.length, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceType, 'attendance');
});

test('a second check-in on the same KST day is rejected', async () => {
  const member = await createMember();
  const morning = new Date('2026-10-29T01:00:00Z');

  await recordAttendance(context.db, member.id, morning);
  await expectHttpError(
    recordAttendance(context.db, member.id, new Date('2026-10-29T10:00:00Z')),
    409,
  );

  const records = await context.db.select().from(attendanceTable);
  const [stored] = await context.db.select().from(membersTable);
  assert.equal(records.length, 1);
  assert.equal(stored.totalExp, 50);
});

test('the next KST day starts a new streak and can level up', async () => {
  const member = await createMember();
  await recordAttendance(context.db, member.id, new Date('2026-10-29T01:00:00Z'));

  // 2026-10-29T15:05Z is 2026-10-30 00:05 in Korea.
  const second = await recordAttendance(
    context.db,
    member.id,
    new Date('2026-10-29T15:05:00Z'),
  );

  assert.equal(second.attendanceDate, '2026-10-30');
  assert.equal(second.member.totalExp, 100);
  assert.equal(second.member.level, 2);
  assert.equal(second.member.exp, 0);
  assert.equal(second.gainedLevels, 1);
});

test('inactive members cannot check in', async () => {
  const member = await createMember('inactive');

  await expectHttpError(
    recordAttendance(context.db, member.id, new Date('2026-10-29T01:00:00Z')),
    403,
  );
});

test('unknown members are rejected', async () => {
  await expectHttpError(
    recordAttendance(context.db, 9999, new Date('2026-10-29T01:00:00Z')),
    404,
  );
});
