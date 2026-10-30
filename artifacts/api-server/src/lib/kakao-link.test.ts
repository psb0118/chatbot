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
  normalizeLinkCode,
  redeemLinkCode,
  registerKakaoMember,
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

test('issueLinkCode keeps one permanent code per member', async () => {
  const member = await createMember('1');
  const first = await issueLinkCode(context.db, member.id);
  const second = await issueLinkCode(context.db, member.id);

  assert.ok(isValidLinkCode(first.code));
  assert.equal(second.code, first.code);

  const [stored] = await context.db.select().from(membersTable);
  assert.equal(stored.kakaoLinkCode, first.code);
  assert.equal(stored.kakaoLinkCodeExpiresAt, null);
});

test('redeemLinkCode links the chat account and keeps the code', async () => {
  const member = await createMember('2');
  const { code } = await issueLinkCode(context.db, member.id);

  const linked = await redeemLinkCode(
    context.db,
    code.toLowerCase(),
    'bot-user-2',
  );

  assert.equal(linked.id, member.id);
  assert.equal(linked.kakaoUserKey, 'bot-user-2');
  assert.equal(linked.linkStatus, 'verified');
  assert.equal(linked.kakaoLinkCode, code);

  // Replaying the same code is a no-op re-link, not an error.
  const replay = await redeemLinkCode(context.db, code, 'bot-user-2');
  assert.equal(replay.kakaoUserKey, 'bot-user-2');
});

test('the same code re-links after an unlink', async () => {
  const member = await createMember('3');
  const { code } = await issueLinkCode(context.db, member.id);
  await redeemLinkCode(context.db, code, 'bot-user-3');

  await unlinkKakaoAccount(context.db, 'bot-user-3');

  const relinked = await redeemLinkCode(context.db, code, 'bot-user-3');
  assert.equal(relinked.id, member.id);
  assert.equal(relinked.kakaoUserKey, 'bot-user-3');
  assert.equal(relinked.linkStatus, 'verified');
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
  const { code } = await issueLinkCode(context.db, member.id);
  await redeemLinkCode(context.db, code, 'bot-user-5a');

  await expectHttpError(
    redeemLinkCode(context.db, code, 'bot-user-5b'),
    409,
  );
});

test('one chat account cannot link to two members', async () => {
  const first = await createMember('6');
  const second = await createMember('7');

  const firstCode = await issueLinkCode(context.db, first.id);
  await redeemLinkCode(context.db, firstCode.code, 'shared-bot-user');

  const secondCode = await issueLinkCode(context.db, second.id);
  await expectHttpError(
    redeemLinkCode(context.db, secondCode.code, 'shared-bot-user'),
    409,
  );
});

test('unlink removes the link by chat key or member', async () => {
  const member = await createMember('8');
  const { code } = await issueLinkCode(context.db, member.id);
  await redeemLinkCode(context.db, code, 'bot-user-8');

  const unlinked = await unlinkKakaoAccount(context.db, 'bot-user-8');
  assert.equal(unlinked?.id, member.id);
  assert.equal(unlinked?.kakaoUserKey, null);
  assert.equal(unlinked?.linkStatus, 'unlinked');

  const relinked = await redeemLinkCode(context.db, code, 'bot-user-8b');
  assert.equal(relinked.kakaoUserKey, 'bot-user-8b');

  const cleared = await clearKakaoLink(context.db, member.id);
  assert.equal(cleared.kakaoUserKey, null);
  assert.equal(cleared.linkStatus, 'unlinked');
  assert.equal(cleared.kakaoLinkCode, code);
});

test('registerKakaoMember signs the chat account up with a permanent code', async () => {
  const result = await registerKakaoMember(context.db, 'bot-signup');

  assert.equal(result.created, true);
  assert.ok(isValidLinkCode(result.code));
  assert.match(result.member.memberNumber, /^[0-9]{6}$/);
  assert.equal(result.member.kakaoUserKey, 'bot-signup');
  assert.equal(result.member.linkStatus, 'verified');
  assert.equal(result.member.kakaoLinkCode, result.code);
  assert.equal(result.member.kakaoLinkCodeExpiresAt, null);
  assert.equal(result.member.level, 1);
  assert.equal(result.member.totalExp, 0);
});

test('signing up twice returns the same member and code', async () => {
  const first = await registerKakaoMember(context.db, 'bot-repeat');
  const second = await registerKakaoMember(context.db, 'bot-repeat');

  assert.equal(second.created, false);
  assert.equal(second.member.id, first.member.id);
  assert.equal(second.code, first.code);

  const rows = await context.db.select().from(membersTable);
  assert.equal(rows.length, 1);
});

test('signing up again after unlinking restores the same member', async () => {
  const first = await registerKakaoMember(context.db, 'bot-return');
  await unlinkKakaoAccount(context.db, 'bot-return');

  const again = await registerKakaoMember(context.db, 'bot-return');

  assert.equal(again.created, false);
  assert.equal(again.member.id, first.member.id);
  assert.equal(again.member.kakaoUserKey, 'bot-return');
  assert.equal(again.member.linkStatus, 'verified');
  assert.equal(again.code, first.code);

  const rows = await context.db.select().from(membersTable);
  assert.equal(rows.length, 1);
});

test('two chat accounts sign up as two members', async () => {
  const first = await registerKakaoMember(context.db, 'bot-a');
  const second = await registerKakaoMember(context.db, 'bot-b');

  assert.notEqual(first.member.id, second.member.id);
  assert.notEqual(first.member.memberNumber, second.member.memberNumber);
  assert.notEqual(first.code, second.code);
});
