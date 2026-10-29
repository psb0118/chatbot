import type {
  AdminLog,
  Attendance,
  EventClaim,
  ExperienceEntry,
  Member,
  ScheduledEvent,
} from '@workspace/db';

import { tierForLevel } from './progression';

type MemberIdentity = Pick<Member, 'memberNumber' | 'displayName'>;

export const serializeMember = (member: Member) => ({
  id: member.id,
  memberNumber: member.memberNumber,
  displayName: member.displayName,
  openChatNickname: member.openChatNickname,
  linkStatus: member.linkStatus,
  level: member.level,
  exp: member.exp,
  totalExp: member.totalExp,
  tier: tierForLevel(member.level),
  status: member.status,
  joinedAt: member.joinedAt,
});

export const serializeRanking = (member: Member, rank: number) => ({
  memberNumber: member.memberNumber,
  displayName: member.displayName,
  level: member.level,
  exp: member.exp,
  totalExp: member.totalExp,
  tier: tierForLevel(member.level),
  rank,
});

export const serializeAttendance = (
  record: Attendance,
  member: MemberIdentity,
) => ({
  id: record.id,
  memberNumber: member.memberNumber,
  displayName: member.displayName,
  attendanceDate: record.attendanceDate,
  expGranted: record.expGranted,
  createdAt: record.createdAt,
});

export const serializeEvent = (event: ScheduledEvent) => ({
  id: event.id,
  name: event.name,
  slot: event.slot,
  acceptedPhrase: event.acceptedPhrase,
  eventTime: event.eventTime.slice(0, 5),
  rewardExp: event.rewardExp,
  active: event.active,
});

export const serializeClaim = (
  claim: EventClaim,
  member: MemberIdentity,
  eventName: string,
) => ({
  id: claim.id,
  memberNumber: member.memberNumber,
  displayName: member.displayName,
  eventId: claim.eventId,
  eventName,
  slot: claim.slot,
  eventDate: claim.eventDate,
  submittedPhrase: claim.submittedPhrase,
  status: claim.status,
  submittedAt: claim.submittedAt,
  reviewNote: claim.reviewNote,
});

export const serializeExperience = (entry: ExperienceEntry) => ({
  id: entry.id,
  amount: entry.amount,
  reason: entry.reason,
  createdAt: entry.createdAt,
});

export const serializeAdminLog = (log: AdminLog) => ({
  id: log.id,
  actor: log.actorUserId,
  action: log.action,
  target: log.target,
  details: log.details,
  createdAt: log.createdAt,
});
