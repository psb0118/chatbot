import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import {
  attendanceTable,
  experienceEntriesTable,
  membersTable,
} from '@workspace/db';

import { issueLinkCode } from '../lib/kakao-link';
import { listTopMembers } from '../lib/members';
import { createTestDatabase, type TestDatabase } from '../test-utils';
import { handleBotMessage } from './handler';

/**
 * Two chat accounts in the same channel.
 *
 * A different Google/email login means a different Kakao account, and the bot
 * identifies people by `userRequest.user.id` (botUserKey). These tests pin the
 * consequences: per-account attendance, per-account EXP/ranking, and the
 * one-to-one link rules that stop someone from farming a member twice.
 */

let context: TestDatabase;

before(async () => {
  context = await createTestDatabase();
});

after(async () => {
  await context.close();
});

beforeEach(async () => {
  await context.client.exec(
    'truncate table event_claims, events, attendance, experience_entries, members restart identity cascade',
  );
});

const appUrl = 'https://flober.test';

// 10:00 KST on two consecutive days.
const day1 = new Date('2026-10-29T01:00:00Z');
const day2 = new Date('2026-10-30T01:00:00Z');

const createMember = async (number: string, name: string) => {
  const [member] = await context.db
    .insert(membersTable)
    .values({
      memberNumber: number,
      clerkUserId: `clerk-${number}`,
      displayName: name,
      openChatNickname: `nick-${number}`,
      linkStatus: 'pending',
    })
    .returning();

  return member;
};

/** Issues a web link code and redeems it from the given chat account. */
const linkAccount = async (
  memberId: number,
  botUserKey: string,
  now: Date = day1,
) => {
  const { code } = await issueLinkCode(context.db, memberId, now);
  const reply = await handleBotMessage(
    { utterance: `연동 ${code}`, botUserKey, appUrl, now },
    context.db,
  );

  return { code, reply };
};

const say = (
  botUserKey: string,
  utterance: string,
  now: Date = day1,
) =>
  handleBotMessage({ utterance, botUserKey, appUrl, now }, context.db);

const membersByNumber = async () => {
  const rows = await context.db.select().from(membersTable);
  return new Map(rows.map((row) => [row.memberNumber, row]));
};

test('each chat account links to its own member', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');

  const firstLink = await linkAccount(first.id, 'bot-account-a');
  const secondLink = await linkAccount(second.id, 'bot-account-b');

  assert.match(firstLink.reply.text, /카카오 연동이 완료됐어요/);
  assert.match(firstLink.reply.text, /000111/);
  assert.match(secondLink.reply.text, /000222/);

  const stored = await membersByNumber();
  assert.equal(stored.get('000111')?.kakaoUserKey, 'bot-account-a');
  assert.equal(stored.get('000222')?.kakaoUserKey, 'bot-account-b');
  assert.equal(stored.get('000111')?.linkStatus, 'verified');
  assert.equal(stored.get('000222')?.linkStatus, 'verified');
});

test('both accounts can check in on the same day', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');
  await linkAccount(second.id, 'bot-account-b');

  const firstReply = await say('bot-account-a', '출석');
  const secondReply = await say('bot-account-b', '출석');

  assert.match(firstReply.text, /출석 완료/);
  assert.match(secondReply.text, /출석 완료/);

  const attendance = await context.db.select().from(attendanceTable);
  assert.equal(attendance.length, 2);
  assert.deepEqual(
    attendance.map((row) => row.memberId).sort((a, b) => a - b),
    [first.id, second.id].sort((a, b) => a - b),
  );
  assert.ok(attendance.every((row) => row.attendanceDate === '2026-10-29'));

  const stored = await membersByNumber();
  assert.equal(stored.get('000111')?.totalExp, 50);
  assert.equal(stored.get('000222')?.totalExp, 50);
});

test('a duplicate check-in only blocks that account', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');
  await linkAccount(second.id, 'bot-account-b');

  await say('bot-account-a', '출석');
  const duplicate = await say('bot-account-a', '출석체크');
  assert.match(duplicate.text, /이미 완료/);

  const unaffected = await say('bot-account-b', '출석');
  assert.match(unaffected.text, /출석 완료/);

  const attendance = await context.db.select().from(attendanceTable);
  assert.equal(attendance.length, 2);
});

