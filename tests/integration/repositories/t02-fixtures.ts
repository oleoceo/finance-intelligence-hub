import { beforeAll, afterAll } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { randomUUID } from 'node:crypto';
import { KyselyFinancialTransactionPort, migrateUp } from '@finance-hub/database';
import type { FinancialTransactionContext } from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';

export type FinancialOperation<T = unknown> = (ctx: FinancialTransactionContext) => Promise<T>;

/**
 * T02 integration test database fixture.
 *
 * Provides a real PostgreSQL instance via Testcontainers with all migrations
 * applied, and a `run` helper that executes operations inside a
 * KyselyFinancialTransactionPort transaction (the same adapter used by
 * production code).
 */
export function t02Database() {
  let container: StartedTestContainer;
  let connectionString: string;
  let pool: Pool;
  let db: Kysely<DB>;

  beforeAll(async () => {
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 't02_test',
        POSTGRES_USER: 't02_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    connectionString = `postgresql://t02_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/t02_test`;
    await migrateUp({ connectionString });
    pool = new Pool({ connectionString });
    db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  }, 180000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  const run = <T>(fn: FinancialOperation<T>) =>
    new KyselyFinancialTransactionPort(db).runInTransaction(fn);

  return {
    run,
    get db() {
      return db;
    },
    get pool() {
      return pool;
    },
    get connectionString() {
      return connectionString;
    },
  };
}
