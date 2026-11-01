import {
  eq,
  eventClaimsTable,
  eventsTable,
  membersTable,
  type AppDatabase,
} from '@workspace/db';

import { config } from '../config';
import { HttpError, isUniqueViolation, requireNonEmptyText } from './errors';
import { kstDate, kstMinutes, minutesApart, timeToMinutes } from './time';

export interface ClaimOutcome {
  claim: typeof eventClaimsTable.$inferSelect;
  eventName: string;
}

/**
 * Submits an event participation claim after checking the event is active and
 * that the current Korea Standard Time is inside the allowed window.
 *
 * Shared by the web route and the KakaoTalk bot.
 */
export const submitEventClaim = async (
  database: AppDatabase,
  memberId: number,
  eventId: number,
  phrase: string,
  now: Date = new Date(),
): Promise<ClaimOutcome> => {
  const [member] = await database
    .select({ status: membersTable.status })
    .from(membersTable)
    .where(eq(membersTable.id, memberId))
    .limit(1);

  if (!member) {
    throw new HttpError(404, '멤버를 찾을 수 없습니다.');
  }

  // Same rule as attendance and sign-up: an inactive member cannot claim.
  if (member.status !== 'active') {
    throw new HttpError(403, '비활성 상태의 멤버입니다.');
  }

  const [event] = await database
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);

  if (!event) {
    throw new HttpError(404, '이벤트를 찾을 수 없습니다.');
  }

  if (!event.active) {
    throw new HttpError(409, '종료된 이벤트입니다.');
  }

  const eventMinutes = timeToMinutes(event.eventTime);
  if (
    eventMinutes !== null &&
    minutesApart(kstMinutes(now), eventMinutes) >
      config.eventClaimWindowMinutes
  ) {
    throw new HttpError(
      409,
      `이벤트 시각 전후 ${config.eventClaimWindowMinutes}분 이내에만 신청할 수 있습니다.`,
    );
  }

  const eventDate = kstDate(now);

  try {
    const [created] = await database
      .insert(eventClaimsTable)
      .values({
        memberId,
        eventId: event.id,
        slot: event.slot,
        eventDate,
        submittedPhrase: requireNonEmptyText(phrase, '참여 문구'),
        status: 'pending',
      })
      .returning();

    return { claim: created, eventName: event.name };
  } catch (error) {
    if (isUniqueViolation(error, 'event_claims_member_event_date_unique')) {
      throw new HttpError(409, '이미 오늘 이 이벤트에 참여 신청했습니다.');
    }

    throw error;
  }
};
