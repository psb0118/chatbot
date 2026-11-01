import type { IncomingMessage } from 'node:http';

import { clerkMiddleware } from '@clerk/express';
import { closePool, isDatabaseConfigured } from '@workspace/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { config } from './config';
import { errorHandler } from './lib/errors';
import { adminRouter } from './routes/admin';
import { bridgeRouter } from './routes/bridge';
import { communityRouter } from './routes/community';
import { kakaoRouter } from './routes/kakao';
import { membersRouter } from './routes/members';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * The bridge and skill secrets travel in the query string, so a raw request log
 * would print them. Keep the method and path, hide the value.
 */
const redactSecret = (url: string | undefined): string | undefined =>
  url?.replace(/([?&]secret=)[^&]*/g, '$1redacted');

const requestSerializer = (
  request: IncomingMessage,
): Record<string, unknown> => ({
  method: request.method,
  url: redactSecret(request.url),
});

const app = express();

app.disable('x-powered-by');
app.use(pinoHttp({ logger, serializers: { req: requestSerializer } }));


if (config.corsOrigins.length > 0) {
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health stays unauthenticated so deployments can probe it before Clerk or a
// database is configured. Importing @workspace/db no longer connects eagerly.
app.get('/api/healthz', (_request, response) => {
  response.json({ status: 'ok' });
});

if (!isDatabaseConfigured()) {
  logger.warn(
    'DATABASE_URL is not set. Data routes and Kakao attendance will fail until it is configured.',
  );
}

// Kakao Open Builder and device bots call this server-to-server, before any
// Clerk session.
app.use('/api', kakaoRouter);
app.use('/api', bridgeRouter);

if (!config.kakaoSkillSecret) {
  logger.warn(
    'KAKAO_SKILL_SECRET is not set. The Kakao webhook accepts unauthenticated requests.',
  );
}

if (!config.deviceBridgeSecret) {
  logger.warn(
    'DEVICE_BRIDGE_SECRET is not set. /api/bridge/kakao stays disabled.',
  );
}

const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
);

if (clerkConfigured) {
  app.use('/api', clerkMiddleware());
} else {
  logger.warn(
    'Clerk keys are not set. Authenticated routes will return 503 until CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are configured.',
  );
  app.use('/api', (_request, response) => {
    response.status(503).json({
      error:
        'Clerk 인증이 설정되지 않았습니다. CLERK_SECRET_KEY와 CLERK_PUBLISHABLE_KEY를 설정해 주세요.',
    });
  });
}

app.use('/api', membersRouter);
app.use('/api', communityRouter);
app.use('/api', adminRouter);

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' });
});

app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`API server listening on http://0.0.0.0:${config.port}`);
});

const shutdown = (): void => {
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
