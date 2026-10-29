import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { eventClaimsTable, eventsTable, membersTable } from '@workspace/db';

import {
  createTestDatabase,
  expectHttpError,
  type TestDatabase,
} from '../test-utils';
import { submitEventClaim } from './event-claims';

let context: TestDatabase;

before(async () => {
  context = await createTestDatabase();
});

after(async () => {
  await context.close();
});

beforeEach(async () => {
  await context.client.exec(
    'truncate table event_claims, events, members restart identity cascade',
  );
});

const createMember = async () => {
  const [member] = await context.db
    .insert(membersTable)
    .values({
      memberNumber: '000321',
      clerkUserId: 'clerk-event',
      displayName: '별',
      openChatNickname: 'star',
    })
    .returning();

  return member;
};

const createEvent = async (active = true) => {
  const [event] = await context.db
    .insert(eventsTable)
    .values({
      name: '아침 응원',
      slot: 'morning',
      acceptedPhrase: '좋은 아침이에요',
      eventTime: '09:00',
      rewardExp: 30,
      active,
    })
    .returning();

  return event;
};

// 2026-10-29T00:03Z is 09:03 in Korea.
const atKst = (hour: number, minute: number): Date =>
  new Date(Date.UTC(2026, 9, 29, hour - 9, minute));

test('a claim inside the window is stored as pending', async () => {
  const member = await createMember();
  const event = await createEvent();

  const result = await submitEventClaim(
    context.db,
    member.id,
    event.id,
    '좋은 아침이에요',
    atKst(9, 3),
  );

  assert.equal(result.eventName, '아침 응원');
  assert.equal(result.claim.status, 'pending');
  assert.equal(result.claim.eventDate, '2026-10-29');
  assert.equal(result.claim.slot, 'morning');
});

test('the same event can only be claimed once per day', async () => {
  const member = await createMember();
  const event = await createEvent();

  await submitEventClaim(context.db, member.id, event.id, '문구', atKst(9, 2));
  await expectHttpError(
    submitEventClaim(context.db, member.id, event.id, '문구', atKst(9, 4)),
    409,
  );

  const claims = await context.db.select().from(eventClaimsTable);
  assert.equal(claims.length, 1);
});

test('claims outside the time window are rejected', async () => {
  const member = await createMember();
  const event = await createEvent();

  await expectHttpError(
    submitEventClaim(context.db, member.id, event.id, '문구', atKst(9, 6)),
    409,
  );
  await expectHttpError(
    submitEventClaim(context.db, member.id, event.id, '문구', atKst(8, 54)),
    409,
  );
});

test('inactive events and unknown ids are rejected', async () => {
  const member = await createMember();
  const event = await createEvent(false);

  await expectHttpError(
    submitEventClaim(context.db, member.id, event.id, '문구', atKst(9, 1)),
    409,
  );
  await expectHttpError(
    submitEventClaim(context.db, member.id, 9999, '문구', atKst(9, 1)),
    404,
  );
});

test('blank phrases are rejected', async () => {
  const member = await createMember();
  const event = await createEvent();

  await expectHttpError(
    submitEventClaim(context.db, member.id, event.id, '   ', atKst(9, 1)),
    400,
  );
});
