import type { BotQuickReply } from './types';

/**
 * Editable auto-reply rules. Rules are checked before the built-in commands,
 * in array order, and the first matching keyword wins.
 *
 * `contains` matches anywhere in the normalized utterance, while `exact`
 * requires the whole utterance to match one of the keywords.
 */
export interface BotRule {
  keywords: string[];
  reply: string;
  match?: 'contains' | 'exact';
  quickReplies?: BotQuickReply[];
}

export const botRules: BotRule[] = [
  {
    keywords: ['경험치', 'exp', '레벨'],
    reply:
      '경험치는 출석 1회당 +50 EXP, 이벤트 참여가 승인되면 이벤트별 보상 EXP가 지급돼요. 누적 EXP 100마다 레벨이 올라갑니다.',
  },
  {
    keywords: ['등급', '티어', 'tier'],
    reply:
      '등급은 누적 EXP에 따라 Sprout → Bloom → Blossom → Flover → Star → Moon 순서로 올라가요.',
  },
  {
    keywords: ['오픈채팅', '닉네임', '연동'],
    reply:
      '카톡에서 "!가입"을 입력하면 가입과 동시에 카카오 계정이 멤버에 연결되고, 계속 쓸 수 있는 6자리 연동 코드가 발급돼요. 다른 기기나 계정에서 다시 연결할 때는 "!연동 <코드>"를 보내 주세요.',
  },
  {
    keywords: ['문의', '운영진', '관리자'],
    reply: '자세한 문의는 운영진에게 DM으로 남겨 주세요. 확인 후 순차적으로 답변드릴게요.',
  },
];
