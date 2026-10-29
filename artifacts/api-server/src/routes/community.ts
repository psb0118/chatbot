import { SubmitEventClaimBody } from '@workspace/api-zod';
import {
  attendanceTable,
  db,
  eventClaimsTable,
  eventsTable,
  experienceEntriesTable,
  membersTable,
} from '@workspace/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';

import { config } from '../config';
import {
  HttpError,
  isUniqueViolation,
  requireNonEmptyText,
} from '../lib/errors';
import {
  findMemberByClerkId,
  listTopMembers,
  requireMemberByClerkId,
} from '../lib/members';
import { addExperience } from '../lib/progression';
import {
  serializeAttendance,
  serializeClaim,
  serializeEvent,
  serializeMember,
} from '../lib/serializers';
import { kstDate, kstMinutes, minutesApart, timeToMinutes } from '../lib/time';
import { requireUser } from '../middleware/auth';

export const communityRouter: Router = Router();

communityRouter.use(requireUser);

communityRouter.get('/dashboard', async (_request, response) => {
  const member = await findMemberByClerkId(response.locals.userId as string);
  const today = kstDate();

  const [memberCountRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(membersTable)
    .where(eq(membersTable.status, 'active'));

  const [todayCountRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(attendanceTable)
    .where(eq(attendanceTable.attendanceDate, today));

  const topMembers = await listTopMembers(5);

  let attendedToday = false;
  if (member) {
    const [attendance] = await db
      .select({ id: attendanceTable.id })
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.memberId, member.id),
          eq(attendanceTable.attendanceDate, today),
        ),
      )
      .limit(1);
    attendedToday = Boolean(attendance);
  }

  response.json({
    memberCount: memberCountRow?.value ?? 0,
    todayAttendanceCount: todayCountRow?.value ?? 0,
    currentMember: member ? serializeMember(member) : null,
    attendedToday,
    topMembers,
    kakaoIntegration: 'waiting',
  });
});

communityRouter.get('/leaderboard', async (_request, response) => {
  response.json(await listTopMembers(10));
});

communityRouter.get('/attendance', async (_request, response) => {
  const member = await requireMemberByClerkId(
    response.locals.userId as string,
  );

  const rows = await db
    .select({
      record: attendanceTable,
      memberNumber: membersTable.memberNumber,
      displayName: membersTable.displayName,
    })
    .from(attendanceTable)
    .innerJoin(membersTable, eq(attendanceTable.memberId, membersTable.id))
    .where(eq(attendanceTable.memberId, member.id))
    .orderBy(
      desc(attendanceTable.attendanceDate),
      desc(attendanceTable.createdAt),
    )
    .limit(50);

  response.json(
    rows.map((row) =>
      serializeAttendance(row.record, {
        memberNumber: row.memberNumber,
        displayName: row.displayName,
      }),
    ),
  );
});

communityRouter.post('/attendance', async (_request, response) => {
  const clerkUserId = response.locals.userId as string;
  const today = kstDate();

  try {
    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.clerkUserId, clerkUserId))
        .for('update')
        .limit(1);

      if (!member) {
        throw new HttpError(404, '멤버 등록이 필요합니다.');
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

      return { record, member: updatedMember };
    });

    response.json({
      claimed: true,
      expGranted: result.record.expGranted,
      attendanceDate: result.record.attendanceDate,
      member: serializeMember(result.member),
    });
  } catch (error) {
    if (isUniqueViolation(error, 'attendance_member_date_unique')) {
      throw new HttpError(409, '오늘 출석은 이미 완료했습니다.');
    }
    throw error;
  }
});

communityRouter.get('/events', async (_request, response) => {
  const events = await db
    .select()
    .from(eventsTable)
    .orderBy(asc(eventsTable.eventTime));

  response.json(events.map(serializeEvent));
});

communityRouter.get('/events/claims/me', async (_request, response) => {
  const member = await requireMemberByClerkId(
    response.locals.userId as string,
  );

  const rows = await db
    .select({ claim: eventClaimsTable, eventName: eventsTable.name })
    .from(eventClaimsTable)
    .innerJoin(eventsTable, eq(eventClaimsTable.eventId, eventsTable.id))
    .where(eq(eventClaimsTable.memberId, member.id))
    .orderBy(desc(eventClaimsTable.submittedAt))
    .limit(50);

  response.json(
    rows.map((row) => serializeClaim(row.claim, member, row.eventName)),
  );
});

communityRouter.post('/events/claims', async (request, response) => {
  const body = SubmitEventClaimBody.parse(request.body);
  const member = await requireMemberByClerkId(
    response.locals.userId as string,
  );

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, body.eventId))
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
    minutesApart(kstMinutes(), eventMinutes) > config.eventClaimWindowMinutes
  ) {
    throw new HttpError(
      409,
      `이벤트 시각 전후 ${config.eventClaimWindowMinutes}분 이내에만 신청할 수 있습니다.`,
    );
  }

  const eventDate = kstDate();

  try {
    const [created] = await db
      .insert(eventClaimsTable)
      .values({
        memberId: member.id,
        eventId: event.id,
        slot: event.slot,
        eventDate,
        submittedPhrase: requireNonEmptyText(body.phrase, '참여 문구'),
        status: 'pending',
      })
      .returning();

    response
      .status(201)
      .json(serializeClaim(created, member, event.name));
  } catch (error) {
    if (
      isUniqueViolation(error, 'event_claims_member_event_date_unique')
    ) {
      throw new HttpError(409, '이미 오늘 이 이벤트에 참여 신청했습니다.');
    }
    throw error;
  }
});