test('내정보 shows only the asking account\'s member', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');
  await linkAccount(second.id, 'bot-account-b');

  await say('bot-account-a', '출석');
  await say('bot-account-b', '출석');

  const firstInfo = await say('bot-account-a', '내정보');
  assert.match(firstInfo.text, /000111/);
  assert.match(firstInfo.text, /가온/);
  assert.doesNotMatch(firstInfo.text, /000222/);

  const secondInfo = await say('bot-account-b', '내정보');
  assert.match(secondInfo.text, /000222/);
  assert.match(secondInfo.text, /나래/);
  assert.doesNotMatch(secondInfo.text, /000111/);
});

test('a linked account cannot be attached to a second member', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');

  // The same chat account tries to redeem the second member's code.
  const { code } = await issueLinkCode(context.db, second.id, day1);
  const rejected = await say('bot-account-a', `연동 ${code}`);

  assert.match(rejected.text, /이미 다른 멤버에 연결되어 있습니다/);

  const stored = await membersByNumber();
  assert.equal(stored.get('000111')?.kakaoUserKey, 'bot-account-a');
  assert.equal(stored.get('000222')?.kakaoUserKey, null);

  // The failed attempt must not burn the code: the right account can use it.
  const accepted = await say('bot-account-b', `연동 ${code}`);
  assert.match(accepted.text, /카카오 연동이 완료됐어요/);

  const afterRetry = await membersByNumber();
  assert.equal(afterRetry.get('000222')?.kakaoUserKey, 'bot-account-b');
});

test('a member cannot be attached to a second chat account', async () => {
  const first = await createMember('000111', '가온');
  await linkAccount(first.id, 'bot-account-a');

  const { code } = await issueLinkCode(context.db, first.id, day1);
  const rejected = await say('bot-account-b', `연동 ${code}`);

  assert.match(rejected.text, /이미 다른 카카오 계정에 연결된 멤버입니다/);

  const stored = await membersByNumber();
  assert.equal(stored.get('000111')?.kakaoUserKey, 'bot-account-a');

  // The rejected account stays unlinked and is still guided to the web.
  const checkin = await say('bot-account-b', '출석');
  assert.match(checkin.text, /연동이 필요해요/);
});

test('unlinking one account leaves the other linked', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');
  await linkAccount(second.id, 'bot-account-b');

  const unlinked = await say('bot-account-a', '연동해제');
  assert.match(unlinked.text, /연동을 해제했어요/);

  const blocked = await say('bot-account-a', '출석');
  assert.match(blocked.text, /연동이 필요해요/);

  const stillLinked = await say('bot-account-b', '출석');
  assert.match(stillLinked.text, /출석 완료/);

  const stored = await membersByNumber();
  assert.equal(stored.get('000111')?.kakaoUserKey, null);
  assert.equal(stored.get('000111')?.linkStatus, 'unlinked');
  assert.equal(stored.get('000222')?.kakaoUserKey, 'bot-account-b');
});

test('ranking keeps the two accounts separate', async () => {
  const first = await createMember('000111', '가온');
  const second = await createMember('000222', '나래');
  await linkAccount(first.id, 'bot-account-a');
  await linkAccount(second.id, 'bot-account-b');

  await say('bot-account-a', '출석', day1);
  await say('bot-account-a', '출석', day2);
  await say('bot-account-b', '출석', day1);

  const ranking = await listTopMembers(10, context.db);

  assert.equal(ranking.length, 2);
  assert.equal(ranking[0]?.memberNumber, '000111');
  assert.equal(ranking[0]?.totalExp, 100);
  assert.equal(ranking[0]?.rank, 1);
  assert.equal(ranking[0]?.level, 2);

  assert.equal(ranking[1]?.memberNumber, '000222');
  assert.equal(ranking[1]?.totalExp, 50);
  assert.equal(ranking[1]?.rank, 2);
  assert.equal(ranking[1]?.level, 1);

  const entries = await context.db
    .select()
    .from(experienceEntriesTable);
  const perMember = entries.reduce<Record<number, number>>((acc, entry) => {
    acc[entry.memberId] = (acc[entry.memberId] ?? 0) + 1;
    return acc;
  }, {});

  assert.equal(perMember[first.id], 2);
  assert.equal(perMember[second.id], 1);
});
