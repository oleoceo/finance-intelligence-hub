import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import {
  GenericCreateTransaction,
  transactionSnapshot,
  type CreateTransactionInput,
  type FinancialTransactionContext,
  type FinancialTransactionPort,
} from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from '@finance-hub/database';
import type { DB } from '../../../packages/database/src/db-types.js';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-21T12:00:00Z');
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('T07 contention timed out')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function seed() {
  const bookId = randomUUID();
  const accountId = randomUUID();
  const destinationAccountId = randomUUID();
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: bookId,
      name: 'T07 book',
      normalizedName: bookId,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const id of [accountId, destinationAccountId]) {
      await ctx.accounts.create({
        id,
        bookId,
        name: id,
        normalizedName: id,
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  return { bookId, accountId, destinationAccountId };
}
function command(
  ids: Awaited<ReturnType<typeof seed>>,
  type: 'expense' | 'income' | 'transfer' = 'expense',
): CreateTransactionInput {
  const common = {
    bookId: ids.bookId,
    accountId: ids.accountId,
    amount: '42.25',
    description: 'T07 create',
    transactionDate: '2026-10-21',
  };
  if (type === 'transfer')
    return { ...common, type, destinationAccountId: ids.destinationAccountId };
  return { ...common, type };
}
function create(
  port: FinancialTransactionPort,
  input: CreateTransactionInput,
  key: string,
  correlation = key,
) {
  const orchestrator = new GenericCreateTransaction(port, {
    humanRefGenerator: {
      generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
    },
    now: () => now,
  });
  return orchestrator.execute(input, key, { correlationId: correlation });
}
function realPort() {
  return new KyselyFinancialTransactionPort(fixture.db);
}
async function rows(key: string, bookId: string) {
  const [transactions, audit, keys, outbox] = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().where('book_id', '=', bookId).execute(),
    fixture.db.selectFrom('audit_events').selectAll().where('correlation_id', '=', key).execute(),
    fixture.db
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('idempotency_key', '=', key)
      .execute(),
    fixture.db
      .selectFrom('outbox_events' as never)
      .selectAll()
      .execute(),
  ]);
  return { transactions, audit, keys, outbox };
}

