import type { BotQuickReply, BotReply } from './types';

/** Subset of the Open Builder skill payload that this server needs. */
export interface KakaoSkillPayload {
  userRequest?: {
    utterance?: string;
    lang?: string;
    timezone?: string;
    block?: { id?: string; name?: string };
    user?: {
      id?: string;
      type?: string;
      properties?: Record<string, unknown>;
    };
  };
  action?: {
    id?: string;
    name?: string;
    params?: Record<string, string>;
    detailParams?: Record<string, unknown>;
    clientExtra?: Record<string, unknown>;
  };
  bot?: { id?: string; name?: string };
  intent?: { id?: string; name?: string };
}

export interface KakaoSkillResponse {
  version: '2.0';
  template: {
    outputs: Array<{ simpleText: { text: string } }>;
    quickReplies?: BotQuickReply[];
  };
}

const MAX_TEXT_LENGTH = 1000;
const MAX_QUICK_REPLIES = 10;

export const readUtterance = (payload: unknown): string => {
  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const userRequest = (payload as KakaoSkillPayload).userRequest;
  return typeof userRequest?.utterance === 'string'
    ? userRequest.utterance
    : '';
};

/**
 * Stable Kakao user identifier (Open Builder `userRequest.user.id`).
 * This is the key stored on a member to link the chat account.
 */
export const readBotUserKey = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const user = (payload as KakaoSkillPayload).userRequest?.user;
  const id = typeof user?.id === 'string' ? user.id.trim() : '';
  return id.length > 0 ? id : null;
};

export const toKakaoResponse = (reply: BotReply): KakaoSkillResponse => {
  const text = reply.text.slice(0, MAX_TEXT_LENGTH);
  const quickReplies = reply.quickReplies?.slice(0, MAX_QUICK_REPLIES);

  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
      ...(quickReplies && quickReplies.length > 0 ? { quickReplies } : {}),
    },
  };
};
