import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBotReply } from './engine';

test('empty input greets the user', () => {
  assert.match(createBotReply('', 'https://app.test').text, /안녕하세요/);
  assert.match(createBotReply('   ', 'https://app.test').text, /안녕하세요/);
});

test('latin keywords respect word boundaries', () => {
  assert.doesNotMatch(createBotReply('this', 'https://app.test').text, /경험치/);
  assert.doesNotMatch(
    createBotReply('expedition', 'https://app.test').text,
    /경험치/,
  );
  assert.match(createBotReply('exp', 'https://app.test').text, /경험치/);
  assert.match(createBotReply('EXP 알려줘', 'https://app.test').text, /경험치/);
});

test('korean FAQ rules answer before built-in commands', () => {
  assert.match(createBotReply('등급 알려줘', 'https://app.test').text, /Sprout/);
  assert.match(createBotReply('문의할 곳', 'https://app.test').text, /운영진/);
});

test('known commands include quick replies and web links', () => {
  const attendance = createBotReply('출석', 'https://app.test');
  assert.match(attendance.text, /출석/);
  assert.equal(
    attendance.quickReplies?.[0]?.action === 'webLink'
      ? attendance.quickReplies[0].webLinkUrl
      : null,
    'https://app.test/attendance',
  );

  const help = createBotReply('도움말', 'https://app.test');
  assert.ok((help.quickReplies?.length ?? 0) >= 3);
});

test('missing app URL omits webLink buttons', () => {
  const reply = createBotReply('출석', undefined);
  assert.ok(reply.quickReplies?.every((item) => item.action === 'message'));
});

test('unknown text falls back to help', () => {
  assert.match(
    createBotReply('완전히 모르는 질문', 'https://app.test').text,
    /이해하지 못했어요/,
  );
});

test('greetings are recognised in Korean and English', () => {
  for (const greeting of ['안녕', '하이', 'hello', 'hi']) {
    assert.match(
      createBotReply(greeting, 'https://app.test').text,
      /안녕하세요/,
      greeting,
    );
  }
});
