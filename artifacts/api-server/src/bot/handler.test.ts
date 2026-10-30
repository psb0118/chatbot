import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { eventsTable, membersTable } from '@workspace/db';

import { issueLinkCode } from '../lib/kakao-link';
import {
  createTestDatabase,
  type TestDatabase,
} from '../test-utils';
import { handleBotMessage } from './handler';

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

const createMember = async (number = '000777') => {
  const [member] = await context.db
    .insert(membersTable)
    .values({
      memberNumber: number,
      clerkUserId: `clerk-${number}`,
      displayName: '하늘',
      openChatNickname: `sky-${number}`,
      linkStatus: 'pending',
    })
    .returning();

  return member;
};

const linkMember = async (memberId: number, botUserKey: string, now: Date) => {
  const { code } = await issueLinkCode(context.db, memberId);
  const reply = await handleBotMessage(
    {
      utterance: `연동 ${code.toLowerCase()}`,
      botUserKey,
      appUrl,
      now,
    },
    context.db,
  );

  return reply;
};

test('unlinked users are guided to the web link code', async () => {
  const reply = await handleBotMessage(
    { utterance: '출석', botUserKey: 'bot-unlinked', appUrl },
    context.db,
  );

  assert.match(reply.text, /연동이 필요해요/);

  const dashboardLink = reply.quickReplies?.find(
    (quickReply) => quickReply.action === 'webLink',
  );
  assert.equal(
    dashboardLink?.action === 'webLink' ? dashboardLink.webLinkUrl : null,
    `${appUrl}/dashboard`,
  );
});

test('linking a code connects the chat account', async () => {
  const member = await createMember();
  const now = new Date('2026-10-29T01:00:00Z');

  const reply = await linkMember(member.id, 'bot-linked', now);
  assert.match(reply.text, /연동이 완료됐어요/);

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoUserKey, 'bot-linked');
});

test('!가입 registers the chat account and returns a permanent code', async () => {
  const now = new Date('2026-10-29T01:00:00Z');
  const reply = await handleBotMessage(
    { utterance: '!가입', botUserKey: 'bot-join', appUrl, now },
    context.db,
  );

  assert.match(reply.text, /가입이 완료됐어요/);
  assert.match(reply.text, /계속 그대로 쓸 수 있어요/);

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoUserKey, 'bot-join');
  assert.ok(stored.kakaoLinkCode);
  assert.equal(stored.kakaoLinkCodeExpiresAt, null);
  assert.match(reply.text, new RegExp(stored.kakaoLinkCode as string));

  const again = await handleBotMessage(
    { utterance: '가입', botUserKey: 'bot-join', appUrl, now },
    context.db,
  );

  assert.match(again.text, /이미 가입되어 있어요/);
  assert.match(again.text, new RegExp(stored.kakaoLinkCode as string));

  const rows = await context.db.select().from(membersTable);
  assert.equal(rows.length, 1);
});

test('a member who signed up in chat can check in right away', async () => {
  const now = new Date('2026-10-29T01:00:00Z');
  await handleBotMessage(
    { utterance: '!가입', botUserKey: 'bot-join-checkin', appUrl, now },
    context.db,
  );

  const reply = await handleBotMessage(
    { utterance: '출석', botUserKey: 'bot-join-checkin', appUrl, now },
    context.db,
  );

  assert.match(reply.text, /출석 완료/);
});

test('the permanent code re-links after 연동해제', async () => {
  const now = new Date('2026-10-29T01:00:00Z');
  const joinReply = await handleBotMessage(
    { utterance: '!가입', botUserKey: 'bot-relink', appUrl, now },
    context.db,
  );
  const code = /연동 코드는 ([A-Z2-9]{6})/.exec(joinReply.text)?.[1];
  assert.ok(code, joinReply.text);

  const unlinkReply = await handleBotMessage(
    { utterance: '연동해제', botUserKey: 'bot-relink', appUrl, now },
    context.db,
  );
  assert.match(unlinkReply.text, new RegExp(code));

  const relinkReply = await handleBotMessage(
    { utterance: `연동 ${code}`, botUserKey: 'bot-relink', appUrl, now },
    context.db,
  );
  assert.match(relinkReply.text, /연동이 완료됐어요/);
});

