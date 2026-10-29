import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { membersTable } from '@workspace/db';

import {
  createTestDatabase,
  expectHttpError,
  type TestDatabase,
} from '../test-utils';
import {
  clearKakaoLink,
  createLinkCode,
  isValidLinkCode,
  issueLinkCode,
  LINK_CODE_TTL_MINUTES,
  normalizeLinkCode,
  redeemLinkCode,
  unlinkKakaoAccount,
} from './kakao-link';

let context: TestDatabase;

before(async () => {
  context = await createTestDatabase();
});

after(async () => {
  await context.close();
});

beforeEach(async () => {
  await context.client.exec(
    'truncate table members restart identity cascade',
  );
});

const createMember = async (suffix: string) => {
  const [member] = await context.db
    .insert(membersTable)
    .values({
      memberNumber: `00000${suffix}`,
      clerkUserId: `clerk-${suffix}`,
      displayName: `멤버${suffix}`,
      openChatNickname: `nick${suffix}`,
      linkStatus: 'pending',
    })
    .returning();

  return member;
};

test('codes are six unambiguous uppercase characters', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = createLinkCode();
    assert.equal(code.length, 6);
    assert.ok(isValidLinkCode(code), code);
    assert.doesNotMatch(code, /[IO01]/);
  }
});

test('codes are normalized before validation', () => {
  assert.equal(normalizeLinkCode(' ab-23 cd '), 'AB23CD');
  assert.equal(isValidLinkCode('AB23CD'), true);
  assert.equal(isValidLinkCode('ab23cd'), false);
  assert.equal(isValidLinkCode('ABCDE'), false);
  assert.equal(isValidLinkCode('ABCDE0'), false);
  assert.equal(isValidLinkCode('ABC123'), false);
});

test('issueLinkCode stores a 15 minute code', async () => {
  const member = await createMember('1');
  const now = new Date('2026-10-29T01:00:00Z');
  const { code, expiresAt } = await issueLinkCode(context.db, member.id, now);

  assert.ok(isValidLinkCode(code));
  assert.equal(
    expiresAt.getTime(),
    now.getTime() + LINK_CODE_TTL_MINUTES * 60_000,
  );

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoLinkCode, code);
  assert.equal(stored.kakaoLinkCodeExpiresAt?.getTime(), expiresAt.getTime());
});

test('redeemLinkCode links the chat account and burns the code', async () => {
  const member = await createMember('2');
  const now = new Date('2026-10-29T01:00:00Z');
  const { code } = await issueLinkCode(context.db, member.id, now);

  const linked = await redeemLinkCode(
    context.db,
    code.toLowerCase(),
    'bot-user-2',
    now,
  );

  assert.equal(linked.id, member.id);
  assert.equal(linked.kakaoUserKey, 'bot-user-2');
  assert.equal(linked.linkStatus, 'verified');
  assert.equal(linked.kakaoLinkCode, null);

  await expectHttpError(
    redeemLinkCode(context.db, code, 'bot-user-2', now),
    404,
  );
});

test('expired codes are rejected and cleared', async () => {
  const member = await createMember('3');
  const now = new Date('2026-10-29T01:00:00Z');
  const { code } = await issueLinkCode(context.db, member.id, now);

  await expectHttpError(
    redeemLinkCode(
      context.db,
      code,
      'bot-user-3',
      new Date(now.getTime() + (LINK_CODE_TTL_MINUTES + 1) * 60_000),
    ),
    410,
  );

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoLinkCode, null);
  assert.equal(stored.kakaoUserKey, null);
});

test('unknown codes are rejected', async () => {
  await expectHttpError(
    redeemLinkCode(context.db, 'ZZZZZZ', 'bot-user-4'),
    404,
  );
  await expectHttpError(
    redeemLinkCode(context.db, 'not-a-code', 'bot-user-4'),
    404,
  );
});

test('a member cannot be linked to two chat accounts', async () => {
  const member = await createMember('5');
  const now = new Date('2026-10-29T01:00:00Z');
  const first = await issueLinkCode(context.db, member.id, now);
  await redeemLinkCode(context.db, first.code, 'bot-user-5a', now);

  const second = await issueLinkCode(context.db, member.id, now);
  await expectHttpError(
    redeemLinkCode(context.db, second.code, 'bot-user-5b', now),
    409,
  );
});

test('one chat account cannot link to two members', async () => {
  const now = new Date('2026-10-29T01:00:00Z');
  const first = await createMember('6');
  const second = await createMember('7');

  const firstCode = await issueLinkCode(context.db, first.id, now);
  await redeemLinkCode(context.db, firstCode.code, 'shared-bot-user', now);

  const secondCode = await issueLinkCode(context.db, second.id, now);
  await expectHttpError(
    redeemLinkCode(context.db, secondCode.code, 'shared-bot-user', now),
    409,
  );
});

test('unlink removes the link by chat key or member', async () => {
  const now = new Date('2026-10-29T01:00:00Z');
  const member = await createMember('8');
  const { code } = await issueLinkCode(context.db, member.id, now);
  await redeemLinkCode(context.db, code, 'bot-user-8', now);

  const unlinked = await unlinkKakaoAccount(context.db, 'bot-user-8');
  assert.equal(unlinked?.id, member.id);
  assert.equal(unlinked?.kakaoUserKey, null);
  assert.equal(unlinked?.linkStatus, 'unlinked');

  const relinkedCode = await issueLinkCode(context.db, member.id, now);
  await redeemLinkCode(context.db, relinkedCode.code, 'bot-user-8b', now);

  const cleared = await clearKakaoLink(context.db, member.id);
  assert.equal(cleared.kakaoUserKey, null);
  assert.equal(cleared.linkStatus, 'unlinked');
});
