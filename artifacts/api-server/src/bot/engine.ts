import { compact, messageQuickReply, webLink } from './replies';
import { botRules } from './rules';
import type { BotReply } from './types';

const normalize = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isLatinToken = (value: string): boolean => /^[a-z0-9]+$/.test(value);

const keywordMatches = (
  utterance: string,
  keyword: string,
  match: 'contains' | 'exact' = 'contains',
): boolean => {
  const normalizedKeyword = normalize(keyword);

  if (match === 'exact') {
    return utterance === normalizedKeyword;
  }

  // Latin keywords use word boundaries so "hi" does not match "this" and
  // "exp" does not match "expedition". Korean keywords use substring matching.
  if (isLatinToken(normalizedKeyword)) {
    return new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}([^a-z0-9]|$)`,
    ).test(utterance);
  }

  return utterance.includes(normalizedKeyword);
};

const includesAny = (utterance: string, keywords: string[]): boolean =>
  keywords.some((keyword) => keywordMatches(utterance, keyword));

const matchesRule = (
  utterance: string,
  rule: (typeof botRules)[number],
): boolean =>
  rule.keywords.some((keyword) =>
    keywordMatches(utterance, keyword, rule.match ?? 'contains'),
  );

const helpReply = (appUrl: string | undefined): BotReply => ({
  text: [
    '플로버 봇 사용법을 안내해 드릴게요.',
    '• 출석 — 오늘 출석 기록 (연동 후)',
    '• 내정보 — 내 레벨과 EXP',
    '• 이벤트 — 진행 중인 이벤트 목록',
    '• 이벤트참여 <번호> <문구> — 참여 신청',
    '• 연동 <코드> — 카카오 계정 연결',
    '• 랭킹 — 상위 멤버 보기',
    '궁금한 단어를 그대로 입력해 주세요.',
  ].join('\n'),
  quickReplies: compact([
    messageQuickReply('출석', '출석'),
    messageQuickReply('내정보', '내정보'),
    messageQuickReply('이벤트', '이벤트'),
    webLink('웹에서 열기', appUrl, '/dashboard'),
  ]),
});

const attendanceReply = (appUrl: string | undefined): BotReply => ({
  text: '출석은 플로버 웹에서 하루 한 번 기록할 수 있어요. 한국 시간 기준으로 자정에 초기화되고, 하루 +50 EXP가 지급됩니다.',
  quickReplies: compact([
    webLink('출석하러 가기', appUrl, '/attendance'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const eventsReply = (appUrl: string | undefined): BotReply => ({
  text: '진행 중인 이벤트는 웹의 이벤트 페이지에서 확인할 수 있어요. 참여 문구를 제출하면 관리자가 확인한 뒤 승인하거나 반려합니다.',
  quickReplies: compact([
    webLink('이벤트 보기', appUrl, '/events'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const rankingReply = (appUrl: string | undefined): BotReply => ({
  text: '누적 EXP 기준 상위 10명의 랭킹은 웹에서 확인할 수 있어요.',
  quickReplies: compact([
    webLink('랭킹 보기', appUrl, '/leaderboard'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const registerReply = (appUrl: string | undefined): BotReply => ({
  text: '웹에서 로그인한 뒤 표시 이름과 오픈채팅 닉네임을 등록해 주세요. 관리자가 닉네임을 확인하면 연동이 완료됩니다.',
  quickReplies: compact([
    webLink('멤버 등록', appUrl, '/register'),
    messageQuickReply('도움말', '도움말'),
  ]),
});

const greetingReply = (appUrl: string | undefined): BotReply => ({
  text: '안녕하세요, 플로버 봇이에요! 궁금한 점을 편하게 남겨 주세요. "도움말"을 입력하면 안내 메뉴를 보여드릴게요.',
  quickReplies: compact([
    messageQuickReply('도움말', '도움말'),
    messageQuickReply('출석', '출석'),
    messageQuickReply('이벤트', '이벤트'),
  ]),
});

const fallbackReply = (appUrl: string | undefined): BotReply => ({
  text: '질문을 이해하지 못했어요. "도움말"을 입력하시면 안내 메뉴를 보여드릴게요.',
  quickReplies: compact([
    messageQuickReply('도움말', '도움말'),
    messageQuickReply('출석', '출석'),
    messageQuickReply('이벤트', '이벤트'),
    webLink('웹에서 열기', appUrl, '/dashboard'),
  ]),
});

export const createBotReply = (
  utterance: string,
  appUrl?: string,
): BotReply => {
  const normalized = normalize(utterance);

  if (!normalized) {
    return greetingReply(appUrl);
  }

  for (const rule of botRules) {
    if (matchesRule(normalized, rule)) {
      return { text: rule.reply, quickReplies: rule.quickReplies };
    }
  }

  if (includesAny(normalized, ['도움말', '메뉴', '사용법', '기능'])) {
    return helpReply(appUrl);
  }

  if (includesAny(normalized, ['출석', '체크인'])) {
    return attendanceReply(appUrl);
  }

  if (includesAny(normalized, ['이벤트', '참여'])) {
    return eventsReply(appUrl);
  }

  if (includesAny(normalized, ['랭킹', '순위'])) {
    return rankingReply(appUrl);
  }

  if (includesAny(normalized, ['멤버 등록', '가입', '등록'])) {
    return registerReply(appUrl);
  }

  if (includesAny(normalized, ['안녕', '하이', '반가', 'hello', 'hi'])) {
    return greetingReply(appUrl);
  }

  return fallbackReply(appUrl);
};