test('invalid link codes produce a readable error', async () => {
  const reply = await handleBotMessage(
    { utterance: '연동 ZZZZZZ', botUserKey: 'bot-invalid', appUrl },
    context.db,
  );

  assert.match(reply.text, /찾을 수 없습니다/);
});

test('linked members can check in from chat, once per day', async () => {
  const member = await createMember();
  const now = new Date('2026-10-29T01:00:00Z');
  await linkMember(member.id, 'bot-checkin', now);

  const first = await handleBotMessage(
    { utterance: '출석', botUserKey: 'bot-checkin', appUrl, now },
    context.db,
  );
  assert.match(first.text, /출석 완료/);
  assert.match(first.text, /\+50 EXP/);

  const second = await handleBotMessage(
    { utterance: '출석체크', botUserKey: 'bot-checkin', appUrl, now },
    context.db,
  );
  assert.match(second.text, /이미 완료/);
});

test('member info shows the linked membership', async () => {
  const member = await createMember();
  const now = new Date('2026-10-29T01:00:00Z');
  await linkMember(member.id, 'bot-info', now);

  const reply = await handleBotMessage(
    { utterance: '내정보', botUserKey: 'bot-info', appUrl, now },
    context.db,
  );

  assert.match(reply.text, /000777/);
  assert.match(reply.text, /Lv\. 1/);
});

test('unlink disconnects the chat account', async () => {
  const member = await createMember();
  const now = new Date('2026-10-29T01:00:00Z');
  await linkMember(member.id, 'bot-unlink', now);

  const reply = await handleBotMessage(
    { utterance: '연동해제', botUserKey: 'bot-unlink', appUrl, now },
    context.db,
  );
  assert.match(reply.text, /연동을 해제했어요/);

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoUserKey, null);
});

test('event list shows ids and rewards', async () => {
  await context.db.insert(eventsTable).values({
    name: '아침 응원',
    slot: 'morning',
    acceptedPhrase: '좋은 아침이에요',
    eventTime: '09:00',
    rewardExp: 30,
  });

  const reply = await handleBotMessage(
    { utterance: '이벤트', botUserKey: 'bot-events', appUrl },
    context.db,
  );

  assert.match(reply.text, /1번 아침 응원/);
  assert.match(reply.text, /이벤트참여/);
});

test('linked members can submit an event claim from chat', async () => {
  const member = await createMember();
  const now = new Date(Date.UTC(2026, 9, 29, 0, 2)); // 09:02 KST
  await linkMember(member.id, 'bot-claim', now);

  const [event] = await context.db
    .insert(eventsTable)
    .values({
      name: '아침 응원',
      slot: 'morning',
      acceptedPhrase: '좋은 아침이에요',
      eventTime: '09:00',
      rewardExp: 30,
    })
    .returning();

  const reply = await handleBotMessage(
    {
      utterance: `이벤트참여 ${event.id} 좋은 아침이에요`,
      botUserKey: 'bot-claim',
      appUrl,
      now,
    },
    context.db,
  );

  assert.match(reply.text, /접수됐어요/);
  assert.match(reply.text, /아침 응원/);
});

test('payloads without a chat user id fall back to a clear message', async () => {
  const reply = await handleBotMessage(
    { utterance: '출석', botUserKey: null, appUrl },
    context.db,
  );

  assert.match(reply.text, /카카오 사용자 정보를 확인할 수 없어요/);
});

test('unknown utterances still use the static rules', async () => {
  const reply = await handleBotMessage(
    { utterance: '오늘 날씨 어때', botUserKey: 'bot-unknown', appUrl },
    context.db,
  );

  assert.match(reply.text, /이해하지 못했어요/);
});
