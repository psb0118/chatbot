import { randomInt } from 'node:crypto';

import { RegisterMemberBody } from '@workspace/api-zod';
import { db, eq, membersTable } from '@workspace/db';
import { Router } from 'express';

import {
  HttpError,
  isUniqueViolation,
  requireNonEmptyText,
} from '../lib/errors';
import {
  clearKakaoLink,
  issueLinkCode,
  LINK_CODE_TTL_MINUTES,
} from '../lib/kakao-link';
import {
  findMemberByClerkId,
  requireMemberByClerkId,
} from '../lib/members';
import { serializeMember } from '../lib/serializers';
import { requireUser } from '../middleware/auth';

const MEMBER_NUMBER_ATTEMPTS = 8;

const createMember = async (
  clerkUserId: string,
  displayName: string,
  openChatNickname: string,
) => {
  for (let attempt = 0; attempt < MEMBER_NUMBER_ATTEMPTS; attempt += 1) {
    const memberNumber = String(randomInt(100_000, 1_000_000));
    try {
      const [created] = await db
        .insert(membersTable)
        .values({
          memberNumber,
          clerkUserId,
          displayName,
          openChatNickname,
          linkStatus: 'pending',
          level: 1,
          exp: 0,
          totalExp: 0,
          status: 'active',
        })
        .returning();

      return created;
    } catch (error) {
      if (isUniqueViolation(error, 'members_member_number_unique')) {
        continue;
      }
      if (isUniqueViolation(error)) {
        throw new HttpError(409, '이미 등록된 계정이거나 사용 중인 닉네임입니다.');
      }
      throw error;
    }
  }

  throw new HttpError(
    500,
    '회원 번호를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
};

export const membersRouter: Router = Router();

membersRouter.get('/members/me', requireUser, async (_request, response) => {
  const member = await findMemberByClerkId(response.locals.userId);
  response.json({ member: member ? serializeMember(member) : null });
});

membersRouter.post(
  '/members/me/kakao/link-code',
  requireUser,
  async (_request, response) => {
    const member = await requireMemberByClerkId(
      response.locals.userId as string,
    );
    const { code, expiresAt } = await issueLinkCode(db, member.id);

    response.json({
      code,
      expiresAt,
      expiresInMinutes: LINK_CODE_TTL_MINUTES,
    });
  },
);

membersRouter.delete('/members/me/kakao', requireUser, async (_request, response) => {
  const member = await requireMemberByClerkId(
    response.locals.userId as string,
  );
  const updated = await clearKakaoLink(db, member.id);

  response.json({ member: serializeMember(updated) });
});

membersRouter.post('/members', requireUser, async (request, response) => {
  const body = RegisterMemberBody.parse(request.body);
  const clerkUserId = response.locals.userId as string;

  const existing = await findMemberByClerkId(clerkUserId);
  if (existing) {
    throw new HttpError(409, '이미 등록된 계정입니다.');
  }

  const created = await createMember(
    clerkUserId,
    requireNonEmptyText(body.displayName, '표시 이름'),
    requireNonEmptyText(body.openChatNickname, '오픈채팅 닉네임'),
  );

  response.status(201).json({ member: serializeMember(created) });
});