describe('M04-T07 atomic generic create on PostgreSQL', () => {
  it('commits Expense, JSONB Audit and completed key; replay and conflict never duplicate effects', async () => {
    const ids = await seed();
    const key = randomUUID();
    const input = command(ids);
    const fresh = await create(realPort(), input, key);
    const state = await rows(key, ids.bookId);
    expect(state.transactions).toHaveLength(1);
    expect(state.audit).toHaveLength(1);
    expect(state.keys).toHaveLength(1);
    expect(state.outbox).toHaveLength(0);
    expect(state.audit[0]).toMatchObject({
      id: expect.any(String),
      entity_type: 'transaction',
      entity_id: fresh.id,
      action: 'TRANSACTION_CREATED',
      source: 'direct_api',
      actor_reference: null,
      old_data: null,
      new_data: transactionSnapshot(fresh),
      correlation_id: key,
      created_at: now,
    });
    expect(state.audit[0]!.new_data).toEqual(transactionSnapshot(fresh));
    expect(state.keys[0]).toMatchObject({
      status: 'completed',
      resource_type: 'transaction',
      resource_id: fresh.id,
      response_status: 201,
      response_body: transactionSnapshot(fresh),
      completed_at: now,
    });
    const replay = await create(realPort(), input, key, randomUUID());
    expect(replay).toEqual(fresh);
    await expect(create(realPort(), { ...input, amount: '43.25' }, key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const after = await rows(key, ids.bookId);
    expect(after.transactions).toHaveLength(1);
    expect(after.audit).toHaveLength(1);
    expect(after.keys).toHaveLength(1);
    expect(after.audit[0]!.correlation_id).toBe(key);
  });

  it.each(['income', 'transfer'] as const)(
    'routes %s through its business executor',
    async (type) => {
      const ids = await seed();
      const key = randomUUID();
      const result = await create(realPort(), command(ids, type), key);
      expect(result.type).toBe(type);
      expect(result.destinationAccountId).toBe(
        type === 'transfer' ? ids.destinationAccountId : null,
      );
      const state = await rows(key, ids.bookId);
      expect(state.transactions).toHaveLength(1);
      expect(state.audit[0]!.entity_id).toBe(result.id);
      expect(state.keys[0]!.status).toBe('completed');
    },
  );

  it('rolls back claim for business rejection after ownership', async () => {
    const ids = await seed();
    await fixture.db
      .updateTable('accounts')
      .set({ active: false, archived_at: now })
      .where('id', '=', ids.accountId)
      .execute();
    const key = randomUUID();
    await expect(create(realPort(), command(ids), key)).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
    const state = await rows(key, ids.bookId);
    expect(state.transactions).toHaveLength(0);
    expect(state.audit).toHaveLength(0);
    expect(state.keys).toHaveLength(0);
  });

  it.each(['audit', 'completion'] as const)(
    'rolls back all rows on %s failure',
    async (failure) => {
      const ids = await seed();
      const key = randomUUID();
      const injected: FinancialTransactionPort = {
        runInTransaction: (fn) =>
          realPort().runInTransaction((ctx) => {
            const wrapped: FinancialTransactionContext = {
              ...ctx,
              audit:
                failure === 'audit'
                  ? {
                      write: async () => {
                        throw new Error('audit failed');
                      },
                    }
                  : ctx.audit,
              idempotencyKeys:
                failure === 'completion'
                  ? {
                      create: (value) => ctx.idempotencyKeys.create(value),
                      findByKeyAndScope: (k, scope) =>
                        ctx.idempotencyKeys.findByKeyAndScope(k, scope),
                      findByKeyAndScopeForUpdate: (k, scope) =>
                        ctx.idempotencyKeys.findByKeyAndScopeForUpdate(k, scope),
                      complete: async () => {
                        throw new Error('completion failed');
                      },
                    }
                  : ctx.idempotencyKeys,
            };
            return fn(wrapped);
          }),
      };
      await expect(create(injected, command(ids), key)).rejects.toThrow(`${failure} failed`);
      const state = await rows(key, ids.bookId);
      expect(state.transactions).toHaveLength(0);
      expect(state.audit).toHaveLength(0);
      expect(state.keys).toHaveLength(0);
    },
  );

  it.each([
    ['duplicate', false, false],
    ['different', true, false],
    ['winner rollback', false, true],
  ] as const)('serializes %s on two independent backends', async (_, different, rollback) => {
    const ids = await seed();
    const key = randomUUID();
    const firstPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const secondPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    const held = gate();
    const release = gate();
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      const owner: FinancialTransactionPort = {
        runInTransaction: (fn) =>
          new KyselyFinancialTransactionPort(firstDb).runInTransaction((ctx) =>
            fn({
              ...ctx,
              idempotencyKeys: {
                ...ctx.idempotencyKeys,
                create: async (claim) => {
                  const owned = await ctx.idempotencyKeys.create(claim);
                  if (owned) {
                    held.release();
                    await bounded(release.promise);
                    if (rollback) throw new Error('winner rolled back');
                  }
                  return owned;
                },
                complete: (value) => ctx.idempotencyKeys.complete(value),
                findByKeyAndScope: (k, scope) => ctx.idempotencyKeys.findByKeyAndScope(k, scope),
                findByKeyAndScopeForUpdate: (k, scope) =>
                  ctx.idempotencyKeys.findByKeyAndScopeForUpdate(k, scope),
              },
            }),
          ),
      };
      first = create(owner, command(ids), key);
      await bounded(held.promise);
      second = create(
        new KyselyFinancialTransactionPort(secondDb),
        { ...command(ids), amount: different ? '44.25' : '42.25' },
        key,
      );
      await bounded(
        (async () => {
          for (;;) {
            const observed = await fixture.pool.query(
              'select pg_blocking_pids($1) blockers, wait_event_type from pg_stat_activity where pid=$1',
              [pid2],
            );
            if (
              observed.rows[0]?.blockers.includes(pid1) &&
              observed.rows[0]?.wait_event_type === 'Lock'
            )
              return;
          }
        })(),
      );
      release.release();
      const [winner, contender] = await bounded(Promise.allSettled([first, second]));
      if (rollback) {
        expect(winner).toMatchObject({
          status: 'rejected',
          reason: new Error('winner rolled back'),
        });
        expect(contender.status).toBe('fulfilled');
      } else if (different) {
        expect(winner.status).toBe('fulfilled');
        expect(contender).toMatchObject({
          status: 'rejected',
          reason: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
        });
      } else {
        expect(winner.status).toBe('fulfilled');
        expect(contender).toEqual({
          status: 'fulfilled',
          value: (winner as PromiseFulfilledResult<unknown>).value,
        });
      }
      const state = await rows(key, ids.bookId);
      expect(state.transactions).toHaveLength(1);
      expect(state.audit).toHaveLength(1);
      expect(state.keys).toHaveLength(1);
      expect(state.keys[0]!.status).toBe('completed');
    } finally {
      release.release();
      await Promise.allSettled([first, second].filter((p): p is Promise<unknown> => !!p));
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('takes the financial Account lock after idempotency claim and re-reads inactive state', async () => {
    const ids = await seed();
    const key = randomUUID();
    const firstPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const secondPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    const held = gate();
    const claimed = gate();
    const release = gate();
    let configuration: Promise<unknown> | undefined;
    let creation: Promise<unknown> | undefined;
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      configuration = firstDb.transaction().execute(async (tx) => {
        await tx
          .updateTable('accounts')
          .set({ active: false, archived_at: now })
          .where('id', '=', ids.accountId)
          .execute();
        held.release();
        await bounded(release.promise);
      });
      await bounded(held.promise);
      const observedPort: FinancialTransactionPort = {
        runInTransaction: (fn) =>
          new KyselyFinancialTransactionPort(secondDb).runInTransaction((ctx) =>
            fn({
              ...ctx,
              idempotencyKeys: {
                create: async (value) => {
                  const row = await ctx.idempotencyKeys.create(value);
                  if (row) claimed.release();
                  return row;
                },
                complete: (value) => ctx.idempotencyKeys.complete(value),
                findByKeyAndScope: (k, scope) => ctx.idempotencyKeys.findByKeyAndScope(k, scope),
                findByKeyAndScopeForUpdate: (k, scope) =>
                  ctx.idempotencyKeys.findByKeyAndScopeForUpdate(k, scope),
              },
            }),
          ),
      };
      creation = create(observedPort, command(ids), key);
      await bounded(claimed.promise);
      await bounded(
        (async () => {
          for (;;) {
            const observed = await fixture.pool.query(
              'select pg_blocking_pids($1) blockers, wait_event_type from pg_stat_activity where pid=$1',
              [pid2],
            );
            if (
              observed.rows[0]?.blockers.includes(pid1) &&
              observed.rows[0]?.wait_event_type === 'Lock'
            )
              return;
          }
        })(),
      );
      release.release();
      await bounded(configuration);
      await expect(bounded(creation)).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
      const state = await rows(key, ids.bookId);
      expect(state.transactions).toHaveLength(0);
      expect(state.audit).toHaveLength(0);
      expect(state.keys).toHaveLength(0);
    } finally {
      release.release();
      await Promise.allSettled([configuration, creation].filter((p): p is Promise<unknown> => !!p));
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });
});
