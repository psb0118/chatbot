import { SubmitEventClaimBody } from '@workspace/api-zod';
import {
  and,
  asc,
  attendanceTable,
  db,
  desc,
  eq,
  eventClaimsTable,
  eventsTable,
  membersTable,
  sql,
} from '@workspace/db';
import { Router } from 'express';

import { recordAttendance } from '../lib/attendance';
import { submitEventClaim } from '../lib/event-claims';
import {
  findMemberByClerkId,
  listTopMembers,
  requireMemberByClerkId,
} from '../lib/members';
import {
  serializeAttendance,
  serializeClaim,
  serializeEvent,
  serializeMember,
} from '../lib/serializers';
import { kstDate } from '../lib/time';
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
    kakaoIntegration: member?.kakaoUserKey ? 'linked' : 'available',
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
  const member = await requireMemberByClerkId(
    response.locals.userId as string,
  );
  const result = await recordAttendance(db, member.id);

  response.json({
    claimed: true,
    expGranted: result.expGranted,
    attendanceDate: result.attendanceDate,
    member: serializeMember(result.member),
  });
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

  const result = await submitEventClaim(
    db,
    member.id,
    body.eventId,
    body.phrase,
  );

  response
    .status(201)
    .json(serializeClaim(result.claim, member, result.eventName));
});
