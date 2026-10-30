import {
  asc,
  db,
  eq,
  eventsTable,
  isDatabaseConfigured,
  type AppDatabase,
} from '@workspace/db';

import { recordAttendance } from '../lib/attendance';
import { submitEventClaim } from '../lib/event-claims';
import { HttpError } from '../lib/errors';
import {
  findMemberByKakaoUserKey,
  redeemLinkCode,
  registerKakaoMember,
  unlinkKakaoAccount,
} from '../lib/kakao-link';
import { tierForLevel } from '../lib/progression';
import { commandGuide } from './commands';
import { createBotReply } from './engine';
import { compact, messageQuickReply, webLink } from './replies';
import type { BotReply } from './types';

const normalize = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Strips a leading `!` (or full-width `！`) so every command works with and
 * without the prefix: `!출석` and `출석` reach the same branch.
 */
const stripCommandPrefix = (value: string): string =>
  value.replace(/^[!！]\s*/, '');

const USAGE_COMMAND = /^(사용법|명령어|명령어 ?목록|help)$/;
const JOIN_COMMAND = /^가입$/;
const LINK_COMMAND = /^연동\s*(.*)$/;
const UNLINK_COMMAND = /^(연동 ?해제|카카오 ?연동 ?해제)$/;
const MY_INFO_COMMAND = /^(내 ?정보|내정보|프로필)$/;
const ATTENDANCE_COMMAND = /^(출석|출석 ?체크|체크인)$/;
const EVENT_LIST_COMMAND = /^(이벤트|이벤트 ?목록)$/;
const EVENT_CLAIM_COMMAND = /^이벤트 ?참여\s+(\d+)\s+(.+)$/;

