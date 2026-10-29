import {
  and,
  attendanceTable,
  eq,
  experienceEntriesTable,
  membersTable,
  type AppDatabase,
} from '@workspace/db';

import { config } from '../config';
import { HttpError, isUniqueViolation } from './errors';
import { addExperience } from './progression';
import { kstDate } from './time';

export interface AttendanceOutcome {
  attendanceDate: string;
  expGranted: number;
  member: typeof membersTable.$inferSelect;
  /** Levels gained by this check-in (0 unless the member crossed a boundary). */
  gainedLevels: number;
}

/**
 * Records one attendance for a member in the Korea Standard Time day that
 * contains `now`. The row lock plus the unique index make double check-ins
 * impossible even when two requests arrive at the same time.
 *
 * Shared by the web route and the KakaoTalk bot so both paths use identical
 * EXP and level rules.
 */
export const recordAttendance = async (
  database: AppDatabase,
  memberId: number,
  now: Date = new Date(),
): Promise<AttendanceOutcome> => {
  const today = kstDate(now);

  try {
    return await database.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, memberId))
        .for('update')
        .limit(1);

      if (!member) {
        throw new HttpError(404, '멤버를 찾을 수 없습니다.');
      }

      if (member.status !== 'active') {
        throw new HttpError(403, '비활성 상태의 멤버입니다.');
      }

      const [existing] = await tx
        .select({ id: attendanceTable.id })
        .from(attendanceTable)
        .where(
          and(
            eq(attendanceTable.memberId, member.id),
            eq(attendanceTable.attendanceDate, today),
          ),
        )
        .limit(1);

      if (existing) {
        throw new HttpError(409, '오늘 출석은 이미 완료했습니다.');
      }

      const [record] = await tx
        .insert(attendanceTable)
        .values({
          memberId: member.id,
          attendanceDate: today,
          expGranted: config.attendanceExp,
        })
        .returning();

      const progression = addExperience(member, config.attendanceExp);

      const [updatedMember] = await tx
        .update(membersTable)
        .set({
          level: progression.level,
          exp: progression.exp,
          totalExp: progression.totalExp,
        })
        .where(eq(membersTable.id, member.id))
        .returning();

      await tx.insert(experienceEntriesTable).values({
        memberId: member.id,
        amount: config.attendanceExp,
        reason: '출석 체크',
        sourceType: 'attendance',
        sourceId: today,
      });

      return {
        attendanceDate: record.attendanceDate,
        expGranted: record.expGranted,
        member: updatedMember,
        gainedLevels: progression.level - member.level,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'attendance_member_date_unique')) {
      throw new HttpError(409, '오늘 출석은 이미 완료했습니다.');
    }

    throw error;
  }
};
