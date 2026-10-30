import { timingSafeEqual } from 'node:crypto';

/** Constant-time comparison so a wrong secret cannot be guessed by timing. */
export const secretMatches = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};
