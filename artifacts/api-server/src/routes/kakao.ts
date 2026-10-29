import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { createBotReply } from '../bot/engine';
import { readUtterance, toKakaoResponse } from '../bot/kakao';
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
kakaoRouter.post('/webhooks/kakao', (request, response) => {
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

  const utterance = readUtterance(request.body);
  const reply = createBotReply(utterance, config.publicAppUrl);

  response.status(200).json(toKakaoResponse(reply));
});
