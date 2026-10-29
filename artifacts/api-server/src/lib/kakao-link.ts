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

export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_MINUTES = 15;

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
  expiresAt: Date;
}

/**
 * Issues a one-time code that the signed-in member can send from KakaoTalk to
 * attach that chat account to their web membership.
 */
export const issueLinkCode = async (
  database: AppDatabase,
  memberId: number,
  now: Date = new Date(),
): Promise<LinkCodeResult> => {
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MINUTES * 60_000);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = createLinkCode();

    try {
      const [updated] = await database
        .update(membersTable)
        .set({ kakaoLinkCode: code, kakaoLinkCodeExpiresAt: expiresAt })
        .where(eq(membersTable.id, memberId))
        .returning();

      if (!updated) {
        throw new HttpError(404, '멤버를 찾을 수 없습니다.');
      }

      return { code, expiresAt };
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
 * The code is single use: it is cleared in the same transaction that stores the
 * Kakao key, so replaying it later fails.
 */
export const redeemLinkCode = async (
  database: AppDatabase,
  rawCode: string,
  kakaoUserKey: string,
  now: Date = new Date(),
): Promise<typeof membersTable.$inferSelect> => {
  const code = normalizeLinkCode(rawCode);

  if (!isValidLinkCode(code)) {
    throw new HttpError(
      404,
      '연동 코드를 찾을 수 없습니다. 웹에서 코드를 새로 발급해 주세요.',
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
      '연동 코드를 찾을 수 없습니다. 웹에서 코드를 새로 발급해 주세요.',
    );
  }

  if (
    candidate.kakaoLinkCodeExpiresAt &&
    candidate.kakaoLinkCodeExpiresAt.getTime() <= now.getTime()
  ) {
    // Clear outside the transaction so the cleanup survives the thrown error.
    await database
      .update(membersTable)
      .set({ kakaoLinkCode: null, kakaoLinkCodeExpiresAt: null })
      .where(eq(membersTable.id, candidate.id));

    throw new HttpError(
      410,
      `연동 코드가 만료되었습니다. 웹에서 새 코드를 발급해 주세요. (유효 시간 ${LINK_CODE_TTL_MINUTES}분)`,
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
          '연동 코드를 찾을 수 없습니다. 웹에서 코드를 새로 발급해 주세요.',
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
          kakaoLinkCode: null,
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
      kakaoLinkCode: null,
      kakaoLinkCodeExpiresAt: null,
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
