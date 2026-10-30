import { asc, db, desc, eq, membersTable, type AppDatabase } from '@workspace/db';

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

/**
 * Active members ordered by lifetime EXP. The database can be injected so the
 * ranking rules are testable against an in-memory database.
 */
export const listTopMembers = async (
  limit: number,
  database: AppDatabase = db,
) => {
  const members = await database
    .select()
    .from(membersTable)
    .where(eq(membersTable.status, 'active'))
    .orderBy(desc(membersTable.totalExp), asc(membersTable.joinedAt))
    .limit(limit);

  return members.map((member, index) => serializeRanking(member, index + 1));
};
