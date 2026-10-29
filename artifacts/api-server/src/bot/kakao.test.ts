import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  readBotUserKey,
  readUtterance,
  toKakaoResponse,
} from './kakao';
import type { BotQuickReply } from './types';

test('readUtterance tolerates missing payloads', () => {
  assert.equal(readUtterance(undefined), '');
  assert.equal(readUtterance(null), '');
  assert.equal(readUtterance({}), '');
  assert.equal(readUtterance({ userRequest: { utterance: '출석' } }), '출석');
});

test('readBotUserKey reads userRequest.user.id', () => {
  assert.equal(readBotUserKey({}), null);
  assert.equal(readBotUserKey({ userRequest: { user: {} } }), null);
  assert.equal(
    readBotUserKey({ userRequest: { user: { id: '  bot-user-1  ' } } }),
    'bot-user-1',
  );
});

test('response follows the Open Builder v2.0 shape', () => {
  const response = toKakaoResponse({ text: '안녕하세요' });

  assert.deepEqual(response, {
    version: '2.0',
    template: { outputs: [{ simpleText: { text: '안녕하세요' } }] },
  });
});

test('text is truncated to 1000 characters', () => {
  const response = toKakaoResponse({ text: 'a'.repeat(1500) });
  assert.equal(response.template.outputs[0].simpleText.text.length, 1000);
});

test('quick replies are capped at 10', () => {
  const quickReplies: BotQuickReply[] = Array.from({ length: 15 }, (_, i) => ({
    label: `버튼 ${i}`,
    action: 'message',
    messageText: `메시지 ${i}`,
  }));

  const response = toKakaoResponse({ text: '버튼', quickReplies });
  assert.equal(response.template.quickReplies?.length, 10);
});

test('empty quick replies are omitted entirely', () => {
  const response = toKakaoResponse({ text: '버튼', quickReplies: [] });
  assert.equal('quickReplies' in response.template, false);
});
