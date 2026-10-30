import { db, isDatabaseConfigured } from '@workspace/db';
import { Router, type RequestHandler } from 'express';

import { handleDeviceMessage } from '../bot/device-bridge';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { secretMatches } from '../lib/secrets';

/**
 * Bridge for device-side bots (MessengerBot R and similar).
 *
 * Those apps read a chat room's notifications and send whatever text this
 * endpoint returns, so the answer is plain text instead of the Kakao skill
 * envelope. The endpoint stays disabled until DEVICE_BRIDGE_SECRET is set,
 * because it can create members and record attendance without a Clerk session.
 */
export const bridgeRouter: Router = Router();

const bridgeHandler: RequestHandler = async (request, response) => {
  if (!config.deviceBridgeSecret) {
    response.status(503).json({
      error:
        '기기 브리지가 설정되지 않았습니다. DEVICE_BRIDGE_SECRET을 설정해 주세요.',
    });
    return;
  }

  const querySecret =
    typeof request.query.secret === 'string' ? request.query.secret : '';
  const headerSecret = request.header('x-bridge-secret') ?? '';

  if (!secretMatches(querySecret || headerSecret, config.deviceBridgeSecret)) {
    response.status(401).json({ error: 'Invalid bridge secret' });
    return;
  }

  const source: Record<string, unknown> =
    request.method === 'GET'
      ? (request.query as Record<string, unknown>)
      : ((request.body ?? {}) as Record<string, unknown>);

  try {
    const text = await handleDeviceMessage(
      { room: source.room, sender: source.sender, text: source.text },
      isDatabaseConfigured() ? db : null,
      { appUrl: config.publicAppUrl },
    );

    response.type('text/plain; charset=utf-8').send(text);
  } catch (error) {
    if (error instanceof HttpError) {
      response
        .status(error.status)
        .type('text/plain; charset=utf-8')
        .send(error.message);
      return;
    }

    request.log.error({ err: error }, 'Device bridge handling failed');
    response
      .status(500)
      .type('text/plain; charset=utf-8')
      .send('지금은 요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
};

bridgeRouter.get('/bridge/kakao', bridgeHandler);
bridgeRouter.post('/bridge/kakao', bridgeHandler);
