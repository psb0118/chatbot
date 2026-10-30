import { randomInt } from 'node:crypto';

import {
  and,
  eq,
  membersTable,
  ne,
  type AppDatabase,
} from '@workspace/db';

import { HttpError, isUniqueViolation } from './errors';

/** Unambiguous characters only: no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const CODE_ATTEMPTS = 8;
const MEMBER_NUMBER_ATTEMPTS = 8;
const DEFAULT_BOT_DISPLAY_NAME = '카카오 사용자';

export const LINK_CODE_LENGTH = 6;

/** Uppercases and strips spaces/hyphens so "ab-12 cd" and "AB12CD" match. */
export const normalizeLinkCode = (value: string): string =>
  value.toUpperCase().replace(/[\s-]/g, '');

export const isValidLinkCode = (value: string): boolean =>
  CODE_PATTERN.test(value);

export const createLinkCode = (): string =>
  Array.from(
    { length: LINK_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');

export interface LinkCodeResult {
  code: string;
}

/**
 * Returns the member's link code, creating it the first time.
 *
 * The code belongs to the member for good: it never expires and redeeming it
 * does not consume it, so the same chat account (or a replacement phone) can
 * re-link at any time with the code the bot showed at sign-up.
 */
export const issueLinkCode = async (
  database: AppDatabase,
  memberId: number,
): Promise<LinkCodeResult> => {
  const [member] = await database
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, memberId))
    .limit(1);

  if (!member) {
    throw new HttpError(404, '멤버를 찾을 수 없습니다.');
  }

  if (member.kakaoLinkCode) {
    return { code: member.kakaoLinkCode };
  }

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = createLinkCode();

    try {
      const [updated] = await database
        .update(membersTable)
        .set({ kakaoLinkCode: code, kakaoLinkCodeExpiresAt: null })
        .where(eq(membersTable.id, memberId))
        .returning();

      if (!updated) {
        throw new HttpError(404, '멤버를 찾을 수 없습니다.');
      }

      return { code: updated.kakaoLinkCode ?? code };
    } catch (error) {
      if (isUniqueViolation(error, 'members_kakao_link_code_unique')) {
        continue;
      }

      throw error;
    }
  }

  throw new HttpError(
    500,
    '연동 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
};

/**
 * Attaches `kakaoUserKey` to the member that owns `rawCode`.
 *
 * The code is permanent, so it stays on the member after a successful link;
 * only the Kakao key and the link status change.
 */
export const redeemLinkCode = async (
  database: AppDatabase,
  rawCode: string,
  kakaoUserKey: string,
): Promise<typeof membersTable.$inferSelect> => {
  const code = normalizeLinkCode(rawCode);

  if (!isValidLinkCode(code)) {
    throw new HttpError(
      404,
      '연동 코드를 찾을 수 없습니다. 카톡에서 "!가입"을 입력하거나 웹 대시보드에서 코드를 확인해 주세요.',
    );
  }

  const [candidate] = await database
    .select()
    .from(membersTable)
    .where(eq(membersTable.kakaoLinkCode, code))
    .limit(1);

  if (!candidate) {
    throw new HttpError(
      404,
      '연동 코드를 찾을 수 없습니다. 카톡에서 "!가입"을 입력하거나 웹 대시보드에서 코드를 확인해 주세요.',
    );
  }

  try {
    return await database.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.kakaoLinkCode, code))
        .for('update')
        .limit(1);

      if (!member) {
        throw new HttpError(
          404,
          '연동 코드를 찾을 수 없습니다. 카톡에서 "!가입"을 입력하거나 웹 대시보드에서 코드를 확인해 주세요.',
        );
      }

      if (member.status !== 'active') {
        throw new HttpError(403, '비활성 상태의 멤버입니다.');
      }

      if (member.kakaoUserKey && member.kakaoUserKey !== kakaoUserKey) {
        throw new HttpError(
          409,
          '이미 다른 카카오 계정에 연결된 멤버입니다. 웹에서 연동을 해제한 뒤 다시 시도해 주세요.',
        );
      }

      const [otherMember] = await tx
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          and(
            eq(membersTable.kakaoUserKey, kakaoUserKey),
            ne(membersTable.id, member.id),
          ),
        )
        .limit(1);

      if (otherMember) {
        throw new HttpError(
          409,
          '이 카카오 계정은 이미 다른 멤버에 연결되어 있습니다.',
        );
      }

      const [updated] = await tx
        .update(membersTable)
        .set({
          kakaoUserKey,
          kakaoLinkCodeExpiresAt: null,
          linkStatus: 'verified',
        })
        .where(eq(membersTable.id, member.id))
        .returning();

      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'members_kakao_user_key_unique')) {
      throw new HttpError(
        409,
        '이 카카오 계정은 이미 다른 멤버에 연결되어 있습니다.',
      );
    }

    throw error;
  }
};

