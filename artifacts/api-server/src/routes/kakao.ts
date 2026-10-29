import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { handleBotMessage } from '../bot/handler';
import { readBotUserKey, readUtterance, toKakaoResponse } from '../bot/kakao';
import { config } from '../config';

const secretMatches = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

export const kakaoRouter: Router = Router();

/**
 * Kakao Open Builder skill server endpoint.
 *
 * Register this URL in the skill settings:
 *   POST https://<public-domain>/api/webhooks/kakao
 *
 * If KAKAO_SKILL_SECRET is set, configure the same value as the
 * `x-kakao-skill-secret` header in the Open Builder skill settings (or append
 * it as `?secret=...` to the URL).
 */
kakaoRouter.post('/webhooks/kakao', async (request, response) => {
  if (config.kakaoSkillSecret) {
    const querySecret =
      typeof request.query.secret === 'string' ? request.query.secret : '';
    const headerSecret =
      request.header('x-kakao-skill-secret') ??
      request.header('x-api-key') ??
      '';

    if (
      !secretMatches(querySecret || headerSecret, config.kakaoSkillSecret)
    ) {
      response.status(401).json({ error: 'Invalid skill secret' });
      return;
    }
  }

  try {
    const reply = await handleBotMessage({
      utterance: readUtterance(request.body),
      botUserKey: readBotUserKey(request.body),
      appUrl: config.publicAppUrl,
    });

    response.status(200).json(toKakaoResponse(reply));
  } catch (error) {
    // Kakao treats non-2xx responses as a skill failure, so answer with a
    // readable fallback and keep the details in the server log.
    request.log.error({ err: error }, 'Kakao skill handling failed');
    response.status(200).json(
      toKakaoResponse({
        text: '지금은 요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
      }),
    );
  }
});
