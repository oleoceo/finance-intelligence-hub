import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { KyselyFinancialTransactionPort, KyselyTransactionPort } from '@finance-hub/database';
import type {
  FinancialTransactionContext,
  MasterDataTransactionContextT04,
} from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Race barrier timed out')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Coordinates two independent PostgreSQL backends; business operations and assertions stay in each task test. */
export async function coordinatedFinancialCreateRace(
  connectionString: string,
  observationPool: Pool,
  configFirst: boolean,
  configuration: (ctx: MasterDataTransactionContextT04) => Promise<unknown>,
  creation: (ctx: FinancialTransactionContext) => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>[]> {
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
  const started = barrier();
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    const pid1 = (await pool1.query('select pg_backend_pid() as pid')).rows[0].pid as number;
    const pid2 = (await pool2.query('select pg_backend_pid() as pid')).rows[0].pid as number;
    if (pid1 === pid2) throw new Error('Race requires independent PostgreSQL backends');
    const holdLocks = async <T extends { locks: FinancialTransactionContext['locks'] }>(
      ctx: T,
    ) => ({
      ...ctx,
      locks: {
        acquireLocks: async (spec: Parameters<T['locks']['acquireLocks']>[0]) => {
          await ctx.locks.acquireLocks(spec);
          if (spec.books?.length || spec.merchants?.length) {
            held.release();
            await bounded(release.promise);
          }
        },
      },
    });
    const markStarted = async <T extends { locks: FinancialTransactionContext['locks'] }>(
      ctx: T,
    ) => ({
      ...ctx,
      locks: {
        acquireLocks: async (spec: Parameters<T['locks']['acquireLocks']>[0]) => {
          if (spec.books?.length || spec.merchants?.length) started.release();
          await ctx.locks.acquireLocks(spec);
        },
      },
    });
    const first = configFirst
      ? new KyselyTransactionPort(db1).runInTransaction(async (ctx) =>
          configuration(await holdLocks(ctx)),
        )
      : new KyselyFinancialTransactionPort(db1).runInTransaction(async (ctx) =>
          creation(await holdLocks(ctx)),
        );
    await bounded(held.promise);
    const second = configFirst
      ? new KyselyFinancialTransactionPort(db2).runInTransaction(async (ctx) =>
          creation(await markStarted(ctx)),
        )
      : new KyselyTransactionPort(db2).runInTransaction(async (ctx) =>
          configuration(await markStarted(ctx)),
        );
    pending = Promise.allSettled([first, second]);
    await bounded(started.promise);
    await bounded(
      (async () => {
        for (;;) {
          const observed = await observationPool.query(
            'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
            [pid2],
          );
          if (
            observed.rows[0]?.blockers.includes(pid1) &&
            observed.rows[0].wait_event_type === 'Lock'
          )
            break;
        }
      })(),
    );
    release.release();
    return await bounded(pending);
  } finally {
    release.release();
    if (pending) await pending;
    await db1.destroy();
    await db2.destroy();
  }
}

/** Holds the first financial writer after its Account locks while the reverse writer waits on PostgreSQL. */
export async function coordinatedFinancialPair(
  connectionString: string,
  observationPool: Pool,
  firstOperation: (ctx: FinancialTransactionContext) => Promise<unknown>,
  secondOperation: (ctx: FinancialTransactionContext) => Promise<unknown>,
  inspectLocks: (first: string[], second: string[]) => void,
  observeBlock?: (
    firstPid: number,
    secondPid: number,
    blockers: number[],
    waitType: string,
  ) => void,
  observeSecondLocks?: (accounts: string[]) => void,
): Promise<PromiseSettledResult<unknown>[]> {
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
  const started = barrier();
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  let firstLocks: string[] = [];
  let secondLocks: string[] = [];
  try {
    const pid1 = (await pool1.query('select pg_backend_pid() as pid')).rows[0].pid as number;
    const pid2 = (await pool2.query('select pg_backend_pid() as pid')).rows[0].pid as number;
    if (pid1 === pid2) throw new Error('Pair requires independent PostgreSQL backends');
    const first = new KyselyFinancialTransactionPort(db1).runInTransaction((ctx) =>
      firstOperation({
        ...ctx,
        locks: {
          acquireLocks: async (spec) => {
            firstLocks = spec.accounts ?? [];
            await ctx.locks.acquireLocks(spec);
            held.release();
            await bounded(release.promise);
          },
        },
      }),
    );
    await bounded(held.promise);
    const second = new KyselyFinancialTransactionPort(db2).runInTransaction((ctx) =>
      secondOperation({
        ...ctx,
        locks: {
          acquireLocks: async (spec) => {
            secondLocks = spec.accounts ?? [];
            observeSecondLocks?.(secondLocks);
            started.release();
            await ctx.locks.acquireLocks(spec);
          },
        },
      }),
    );
    pending = Promise.allSettled([first, second]);
    await bounded(started.promise);
    inspectLocks(firstLocks, secondLocks);
    await bounded(
      (async () => {
        for (;;) {
          const observed = await observationPool.query(
            'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
            [pid2],
          );
          if (
            observed.rows[0]?.blockers.includes(pid1) &&
            observed.rows[0].wait_event_type === 'Lock'
          ) {
            observeBlock?.(pid1, pid2, observed.rows[0].blockers, observed.rows[0].wait_event_type);
            break;
          }
        }
      })(),
    );
    release.release();
    return await bounded(pending);
  } finally {
    release.release();
    if (pending) await pending;
    await db1.destroy();
    await db2.destroy();
  }
}