const linkGuide = (appUrl: string | undefined): BotReply => ({
  text: '카카오 연동이 필요해요. 채팅에서 "!가입"을 입력하면 가입과 동시에 연동 코드를 알려드려요. 이미 코드가 있다면 "연동 ABC234"처럼 보내 주세요. 코드는 계속 유효해요.',
  quickReplies: compact([
    messageQuickReply('!가입', '!가입'),
    webLink('웹 대시보드', appUrl, '/dashboard'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const noChatUserReply = (): BotReply => ({
  text: '카카오 사용자 정보를 확인할 수 없어요. 카카오톡 채널에서 다시 시도해 주세요.',
});

const databaseUnavailableReply = (appUrl: string | undefined): BotReply => ({
  text: '지금은 기록을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
  quickReplies: compact([
    webLink('웹에서 열기', appUrl, '/dashboard'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const memberStats = (member: {
  level: number;
  exp: number;
  totalExp: number;
}): string => {
  const tier = tierForLevel(member.level);
  return `Lv. ${member.level} · ${tier} · ${member.exp} EXP (누적 ${member.totalExp})`;
};

const eventListReply = async (
  database: AppDatabase,
  appUrl: string | undefined,
): Promise<BotReply> => {
  const events = await database
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.active, true))
    .orderBy(asc(eventsTable.eventTime))
    .limit(5);

  if (events.length === 0) {
    return {
      text: '지금은 등록된 이벤트가 없어요. 새 이벤트가 열리면 공지해 드릴게요.',
      quickReplies: compact([
        webLink('이벤트 페이지', appUrl, '/events'),
        messageQuickReply('도움말', '도움말'),
      ]),
    };
  }

  const lines = events.map(
    (event) =>
      `· ${event.id}번 ${event.name} — ${event.eventTime.slice(0, 5)}, +${event.rewardExp} EXP`,
  );

  return {
    text: [
      '진행 중인 이벤트예요.',
      ...lines,
      '',
      '참여하려면 "이벤트참여 <번호> <참여 문구>"를 보내 주세요.',
      '이벤트 시각 전후 5분 이내에만 신청할 수 있어요.',
    ].join('\n'),
    quickReplies: compact([
      webLink('이벤트 페이지', appUrl, '/events'),
      messageQuickReply('도움말', '도움말'),
    ]),
  };
};

export interface BotMessageContext {
  utterance: string;
  /** Kakao `userRequest.user.id`; null when the payload has no user. */
  botUserKey: string | null;
  /** Display name used when `!가입` creates the member. */
  displayName?: string;
  appUrl?: string;
  now?: Date;
}

/**
 * Handles one KakaoTalk utterance.
 *
 * Commands that need member state (linking, check-in, event claims) go through
 * the same services as the web routes. Everything else falls back to the static
 * rule engine, so the bot still answers before a database is configured.
 */
export const handleBotMessage = async (
  context: BotMessageContext,
  database: AppDatabase | null = isDatabaseConfigured() ? db : null,
): Promise<BotReply> => {
  const utterance = stripCommandPrefix(normalize(context.utterance));
  const appUrl = context.appUrl;
  const now = context.now ?? new Date();
  const botUserKey = context.botUserKey;

  if (!utterance) {
    return createBotReply(context.utterance, appUrl);
  }

  if (USAGE_COMMAND.test(utterance)) {
    return commandGuide(appUrl);
  }

  if (JOIN_COMMAND.test(utterance)) {
    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    const { member, code, created } = await registerKakaoMember(
      database,
      botUserKey,
      context.displayName,
    );

    return {
      text: [
        created ? '가입이 완료됐어요!' : '이미 가입되어 있어요.',
        `멤버 ${member.memberNumber} · ${member.displayName}`,
        memberStats(member),
        '',
        `연동 코드는 ${code} 예요. 이 코드는 계속 그대로 쓸 수 있어요.`,
        `다른 기기에서 다시 연결할 때는 "연동 ${code}"를 보내 주세요.`,
        '',
        '이제 "출석"을 입력하면 매일 출석이 기록돼요.',
      ].join('\n'),
      quickReplies: compact([
        messageQuickReply('출석', '출석'),
        messageQuickReply('내정보', '내정보'),
        webLink('내 홈', appUrl, '/dashboard'),
      ]),
    };
  }

  if (UNLINK_COMMAND.test(utterance)) {
    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    const member = await unlinkKakaoAccount(database, botUserKey);

    if (!member) {
      return {
        text: '이 카카오 계정에 연결된 멤버가 없어요.',
        quickReplies: compact([
          webLink('연동 코드 발급', appUrl, '/dashboard'),
          messageQuickReply('도움말', '도움말'),
        ]),
      };
    }

    return {
      text: [
        `카카오 연동을 해제했어요. (멤버 ${member.memberNumber} · ${member.displayName})`,
        member.kakaoLinkCode
          ? `다시 연결하려면 "연동 ${member.kakaoLinkCode}"를 보내 주세요.`
          : '다시 연결하려면 "!가입"을 입력해 주세요.',
      ].join('\n'),
      quickReplies: compact([
        webLink('내 홈', appUrl, '/dashboard'),
        messageQuickReply('도움말', '도움말'),
      ]),
    };
  }

  const linkMatch = LINK_COMMAND.exec(utterance);
  if (linkMatch) {
    const code = linkMatch[1].trim();

    if (!code) {
      return linkGuide(appUrl);
    }

    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    try {
      const member = await redeemLinkCode(database, code, botUserKey);

      return {
        text: [
          '카카오 연동이 완료됐어요!',
          `멤버 ${member.memberNumber} · ${member.displayName}`,
          memberStats(member),
          '',
          '이제 채팅에서 "출석"을 입력하면 매일 출석이 기록돼요.',
        ].join('\n'),
        quickReplies: compact([
          messageQuickReply('출석', '출석'),
          webLink('내 홈', appUrl, '/dashboard'),
        ]),
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          text: error.message,
          quickReplies: compact([
            webLink('연동 코드 발급', appUrl, '/dashboard'),
            messageQuickReply('도움말', '도움말'),
          ]),
        };
      }

      throw error;
    }
  }

  if (MY_INFO_COMMAND.test(utterance)) {
    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    const member = await findMemberByKakaoUserKey(database, botUserKey);

    if (!member) {
      return linkGuide(appUrl);
    }

    return {
      text: [
        `${member.displayName}님의 기록이에요.`,
        `멤버 번호 ${member.memberNumber}`,
        memberStats(member),
      ].join('\n'),
      quickReplies: compact([
        messageQuickReply('출석', '출석'),
        webLink('내 홈', appUrl, '/dashboard'),
      ]),
    };
  }

  if (ATTENDANCE_COMMAND.test(utterance)) {
    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    const member = await findMemberByKakaoUserKey(database, botUserKey);

    if (!member) {
      return linkGuide(appUrl);
    }

    try {
      const result = await recordAttendance(database, member.id, now);
      const levelUp =
        result.gainedLevels > 0
          ? `\n레벨 업! Lv. ${result.member.level} ${tierForLevel(result.member.level)}`
          : '';

      return {
        text: [
          `출석 완료! +${result.expGranted} EXP (${result.attendanceDate})`,
          memberStats(result.member) + levelUp,
        ].join('\n'),
        quickReplies: compact([
          messageQuickReply('내정보', '내정보'),
          webLink('출석 기록', appUrl, '/attendance'),
          messageQuickReply('랭킹', '랭킹'),
        ]),
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          text: error.message,
          quickReplies: compact([
            webLink('출석 기록', appUrl, '/attendance'),
            messageQuickReply('도움말', '도움말'),
          ]),
        };
      }

      throw error;
    }
  }

  if (EVENT_LIST_COMMAND.test(utterance)) {
    if (!database) {
      return createBotReply(utterance, appUrl);
    }

    return eventListReply(database, appUrl);
  }

  const claimMatch = EVENT_CLAIM_COMMAND.exec(utterance);
  if (claimMatch) {
    if (!botUserKey) {
      return noChatUserReply();
    }

    if (!database) {
      return databaseUnavailableReply(appUrl);
    }

    const member = await findMemberByKakaoUserKey(database, botUserKey);

    if (!member) {
      return linkGuide(appUrl);
    }

    try {
      const result = await submitEventClaim(
        database,
        member.id,
        Number(claimMatch[1]),
        claimMatch[2],
        now,
      );

      return {
        text: [
          '참여 신청이 접수됐어요.',
          `${result.eventName} · 검토 대기 중`,
          '운영진이 승인하면 보상 EXP가 지급돼요.',
        ].join('\n'),
        quickReplies: compact([
          webLink('내 신청 내역', appUrl, '/events'),
          messageQuickReply('도움말', '도움말'),
        ]),
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          text: error.message,
          quickReplies: compact([
            webLink('이벤트 페이지', appUrl, '/events'),
            messageQuickReply('이벤트', '이벤트'),
          ]),
        };
      }

      throw error;
    }
  }

  return createBotReply(utterance, appUrl);
};
