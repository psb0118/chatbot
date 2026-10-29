import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const requireNonEmptyText = (
  value: string,
  label: string,
): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  }
  return trimmed;
};

interface PgErrorShape {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

const findPgError = (error: unknown): PgErrorShape | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const candidate = error as PgErrorShape;
  if (candidate.code) {
    return candidate;
  }
  if (candidate.cause) {
    return findPgError(candidate.cause);
  }
  return undefined;
};

/** True when the error is a PostgreSQL unique constraint violation. */
export const isUniqueViolation = (
  error: unknown,
  constraint?: string,
): boolean => {
  const pgError = findPgError(error);
  if (!pgError || pgError.code !== '23505') {
    return false;
  }
  return constraint ? pgError.constraint === constraint : true;
};

const isValidationError = (
  error: unknown,
): error is { issues: Array<{ message?: string }> } =>
  typeof error === 'object' &&
  error !== null &&
  Array.isArray((error as { issues?: unknown }).issues);

const isJsonBodyError = (error: unknown): error is SyntaxError =>
  error instanceof SyntaxError && 'body' in error;

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('publishable key') ||
    message.includes('secret key')
  ) {
    response.status(503).json({
      error:
        'Clerk 인증 설정이 올바르지 않습니다. CLERK_SECRET_KEY와 CLERK_PUBLISHABLE_KEY를 확인해 주세요.',
    });
    return;
  }

  if (isValidationError(error)) {
    response.status(400).json({
      error: error.issues[0]?.message ?? '요청 값을 확인해 주세요.',
    });
    return;
  }

  if (isJsonBodyError(error)) {
    response.status(400).json({ error: '요청 본문이 올바른 JSON이 아닙니다.' });
    return;
  }

  console.error('Unhandled API error:', error);
  response.status(500).json({ error: '서버 오류가 발생했습니다.' });
};
