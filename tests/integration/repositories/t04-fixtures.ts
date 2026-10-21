import { beforeAll, afterAll, expect } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { randomUUID } from 'node:crypto';
import { KyselyTransactionPort, migrateUp } from '@finance-hub/database';
import {
  createBook,
  createAccount,
  createCategory,
  createMerchant,
  type MasterDataTransactionContextT04,
} from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';

export type Operation<T = unknown> = (ctx: MasterDataTransactionContextT04) => Promise<T>;
// Same Testcontainers image/migrations and transaction adapter as the accepted T02/T03 suites.
export function t04Database() {
  let container: StartedTestContainer;
  let connectionString: string;
  let pool: Pool;
  let db: Kysely<DB>;
  beforeAll(async () => {
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 't04_test',
        POSTGRES_USER: 't04_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    connectionString = `postgresql://t04_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/t04_test`;
    await migrateUp({ connectionString });
    pool = new Pool({ connectionString });
    db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  }, 180000);
  afterAll(async () => {
    if (db) await db.destroy();
    if (container) await container.stop();
  });
  const run = <T>(fn: Operation<T>) => new KyselyTransactionPort(db).runInTransaction(fn);
  async function targets() {
    return run(async (ctx) => {
      const now = new Date();
      const book = await createBook({ name: randomUUID(), currency: 'BRL' }, ctx, now);
      const account = await createAccount(
        { bookId: book.id, name: randomUUID(), type: 'checking', currency: 'BRL' },
        ctx,
        now,
      );
      const category = await createCategory({ bookId: book.id, name: randomUUID() }, ctx, now);
      const merchant = await createMerchant({ name: randomUUID() }, ctx, now);
      return { book, account, category, merchant };
    });
  }
  async function coordinated(first: Operation, second: Operation) {
    const pool1 = new Pool({
      connectionString,
      max: 1,
      options: '-c statement_timeout=10000 -c lock_timeout=10000',
    });
    const pool2 = new Pool({
      connectionString,
      max: 1,
      options: '-c statement_timeout=10000 -c lock_timeout=10000',
    });
    const db1 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool1 }) });
    const db2 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool2 }) });
    const held = barrier();
    const release = barrier();
    let settled1: Promise<PromiseSettledResult<unknown>[]> | undefined;
    let settled2: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      const pid1 = (await pool1.query('select pg_backend_pid() as pid')).rows[0].pid;
      const pid2 = (await pool2.query('select pg_backend_pid() as pid')).rows[0].pid;
      expect(pid1).not.toBe(pid2);
      const run1 = new KyselyTransactionPort(db1).runInTransaction(async (ctx) => {
        const result = await first(ctx);
        held.release(); // operation finished, but transaction still owns its locks
        await bounded(release.promise);
        return result;
      });
      settled1 = Promise.allSettled([run1]);
      await bounded(held.promise);
      const run2 = new KyselyTransactionPort(db2).runInTransaction(second);
      settled2 = Promise.allSettled([run2]);
      await bounded(
        (async () => {
          const deadline = Date.now() + 7000;
          for (;;) {
            if (Date.now() > deadline)
              throw new Error('Expected PostgreSQL lock wait was not observed');
            const { rows } = await pool.query(
              'select pg_blocking_pids($1) as blockers, wait_event_type, query from pg_stat_activity where pid=$1',
              [pid2],
            );
            if (rows[0]?.blockers.includes(pid1)) {
              expect(rows[0].wait_event_type).toBe('Lock');
              expect(rows[0].query).toContain('for update');
              break;
            }
          }
        })(),
      );
      release.release();
      return [...(await bounded(settled1)), ...(await bounded(settled2))];
    } finally {
      release.release();
      if (settled1) await settled1;
      if (settled2) await settled2;
      await db1.destroy();
      await db2.destroy();
    }
  }
  return {
    run,
    targets,
    coordinated,
    get db() {
      return db;
    },
    get pool() {
      return pool;
    },
  };
}
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Barrier timed out')), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