/** Proves the original Expense row lock independently of configuration locks. */
export async function proveOriginalExpenseRowLock(
  connectionString: string,
  observationPool: Pool,
  originalId: string,
  operation: (ctx: FinancialTransactionContext) => Promise<unknown>,
  observe: (evidence: {
    holderPid: number;
    waiterPid: number;
    blockers: number[];
    waitType: string;
    calls: string[];
  }) => void,
  rollback = false,
): Promise<string[]> {
  const options = '-c statement_timeout=10000 -c lock_timeout=10000';
  const holderPool = new Pool({ connectionString, max: 1, options });
  const waiterPool = new Pool({ connectionString, max: 1, options });
  const holderDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: holderPool }) });
  const waiterDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: waiterPool }) });
  const acquired = barrier();
  const release = barrier();
  const calls: string[] = [];
  let holder: Promise<unknown> | undefined;
  let waiter: Promise<unknown> | undefined;
  try {
    const holderPid = (await holderPool.query('select pg_backend_pid() as pid')).rows[0]
      .pid as number;
    const waiterPid = (await waiterPool.query('select pg_backend_pid() as pid')).rows[0]
      .pid as number;
    if (holderPid === waiterPid) throw new Error('Row-lock proof requires distinct backends');
    holder = new KyselyFinancialTransactionPort(holderDb).runInTransaction(async (ctx) => {
      await operation({
        ...ctx,
        transactions: new Proxy(ctx.transactions, {
          get(target, property, receiver) {
            if (property === 'findByIdForUpdate')
              return async (id: string) => {
                calls.push(id);
                const row = await target.findByIdForUpdate(id);
                if (id === originalId && row) {
                  acquired.release();
                  await bounded(release.promise);
                }
                return row;
              };
            return Reflect.get(target, property, receiver);
          },
        }),
      });
      if (rollback) throw new Error('Expected row-lock proof rollback');
    });
    await bounded(acquired.promise);
    let waiterFinished = false;
    waiter = new KyselyFinancialTransactionPort(waiterDb)
      .runInTransaction((ctx) => ctx.transactions.findByIdForUpdate(originalId))
      .finally(() => {
        waiterFinished = true;
      });
    await bounded(
      (async () => {
        for (;;) {
          const result = await observationPool.query(
            'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
            [waiterPid],
          );
          const row = result.rows[0];
          if (row?.blockers.includes(holderPid) && row.wait_event_type === 'Lock') {
            if (waiterFinished) throw new Error('Row-lock waiter completed before holder release');
            observe({
              holderPid,
              waiterPid,
              blockers: row.blockers,
              waitType: row.wait_event_type,
              calls,
            });
            break;
          }
        }
      })(),
    );
    release.release();
    if (rollback) {
      const outcome = await bounded(Promise.allSettled([holder]));
      if (
        outcome[0].status !== 'rejected' ||
        outcome[0].reason?.message !== 'Expected row-lock proof rollback'
      )
        throw new Error('Holder did not roll back as expected');
    } else {
      await bounded(holder);
    }
    const lockedRow = await bounded(waiter);
    if (!lockedRow || !waiterFinished)
      throw new Error('Row-lock waiter did not resume after commit');
    return calls;
  } finally {
    release.release();
    await Promise.allSettled(
      [holder, waiter].filter((value): value is Promise<unknown> => !!value),
    );
    await holderDb.destroy();
    await waiterDb.destroy();
  }
}
