import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { attendanceTable, membersTable } from '@workspace/db';

import {
  createTestDatabase,
  expectHttpError,
  type TestDatabase,
} from '../test-utils';
import { deviceBridgeKey, handleDeviceMessage } from './device-bridge';

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
const now = new Date('2026-10-29T01:00:00Z');

const say = (sender: string, text: string, room = '플로버 오픈채팅') =>
  handleDeviceMessage({ room, sender, text }, context.db, { appUrl, now });

test('the bridge key is stable per room and sender', () => {
  assert.equal(
    deviceBridgeKey('플로버 오픈채팅', '가온'),
    'device:플로버 오픈채팅:가온',
  );
  assert.equal(
    deviceBridgeKey(' 플로버 오픈채팅 ', ' 가온 '),
    deviceBridgeKey('플로버 오픈채팅', '가온'),
  );
  assert.notEqual(
    deviceBridgeKey('플로버 오픈채팅', '가온'),
    deviceBridgeKey('플로버 오픈채팅', '나래'),
  );
  assert.notEqual(
    deviceBridgeKey('플로버 오픈채팅', '가온'),
    deviceBridgeKey('다른 방', '가온'),
  );
});

test('missing fields are rejected', async () => {
  await expectHttpError(
    handleDeviceMessage({ room: '', sender: '가온', text: '!출석' }, context.db),
    400,
  );
  await expectHttpError(
    handleDeviceMessage({ room: '방', sender: '  ', text: '!출석' }, context.db),
    400,
  );
  await expectHttpError(
    handleDeviceMessage({ room: '방', sender: '가온', text: '' }, context.db),
    400,
  );
  await expectHttpError(
    handleDeviceMessage({ room: '방', sender: '가온' } as never, context.db),
    400,
  );
});

test('!가입 registers the room nickname as a member', async () => {
  const reply = await say('가온', '!가입');

  assert.match(reply, /가입이 완료됐어요/);

  const [member] = await context.db.select().from(membersTable);
  assert.equal(member.displayName, '가온');
  assert.equal(member.kakaoUserKey, 'device:플로버 오픈채팅:가온');
  assert.equal(member.linkStatus, 'verified');
  assert.ok(member.kakaoLinkCode);
});

test('the registered nickname can check in once per day', async () => {
  await say('가온', '!가입');

  const first = await say('가온', '!출석');
  assert.match(first, /출석 완료/);

  const second = await say('가온', '!출석');
  assert.match(second, /이미 완료/);

  const rows = await context.db.select().from(attendanceTable);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.attendanceDate, '2026-10-29');
});

test('different nicknames get separate members and check-ins', async () => {
  await say('가온', '!가입');
  await say('나래', '!가입');

  await say('가온', '!출석');
  await say('나래', '!출석');

  const members = await context.db.select().from(membersTable);
  assert.equal(members.length, 2);
  assert.deepEqual(
    members.map((member) => member.displayName).sort(),
    ['가온', '나래'],
  );

  const attendance = await context.db.select().from(attendanceTable);
  assert.equal(attendance.length, 2);
});

test('the same nickname in two rooms is two members', async () => {
  await say('가온', '!가입', '방 하나');
  await say('가온', '!가입', '방 둘');

  const members = await context.db.select().from(membersTable);
  assert.equal(members.length, 2);
});

test('a nickname change looks like a new member', async () => {
  await say('가온', '!가입');
  const renamed = await say('가온2', '!가입');

  assert.match(renamed, /가입이 완료됐어요/);

  const members = await context.db.select().from(membersTable);
  assert.equal(members.length, 2);
});

test('!사용법 works through the bridge', async () => {
  const reply = await say('가온', '!사용법');

  assert.match(reply, /!가입/);
  assert.match(reply, /!출석/);
});

test('non-command chatter falls back to the static rules', async () => {
  const reply = await say('가온', '오늘 날씨 어때');

  assert.match(reply, /이해하지 못했어요/);
});
