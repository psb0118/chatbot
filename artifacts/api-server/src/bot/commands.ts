import { compact, messageQuickReply, webLink } from './replies';
import type { BotReply } from './types';

/** Commands the bot understands. Every one also works with a leading `!`. */
export const commandGuide = (appUrl: string | undefined): BotReply => ({
  text: [
    '플로버 봇 사용법을 안내해 드릴게요. 앞에 !를 붙여도 똑같이 동작해요.',
    '• !가입 — 가입하고 연동 코드 받기',
    '• !출석 — 오늘 출석 기록 (+50 EXP)',
    '• !내정보 — 내 레벨과 EXP',
    '• !랭킹 — 상위 멤버 순위 (웹에서 보기)',
    '• !이벤트 — 진행 중인 이벤트 목록',
    '• !이벤트참여 <번호> <문구> — 참여 신청',
    '• !연동 <코드> — 다른 기기·계정 연결',
    '• !연동해제 — 연결 해제',
    '• !사용법 — 이 목록',
    '궁금한 단어를 그대로 입력해 주세요.',
  ].join('\n'),
  quickReplies: compact([
    messageQuickReply('!출석', '!출석'),
    messageQuickReply('!내정보', '!내정보'),
    messageQuickReply('!이벤트', '!이벤트'),
    webLink('웹에서 열기', appUrl, '/dashboard'),
  ]),
});
