import {
  CreateAdminEventBody,
  ListAdminAttendanceQueryParams,
  ListAdminEventClaimsQueryParams,
  ListAdminMembersQueryParams,
  ReviewAdminEventClaimBody,
  UpdateAdminEventBody,
  UpdateAdminMemberBody,
} from '@workspace/api-zod';
import {
  adminLogsTable,
  attendanceTable,
  db,
  eventClaimsTable,
  eventsTable,
  experienceEntriesTable,
  membersTable,
} from '@workspace/db';
import { asc, desc, eq, ilike, or } from 'drizzle-orm';
import { Router } from 'express';

import {
  HttpError,
  isUniqueViolation,
  requireNonEmptyText,
} from '../lib/errors';
import { addExperience } from '../lib/progression';
import {
  serializeAdminLog,
  serializeAttendance,
  serializeClaim,
  serializeEvent,
  serializeExperience,
  serializeMember,
} from '../lib/serializers';
import { requireAdmin } from '../middleware/auth';

const parseId = (value: string): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, '잘못된 ID입니다.');
  }
  return id;
};

export const adminRouter: Router = Router();

adminRouter.use(requireAdmin);

adminRouter.get('/admin/members', async (request, response) => {
  const { search } = ListAdminMembersQueryParams.parse(request.query);

  const filter = search
    ? or(
        ilike(membersTable.displayName, `%${search}%`),
        ilike(membersTable.memberNumber, `%${search}%`),
        ilike(membersTable.openChatNickname, `%${search}%`),
      )
    : undefined;

  const members = await db
    .select()
    .from(membersTable)
    .where(filter)
    .orderBy(desc(membersTable.joinedAt))
    .limit(200);

  response.json(members.map(serializeMember));
});

adminRouter.patch('/admin/members/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const body = UpdateAdminMemberBody.parse(request.body);
  const actorUserId = response.locals.userId as string;

  try {
    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, id))
        .limit(1);

      if (!existing) {
        throw new HttpError(404, '멤버를 찾을 수 없습니다.');
      }

      const [row] = await tx
        .update(membersTable)
        .set({
          displayName: requireNonEmptyText(body.displayName, '표시 이름'),
          openChatNickname: body.openChatNickname?.trim() || null,
          linkStatus: body.linkStatus,
          status: body.status,
        })
        .where(eq(membersTable.id, id))
        .returning();

      await tx.insert(adminLogsTable).values({
        actorUserId,
        action: 'member.updated',
        target: row.memberNumber,
        details: JSON.stringify({
          displayName: row.displayName,
          openChatNickname: row.openChatNickname,
          linkStatus: row.linkStatus,
          status: row.status,
        }),
      });

      return row;
    });

    response.json(serializeMember(updated));
  } catch (error) {
    if (isUniqueViolation(error, 'members_open_chat_nickname_unique')) {
      throw new HttpError(409, '이미 사용 중인 오픈채팅 닉네임입니다.');
    }
    throw error;
  }
});

adminRouter.get('/admin/members/:id/history', async (request, response) => {
  const id = parseId(request.params.id);

  const [member] = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.id, id))
    .limit(1);

  if (!member) {
    throw new HttpError(404, '멤버를 찾을 수 없습니다.');
  }

  const attendance = await db
    .select({ record: attendanceTable })
    .from(attendanceTable)
    .where(eq(attendanceTable.memberId, id))
    .orderBy(desc(attendanceTable.attendanceDate))
    .limit(100);

  const experience = await db
    .select()
    .from(experienceEntriesTable)
    .where(eq(experienceEntriesTable.memberId, id))
    .orderBy(desc(experienceEntriesTable.createdAt))
    .limit(100);

  const claims = await db
    .select({ claim: eventClaimsTable, eventName: eventsTable.name })
    .from(eventClaimsTable)
    .innerJoin(eventsTable, eq(eventClaimsTable.eventId, eventsTable.id))
    .where(eq(eventClaimsTable.memberId, id))
    .orderBy(desc(eventClaimsTable.submittedAt))
    .limit(100);

  response.json({
    attendance: attendance.map((row) =>
      serializeAttendance(row.record, member),
    ),
    experience: experience.map(serializeExperience),
    eventClaims: claims.map((row) =>
      serializeClaim(row.claim, member, row.eventName),
    ),
  });
});

adminRouter.get('/admin/attendance', async (request, response) => {
  const { date } = ListAdminAttendanceQueryParams.parse(request.query);

  if (date && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) {
    throw new HttpError(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  }

  const rows = await db
    .select({
      record: attendanceTable,
      memberNumber: membersTable.memberNumber,
      displayName: membersTable.displayName,
    })
    .from(attendanceTable)
    .innerJoin(membersTable, eq(attendanceTable.memberId, membersTable.id))
    .where(date ? eq(attendanceTable.attendanceDate, date) : undefined)
    .orderBy(
      desc(attendanceTable.attendanceDate),
      desc(attendanceTable.createdAt),
    )
    .limit(200);

  response.json(
    rows.map((row) =>
      serializeAttendance(row.record, {
        memberNumber: row.memberNumber,
        displayName: row.displayName,
      }),
    ),
  );
});

adminRouter.post('/admin/events', async (request, response) => {
  const body = CreateAdminEventBody.parse(request.body);
  const actorUserId = response.locals.userId as string;

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(eventsTable)
        .values({
          name: requireNonEmptyText(body.name, '이벤트 이름'),
          slot: body.slot,
          acceptedPhrase: requireNonEmptyText(
            body.acceptedPhrase,
            '참여 문구',
          ),
          eventTime: body.eventTime,
          rewardExp: body.rewardExp,
          active: body.active,
        })
        .returning();

      await tx.insert(adminLogsTable).values({
        actorUserId,
        action: 'event.created',
        target: `event:${row.id}`,
        details: `${row.name} (${row.slot})`,
      });

      return row;
    });

    response.status(201).json(serializeEvent(created));
  } catch (error) {
    if (isUniqueViolation(error, 'events_slot_unique')) {
      throw new HttpError(409, '이미 해당 시간대에 등록된 이벤트가 있습니다.');
    }
    throw error;
  }
});

