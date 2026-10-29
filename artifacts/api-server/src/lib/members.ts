import { asc, db, desc, eq, membersTable } from '@workspace/db';

import { HttpError } from './errors';
import { serializeRanking } from './serializers';

export const findMemberByClerkId = async (clerkUserId: string) => {
  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.clerkUserId, clerkUserId))
    .limit(1);

  return member;
};

export const requireMemberByClerkId = async (clerkUserId: string) => {
  const member = await findMemberByClerkId(clerkUserId);
  if (!member) {
    throw new HttpError(404, '멤버 등록이 필요합니다.');
  }
  return member;
};

export const listTopMembers = async (limit: number) => {
  const members = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.status, 'active'))
    .orderBy(desc(membersTable.totalExp), asc(membersTable.joinedAt))
    .limit(limit);

  return members.map((member, index) => serializeRanking(member, index + 1));
};