/**
 * Chat-only members never sign in with Clerk, so their `clerk_user_id` is a
 * synthetic key derived from the Kakao account. Real Clerk ids always start
 * with `user_`, so the two namespaces cannot collide.
 */
export const botClerkUserId = (kakaoUserKey: string): string =>
  `kakao:${kakaoUserKey}`;

export interface KakaoSignUpResult {
  member: typeof membersTable.$inferSelect;
  code: string;
  created: boolean;
}

/**
 * Registers the chat account that sent `!가입` and returns its permanent code.
 *
 * Signing up twice is safe: the same member is returned, so a member who
 * unlinked with `연동해제` gets their original record back instead of a
 * duplicate one.
 */
export const registerKakaoMember = async (
  database: AppDatabase,
  kakaoUserKey: string,
  displayName: string = DEFAULT_BOT_DISPLAY_NAME,
): Promise<KakaoSignUpResult> => {
  const existing = await findMemberByKakaoUserKey(database, kakaoUserKey);
  if (existing) {
    const { code } = await issueLinkCode(database, existing.id);
    return {
      member: { ...existing, kakaoLinkCode: code },
      code,
      created: false,
    };
  }

  const [orphan] = await database
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, botClerkUserId(kakaoUserKey)))
    .limit(1);

  if (orphan) {
    if (orphan.status !== 'active') {
      throw new HttpError(403, '비활성 상태의 멤버입니다.');
    }

    const [relinked] = await database
      .update(membersTable)
      .set({ kakaoUserKey, linkStatus: 'verified' })
      .where(eq(membersTable.id, orphan.id))
      .returning();

    const { code } = await issueLinkCode(database, relinked.id);
    return {
      member: { ...relinked, kakaoLinkCode: code },
      code,
      created: false,
    };
  }

  for (let attempt = 0; attempt < MEMBER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      const [created] = await database
        .insert(membersTable)
        .values({
          memberNumber: String(randomInt(100_000, 1_000_000)),
          clerkUserId: botClerkUserId(kakaoUserKey),
          displayName,
          linkStatus: 'verified',
          kakaoUserKey,
          level: 1,
          exp: 0,
          totalExp: 0,
          status: 'active',
        })
        .returning();

      const { code } = await issueLinkCode(database, created.id);
      return {
        member: { ...created, kakaoLinkCode: code },
        code,
        created: true,
      };
    } catch (error) {
      if (isUniqueViolation(error, 'members_member_number_unique')) {
        continue;
      }

      // A concurrent `!가입` won the race; fall back to the stored member.
      if (isUniqueViolation(error)) {
        const raced = await findMemberByKakaoUserKey(database, kakaoUserKey);
        if (raced) {
          const { code } = await issueLinkCode(database, raced.id);
          return {
            member: { ...raced, kakaoLinkCode: code },
            code,
            created: false,
          };
        }
      }

      throw error;
    }
  }

  throw new HttpError(
    500,
    '회원 번호를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
};

export const findMemberByKakaoUserKey = async (
  database: AppDatabase,
  kakaoUserKey: string,
): Promise<typeof membersTable.$inferSelect | undefined> => {
  const [member] = await database
    .select()
    .from(membersTable)
    .where(eq(membersTable.kakaoUserKey, kakaoUserKey))
    .limit(1);

  return member;
};

/** Removes the Kakao link from a specific member (used by the web dashboard). */
export const clearKakaoLink = async (
  database: AppDatabase,
  memberId: number,
): Promise<typeof membersTable.$inferSelect> => {
  const [updated] = await database
    .update(membersTable)
    .set({
      kakaoUserKey: null,
      linkStatus: 'unlinked',
    })
    .where(eq(membersTable.id, memberId))
    .returning();

  if (!updated) {
    throw new HttpError(404, '멤버를 찾을 수 없습니다.');
  }

  return updated;
};

/** Removes the Kakao link from the chat account that asked to unlink. */
export const unlinkKakaoAccount = async (
  database: AppDatabase,
  kakaoUserKey: string,
): Promise<typeof membersTable.$inferSelect | undefined> => {
  const [updated] = await database
    .update(membersTable)
    .set({ kakaoUserKey: null, linkStatus: 'unlinked' })
    .where(eq(membersTable.kakaoUserKey, kakaoUserKey))
    .returning();

  return updated;
};
