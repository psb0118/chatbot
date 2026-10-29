import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import type { AppDatabase } from '@workspace/db';
import { drizzle } from 'drizzle-orm/pglite';

import * as schema from '../../../lib/db/src/schema';

const migrationsDirectory = fileURLToPath(
  new URL('../../../lib/db/drizzle/', import.meta.url),
);

export interface TestDatabase {
  db: AppDatabase;
  client: PGlite;
  close: () => Promise<void>;
}

/**
 * Boots an in-memory Postgres (PGlite), applies every committed migration and
 * returns a Drizzle client typed like the production one.
 */
export const createTestDatabase = async (): Promise<TestDatabase> => {
  const client = new PGlite();
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await readFile(`${migrationsDirectory}${file}`, 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await client.exec(statement);
    }
  }

  const db = drizzle(client, { schema }) as unknown as AppDatabase;

  return {
    db,
    client,
    close: async () => {
      await client.close();
    },
  };
};

/** Error shape used by `HttpError` assertions. */
export const expectHttpError = async (
  promise: Promise<unknown>,
  status: number,
): Promise<void> => {
  const { HttpError } = await import('./lib/errors');

  await promise.then(
    () => {
      throw new Error(`Expected HttpError ${status}, but the call succeeded.`);
    },
    (error: unknown) => {
      if (!(error instanceof HttpError)) {
        throw error;
      }

      if (error.status !== status) {
        throw new Error(
          `Expected HttpError ${status}, received ${error.status}: ${error.message}`,
        );
      }
    },
  );
};
