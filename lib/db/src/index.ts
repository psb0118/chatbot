import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

export type AppDatabase = NodePgDatabase<typeof schema>;

let poolInstance: Pool | undefined;
let databaseInstance: AppDatabase | undefined;

/** True when DATABASE_URL is present, without opening a connection. */
export const isDatabaseConfigured = (): boolean =>
  Boolean(process.env.DATABASE_URL);

const requireConnectionString = (): string => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL must be set. Did you forget to provision a database?',
    );
  }

  return connectionString;
};

export const getPool = (): Pool => {
  if (!poolInstance) {
    poolInstance = new Pool({ connectionString: requireConnectionString() });
  }

  return poolInstance;
};

export const getDb = (): AppDatabase => {
  if (!databaseInstance) {
    databaseInstance = drizzle(getPool(), { schema });
  }

  return databaseInstance;
};

/**
 * Lazily resolved Drizzle client.
 *
 * Importing this module never connects, so health checks and the Kakao webhook
 * keep working before a database is provisioned. Accessing `db` without
 * DATABASE_URL throws the same configuration error at query time instead of at
 * import time.
 */
export const db = new Proxy({} as AppDatabase, {
  get(_target, property) {
    const instance = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = instance[property];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const closePool = async (): Promise<void> => {
  const pool = poolInstance;
  poolInstance = undefined;
  databaseInstance = undefined;

  if (pool) {
    await pool.end();
  }
};

export * from './schema';

/**
 * Re-export the query builders so every workspace package uses the same
 * drizzle-orm instance as the schema. Mixing copies breaks TypeScript's
 * structural typing across packages.
 */
export { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