adminRouter.patch('/admin/events/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const body = UpdateAdminEventBody.parse(request.body);
  const actorUserId = response.locals.userId as string;

  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(eventsTable)
        .set({
          name: requireNonEmptyText(body.name, '이벤트 이름'),
          slot: body.slot,
          acceptedPhrase: requireNonEmptyText(
            body.acceptedPhrase,
            '참여 문구',
          ),
          eventTime: body.eventTime,
          rewardExp: body.rewardExp,
          active: body.active,
        })
        .where(eq(eventsTable.id, id))
        .returning();

      if (!row) {
        throw new HttpError(404, '이벤트를 찾을 수 없습니다.');
      }

      await tx.insert(adminLogsTable).values({
        actorUserId,
        action: 'event.updated',
        target: `event:${row.id}`,
        details: `${row.name} (${row.slot})`,
      });

      return row;
    });

    response.json(serializeEvent(updated));
  } catch (error) {
    if (isUniqueViolation(error, 'events_slot_unique')) {
      throw new HttpError(409, '이미 해당 시간대에 등록된 이벤트가 있습니다.');
    }
    throw error;
  }
});

adminRouter.get('/admin/event-claims', async (request, response) => {
  const { status } = ListAdminEventClaimsQueryParams.parse(request.query);
  const wantedStatus = status ?? 'pending';

  const rows = await db
    .select({
      claim: eventClaimsTable,
      memberNumber: membersTable.memberNumber,
      displayName: membersTable.displayName,
      eventName: eventsTable.name,
    })
    .from(eventClaimsTable)
    .innerJoin(membersTable, eq(eventClaimsTable.memberId, membersTable.id))
    .innerJoin(eventsTable, eq(eventClaimsTable.eventId, eventsTable.id))
    .where(eq(eventClaimsTable.status, wantedStatus))
    .orderBy(asc(eventClaimsTable.submittedAt))
    .limit(200);

  response.json(
    rows.map((row) =>
      serializeClaim(
        row.claim,
        {
          memberNumber: row.memberNumber,
          displayName: row.displayName,
        },
        row.eventName,
      ),
    ),
  );
});

adminRouter.post(
  '/admin/event-claims/:id/review',
  async (request, response) => {
    const id = parseId(request.params.id);
    const body = ReviewAdminEventClaimBody.parse(request.body);
    const actorUserId = response.locals.userId as string;

    const reviewed = await db.transaction(async (tx) => {
      const [claim] = await tx
        .select()
        .from(eventClaimsTable)
        .where(eq(eventClaimsTable.id, id))
        .for('update')
        .limit(1);

      if (!claim) {
        throw new HttpError(404, '참여 신청을 찾을 수 없습니다.');
      }

      if (claim.status !== 'pending') {
        throw new HttpError(409, '이미 검토된 신청입니다.');
      }

      const [member] = await tx
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, claim.memberId))
        .limit(1);

      if (!member) {
        throw new HttpError(404, '멤버를 찾을 수 없습니다.');
      }

      const [event] = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.id, claim.eventId))
        .limit(1);

      if (!event) {
        throw new HttpError(404, '이벤트를 찾을 수 없습니다.');
      }

      const [updated] = await tx
        .update(eventClaimsTable)
        .set({
          status: body.decision,
          reviewedAt: new Date(),
          reviewedBy: actorUserId,
          reviewNote: body.note.trim() || null,
        })
        .where(eq(eventClaimsTable.id, id))
        .returning();

      if (body.decision === 'approved') {
        try {
          await tx.insert(experienceEntriesTable).values({
            memberId: member.id,
            amount: event.rewardExp,
            reason: `${event.name} 참여 승인`,
            sourceType: 'event_claim',
            sourceId: String(claim.id),
          });

          const progression = addExperience(member, event.rewardExp);
          await tx
            .update(membersTable)
            .set({
              level: progression.level,
              exp: progression.exp,
              totalExp: progression.totalExp,
            })
            .where(eq(membersTable.id, member.id));
        } catch (error) {
          if (
            !isUniqueViolation(error, 'experience_member_source_unique')
          ) {
            throw error;
          }
        }
      }

      await tx.insert(adminLogsTable).values({
        actorUserId,
        action: 'event_claim.reviewed',
        target: `claim:${claim.id}`,
        details: `${body.decision}${body.note.trim() ? ` - ${body.note.trim()}` : ''}`,
      });

      return { claim: updated, member, eventName: event.name };
    });

    response.json(
      serializeClaim(reviewed.claim, reviewed.member, reviewed.eventName),
    );
  },
);

adminRouter.get('/admin/logs', async (_request, response) => {
  const logs = await db
    .select()
    .from(adminLogsTable)
    .orderBy(desc(adminLogsTable.createdAt))
    .limit(100);

  response.json(logs.map(serializeAdminLog));
});
