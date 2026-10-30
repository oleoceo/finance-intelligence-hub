import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  CorrectTransaction,
  CreateRefund,
  VoidTransaction,
  ConfigurationLockSetChangedError,
  type FinancialTransactionContext,
} from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from '@finance-hub/database';
import {
  coordinatedFinancialCreateRace,
  coordinatedFinancialPair,
} from '../helpers/financial-create-race.js';
import { t02Database } from './t02-fixtures.js';
import type { DB } from '../../../packages/database/src/db-types.js';

const fixture = t02Database();
const now = new Date('2026-10-29T12:00:00Z');
const book = randomUUID();
const account = randomUUID();
const secondAccount = randomUUID();
const port = () => new KyselyFinancialTransactionPort(fixture.db);
const refund = () =>
  new CreateRefund(
    port(),
    { generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase() },
    () => now,
  );
const correct = () => new CorrectTransaction(port(), () => now);
const voider = () => new VoidTransaction(port(), () => now);
const refundInput = (amount: string, transactionDate = '2026-10-25', accountId = account) => ({
  version: 1,
  amount,
  accountId,
  transactionDate,
  description: 'race refund',
});

async function expense(amount = '500.00', accountId = account) {
  const id = randomUUID();
  await fixture.db
    .insertInto('transactions')
    .values({
      id,
      human_ref: randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
      book_id: book,
      account_id: accountId,
      destination_account_id: null,
      category_id: null,
      merchant_id: null,
      type: 'expense',
      status: 'posted',
      amount,
      currency: 'BRL',
      description: 'race expense',
      notes: null,
      transaction_date: '2026-10-20',
      source: 'direct_api',
      source_reference: null,
      inbox_message_id: null,
      refund_of_transaction_id: null,
      version: 1,
      voided_at: null,
      void_reason: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

async function state(id: string) {
  const original = await fixture.db
    .selectFrom('transactions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  const refunds = await fixture.db
    .selectFrom('transactions')
    .selectAll()
    .where('refund_of_transaction_id', '=', id)
    .execute();
  const related = [id, ...refunds.map((row) => row.id)];
  const audit = await fixture.db
    .selectFrom('audit_events')
    .selectAll()
    .where('entity_id', 'in', related)
    .execute();
  const posted = refunds.filter((row) => row.status === 'posted');
  const cents = (value: string) => BigInt(value.replace('.', ''));
  expect(posted.reduce((sum, row) => sum + cents(row.amount), 0n)).toBeLessThanOrEqual(
    cents(original.amount),
  );
  if (posted.length) expect(original.status).toBe('posted');
  for (const row of posted) {
    expect(new Date(row.transaction_date).getTime()).toBeGreaterThanOrEqual(
      new Date(original.transaction_date).getTime(),
    );
    expect(row.version).toBe(1);
  }
  return { original, refunds, audit };
}

async function race(
  first: (ctx: FinancialTransactionContext) => Promise<unknown>,
  second: (ctx: FinancialTransactionContext) => Promise<unknown>,
) {
  return coordinatedFinancialPair(
    fixture.connectionString,
    fixture.pool,
    first,
    second,
    (a, b) => {
      expect(a).toContain(account);
      expect(b).toContain(account);
    },
    (firstPid, secondPid, blockers, waitType) => {
      expect(firstPid).not.toBe(secondPid);
      expect(blockers).toContain(firstPid);
      expect(waitType).toBe('Lock');
    },
  );
}

function resultCodes(results: PromiseSettledResult<unknown>[]) {
  return results.map((result) =>
    result.status === 'fulfilled' ? 'OK' : (result.reason as { code?: string }).code,
  );
}

function recordFinancialLockOrder(ctx: FinancialTransactionContext, observed: string[]) {
  return {
    ...ctx,
    transactions: new Proxy(ctx.transactions, {
      get(target, property, receiver) {
        if (property === 'findByIdForUpdate')
          return (id: string) => {
            observed.push(id);
            return target.findByIdForUpdate(id);
          };
        return Reflect.get(target, property, receiver);
      },
    }),
  };
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: book,
      name: book,
      normalizedName: book,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.accounts.create({
      id: account,
      bookId: book,
      name: account,
      normalizedName: account,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.accounts.create({
      id: secondAccount,
      bookId: book,
      name: secondAccount,
      normalizedName: secondAccount,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
}, 180000);

describe('M07-P04 cross-operation PostgreSQL serialization', () => {
  it('serializes two 300.00 Refunds with distinct keys against 500.00', async () => {
    const id = await expense();
    const keys = [randomUUID(), randomUUID()];
    const create = (key: string) => (ctx: FinancialTransactionContext) =>
      refund().executeInContext(id, refundInput('300.00'), key, randomUUID(), ctx);
    expect(resultCodes(await race(create(keys[0]), create(keys[1])))).toEqual([
      'OK',
      'REFUND_AMOUNT_EXCEEDED',
    ]);
    const final = await state(id);
    expect(final.refunds.map((r) => r.amount)).toEqual(['300.00']);
    expect(final.audit.map((a) => a.action)).toEqual(['TRANSACTION_REFUND_CREATED']);
    const stored = await fixture.db
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('idempotency_key', 'in', keys)
      .execute();
    expect(stored).toHaveLength(1);
    expect(stored[0].idempotency_key).toBe(keys[0]);
  });

  it('serializes one shared Refund key, replays once, and rejects a changed fingerprint', async () => {
    const id = await expense();
    const key = randomUUID();
    const create = (ctx: FinancialTransactionContext) =>
      refund().executeInContext(id, refundInput('300.00'), key, randomUUID(), ctx);
    const results = await race(create, create);
    expect(resultCodes(results)).toEqual(['OK', 'OK']);
    expect((results[0] as PromiseFulfilledResult<{ id: string }>).value.id).toBe(
      (results[1] as PromiseFulfilledResult<{ id: string }>).value.id,
    );
    await expect(
      refund().execute(id, refundInput('300.00'), key, randomUUID()),
    ).resolves.toMatchObject({
      id: (results[0] as PromiseFulfilledResult<{ id: string }>).value.id,
    });
    await expect(
      refund().execute(id, refundInput('200.00'), key, randomUUID()),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const final = await state(id);
    expect(final.refunds).toHaveLength(1);
    expect(final.audit).toHaveLength(1);
    expect(
      await fixture.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('idempotency_key', '=', key)
        .execute(),
    ).toHaveLength(1);
  });

  it.each(['refund first', 'correction first'] as const)(
    'serializes Refund and amount Correction: %s',
    async (order) => {
      const id = await expense();
      const key = randomUUID();
      const create = (ctx: FinancialTransactionContext) =>
        refund().executeInContext(id, refundInput('300.00'), key, randomUUID(), ctx);
      const patch = (ctx: FinancialTransactionContext) =>
        correct().executeInContext(id, { version: 1, amount: '200.00' }, randomUUID(), ctx);
      const results =
        order === 'refund first' ? await race(create, patch) : await race(patch, create);
      expect(resultCodes(results)).toEqual(
        order === 'refund first' ? ['OK', 'VALIDATION_ERROR'] : ['OK', 'VERSION_CONFLICT'],
      );
      const final = await state(id);
      expect(final.original.amount).toBe(order === 'refund first' ? '500.00' : '200.00');
      expect(final.original.version).toBe(order === 'refund first' ? 1 : 2);
      expect(final.refunds.filter((r) => r.status === 'posted').map((r) => r.amount)).toEqual(
        order === 'refund first' ? ['300.00'] : [],
      );
      expect(final.audit.map((a) => a.action)).toEqual(
        order === 'refund first' ? ['TRANSACTION_REFUND_CREATED'] : ['TRANSACTION_UPDATED'],
      );
    },
  );

  it.each(['refund first', 'correction first'] as const)(
    'serializes Refund and date Correction: %s',
    async (order) => {
      const id = await expense();
      const key = randomUUID();
      const create = (ctx: FinancialTransactionContext) =>
        refund().executeInContext(id, refundInput('100.00', '2026-10-25'), key, randomUUID(), ctx);
      const patch = (ctx: FinancialTransactionContext) =>
        correct().executeInContext(
          id,
          { version: 1, transactionDate: '2026-10-26' },
          randomUUID(),
          ctx,
        );
      const results =
        order === 'refund first' ? await race(create, patch) : await race(patch, create);
      expect(resultCodes(results)).toEqual(
        order === 'refund first' ? ['OK', 'VALIDATION_ERROR'] : ['OK', 'VERSION_CONFLICT'],
      );
      const final = await state(id);
      expect(new Date(final.original.transaction_date).toISOString().slice(0, 10)).toBe(
        order === 'refund first' ? '2026-10-20' : '2026-10-26',
      );
      expect(final.refunds.filter((r) => r.status === 'posted')).toHaveLength(
        order === 'refund first' ? 1 : 0,
      );
      expect(final.audit).toHaveLength(1);
    },
  );

  it.each(['refund first', 'void first'] as const)(
    'serializes Refund and original Void: %s',
    async (order) => {
      const id = await expense();
      const create = (ctx: FinancialTransactionContext) =>
        refund().executeInContext(id, refundInput('100.00'), randomUUID(), randomUUID(), ctx);
      const remove = (ctx: FinancialTransactionContext) =>
        voider().executeInContext(
          id,
          { version: 1, reason: 'race' },
          randomUUID(),
          randomUUID(),
          ctx,
        );
      const results =
        order === 'refund first' ? await race(create, remove) : await race(remove, create);
      expect(resultCodes(results)).toEqual(
        order === 'refund first'
          ? ['OK', 'TRANSACTION_HAS_POSTED_REFUNDS']
          : ['OK', 'REFUND_INVALID_TARGET'],
      );
      const final = await state(id);
      expect(final.original.status).toBe(order === 'refund first' ? 'posted' : 'voided');
      expect(final.refunds.filter((r) => r.status === 'posted')).toHaveLength(
        order === 'refund first' ? 1 : 0,
      );
      expect(final.audit).toHaveLength(1);
    },
  );

  it.each(['patch first', 'void first'] as const)(
    'applies only one same-version PATCH/Void: %s',
    async (order) => {
      const id = await expense();
      const patch = (ctx: FinancialTransactionContext) =>
        correct().executeInContext(id, { version: 1, description: 'corrected' }, randomUUID(), ctx);
      const remove = (ctx: FinancialTransactionContext) =>
        voider().executeInContext(
          id,
          { version: 1, reason: 'race' },
          randomUUID(),
          randomUUID(),
          ctx,
        );
      const results =
        order === 'patch first' ? await race(patch, remove) : await race(remove, patch);
      expect(resultCodes(results)).toEqual(['OK', 'VERSION_CONFLICT']);
      const final = await state(id);
      expect(final.original.version).toBe(2);
      expect(final.original.status).toBe(order === 'patch first' ? 'posted' : 'voided');
      expect(final.audit).toHaveLength(1);
    },
  );

  it('applies only one same-version PATCH/PATCH and one Audit event', async () => {
    const id = await expense();
    const patch = (description: string) => (ctx: FinancialTransactionContext) =>
      correct().executeInContext(id, { version: 1, description }, randomUUID(), ctx);
    expect(resultCodes(await race(patch('first'), patch('second')))).toEqual([
      'OK',
      'VERSION_CONFLICT',
    ]);
    const final = await state(id);
    expect(final.original).toMatchObject({ version: 2, description: 'first' });
    expect(final.audit.map((a) => a.action)).toEqual(['TRANSACTION_UPDATED']);
  });

  it.each(['refund void first', 'expense void first'] as const)(
    'orders Refund Void before original Expense Void: %s',
    async (order) => {
      const id = await expense();
      const created = await refund().execute(id, refundInput('200.00'), randomUUID(), randomUUID());
      const lockOrder: string[] = [];
      const removeRefund = (ctx: FinancialTransactionContext) =>
        voider().executeInContext(
          created.id,
          { version: 1, reason: 'race' },
          randomUUID(),
          randomUUID(),
          recordFinancialLockOrder(ctx, lockOrder),
        );
      const removeExpense = (ctx: FinancialTransactionContext) =>
        voider().executeInContext(
          id,
          { version: 1, reason: 'race' },
          randomUUID(),
          randomUUID(),
          ctx,
        );
      const results =
        order === 'refund void first'
          ? await race(removeRefund, removeExpense)
          : await race(removeExpense, removeRefund);
      expect(resultCodes(results)).toEqual(
        order === 'refund void first' ? ['OK', 'OK'] : ['TRANSACTION_HAS_POSTED_REFUNDS', 'OK'],
      );
      expect(lockOrder).toEqual([id, created.id]);
      const final = await state(id);
      expect(final.refunds[0]).toMatchObject({ status: 'voided', version: 2 });
      expect(final.original.status).toBe(order === 'refund void first' ? 'voided' : 'posted');
      expect(final.audit.map((a) => a.action).sort()).toEqual(
        order === 'refund void first'
          ? ['TRANSACTION_REFUND_CREATED', 'TRANSACTION_VOIDED', 'TRANSACTION_VOIDED']
          : ['TRANSACTION_REFUND_CREATED', 'TRANSACTION_VOIDED'],
      );
    },
  );

  it.each(['refund void first', 'new refund first'] as const)(
    'serializes Refund Void and capacity reuse: %s',
    async (order) => {
      const id = await expense();
      const old = await refund().execute(id, refundInput('400.00'), randomUUID(), randomUUID());
      const remove = (ctx: FinancialTransactionContext) =>
        voider().executeInContext(
          old.id,
          { version: 1, reason: 'capacity' },
          randomUUID(),
          randomUUID(),
          ctx,
        );
      const create = (ctx: FinancialTransactionContext) =>
        refund().executeInContext(id, refundInput('300.00'), randomUUID(), randomUUID(), ctx);
      const results =
        order === 'refund void first' ? await race(remove, create) : await race(create, remove);
      expect(resultCodes(results)).toEqual(
        order === 'refund void first' ? ['OK', 'OK'] : ['REFUND_AMOUNT_EXCEEDED', 'OK'],
      );
      const final = await state(id);
      expect(final.refunds.filter((r) => r.status === 'posted').map((r) => r.amount)).toEqual(
        order === 'refund void first' ? ['300.00'] : [],
      );
      expect(final.refunds.find((r) => r.id === old.id)).toMatchObject({
        status: 'voided',
        version: 2,
      });
    },
  );

  it('serializes two Refund Voids and keeps original blocked until the last Refund is voided', async () => {
    const id = await expense();
    const a = await refund().execute(id, refundInput('100.00'), randomUUID(), randomUUID());
    const b = await refund().execute(id, refundInput('200.00'), randomUUID(), randomUUID());
    const remove = (refundId: string) => (ctx: FinancialTransactionContext) =>
      voider().executeInContext(
        refundId,
        { version: 1, reason: 'two voids' },
        randomUUID(),
        randomUUID(),
        ctx,
      );
    expect(resultCodes(await race(remove(a.id), remove(b.id)))).toEqual(['OK', 'OK']);
    const final = await state(id);
    expect(final.refunds.map((r) => [r.status, r.version])).toEqual([
      ['voided', 2],
      ['voided', 2],
    ]);
    expect(final.audit.filter((a) => a.action === 'TRANSACTION_VOIDED')).toHaveLength(2);
    await expect(
      voider().execute(id, { version: 1, reason: 'now free' }, randomUUID(), randomUUID()),
    ).resolves.toMatchObject({ status: 'voided' });
  });

  it('one of two Refund Voids does not permit original Expense Void', async () => {
    const id = await expense();
    const a = await refund().execute(id, refundInput('100.00'), randomUUID(), randomUUID());
    await refund().execute(id, refundInput('200.00'), randomUUID(), randomUUID());
    const remove = (ctx: FinancialTransactionContext) =>
      voider().executeInContext(
        a.id,
        { version: 1, reason: 'partial release' },
        randomUUID(),
        randomUUID(),
        ctx,
      );
    const originalVoid = (ctx: FinancialTransactionContext) =>
      voider().executeInContext(
        id,
        { version: 1, reason: 'too soon' },
        randomUUID(),
        randomUUID(),
        ctx,
      );
    expect(resultCodes(await race(remove, originalVoid))).toEqual([
      'OK',
      'TRANSACTION_HAS_POSTED_REFUNDS',
    ]);
    const final = await state(id);
    expect(final.original).toMatchObject({ status: 'posted', version: 1 });
    expect(final.refunds.map((r) => r.status).sort()).toEqual(['posted', 'voided']);
    expect(final.audit.filter((a) => a.action === 'TRANSACTION_VOIDED')).toHaveLength(1);
  });

  it('waits for Account archival and rejects a stale Refund reference without a partial key', async () => {
    const archivedAccount = randomUUID();
    await fixture.run((ctx) =>
      ctx.accounts.create({
        id: archivedAccount,
        bookId: book,
        name: archivedAccount,
        normalizedName: archivedAccount,
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const id = await expense('500.00', archivedAccount);
    const key = randomUUID();
    const results = await coordinatedFinancialCreateRace(
      fixture.connectionString,
      fixture.pool,
      true,
      async (ctx) => {
        await ctx.locks.acquireLocks({ books: [book], accounts: [archivedAccount] });
        await ctx.accounts.archive({
          id: archivedAccount,
          active: false,
          archivedAt: now,
          updatedAt: now,
        });
      },
      (ctx) =>
        refund().executeInContext(
          id,
          refundInput('100.00', '2026-10-25', archivedAccount),
          key,
          randomUUID(),
          ctx,
        ),
    );
    expect(resultCodes(results)).toEqual(['OK', 'ACCOUNT_INACTIVE']);
    const final = await state(id);
    expect(final.original).toMatchObject({ status: 'posted', version: 1 });
    expect(final.refunds).toHaveLength(0);
    expect(final.audit).toHaveLength(0);
    expect(
      await fixture.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('idempotency_key', '=', key)
        .execute(),
    ).toHaveLength(0);
  });

  it('restarts the whole transaction when Correction changes Refund reference locks', async () => {
    const id = await expense();
    const key = randomUUID();
    const lockSets: string[][] = [];
    const results = await coordinatedFinancialPair(
      fixture.connectionString,
      fixture.pool,
      (ctx) =>
        correct().executeInContext(id, { version: 1, accountId: secondAccount }, randomUUID(), ctx),
      (ctx) => refund().executeInContext(id, refundInput('100.00'), key, randomUUID(), ctx),
      (first, second) => {
        expect(first).toEqual(expect.arrayContaining([account, secondAccount]));
        expect(second).toContain(account);
        expect(second).not.toContain(secondAccount);
      },
      (firstPid, secondPid, blockers, waitType) => {
        expect(firstPid).not.toBe(secondPid);
        expect(blockers).toContain(firstPid);
        expect(waitType).toBe('Lock');
      },
      (accounts) => lockSets.push(accounts),
    );
    expect(resultCodes(results)).toEqual(['OK', 'VERSION_CONFLICT']);
    expect(lockSets).toHaveLength(2);
    expect(lockSets[0]).not.toContain(secondAccount);
    expect(lockSets[1]).toContain(secondAccount);
    const final = await state(id);
    expect(final.original).toMatchObject({ account_id: secondAccount, version: 2 });
    expect(final.refunds).toHaveLength(0);
    expect(final.audit.map((event) => event.action)).toEqual(['TRANSACTION_UPDATED']);
    expect(
      await fixture.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('idempotency_key', '=', key)
        .execute(),
    ).toHaveLength(0);
  });

  it('exhausts reference-change retries with no Refund, Audit or stranded key', async () => {
    const id = await expense();
    const key = randomUUID();
    let attempts = 0;
    const real = port();
    const injected = {
      runInTransaction: <T>(fn: (ctx: FinancialTransactionContext) => Promise<T>) =>
        real.runInTransaction((ctx) =>
          fn({
            ...ctx,
            transactions: new Proxy(ctx.transactions, {
              get(target, property, receiver) {
                if (property === 'findByIdForUpdate')
                  return async () => {
                    attempts++;
                    throw new ConfigurationLockSetChangedError();
                  };
                return Reflect.get(target, property, receiver);
              },
            }),
          }),
        ),
    };
    const service = new CreateRefund(
      injected,
      { generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase() },
      () => now,
    );
    await expect(
      service.execute(id, refundInput('100.00'), key, randomUUID()),
    ).rejects.toMatchObject({ code: 'CONCURRENCY_ERROR' });
    expect(attempts).toBe(3);
    const final = await state(id);
    expect(final.refunds).toHaveLength(0);
    expect(final.audit).toHaveLength(0);
    expect(
      await fixture.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('idempotency_key', '=', key)
        .execute(),
    ).toHaveLength(0);
  });

  it('retries a real PostgreSQL lock timeout and commits Refund only once', async () => {
    const id = await expense();
    const key = randomUUID();
    const blockingPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const contenderPool = new Pool({
      connectionString: fixture.connectionString,
      max: 1,
      options: '-c lock_timeout=500 -c statement_timeout=10000',
    });
    const blockingDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: blockingPool }) });
    const contenderDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: contenderPool }) });
    let held!: () => void;
    let release!: () => void;
    const heldPromise = new Promise<void>((resolve) => {
      held = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    let blocking: Promise<void> | undefined;
    try {
      const firstPid = (await blockingPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      const secondPid = (await contenderPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      expect(firstPid).not.toBe(secondPid);
      blocking = blockingDb.transaction().execute(async (tx) => {
        await tx.selectFrom('books').select('id').where('id', '=', book).forUpdate().execute();
        held();
        await releasePromise;
      });
      await heldPromise;
      let attempts = 0;
      let actualTimeouts = 0;
      const real = new KyselyFinancialTransactionPort(contenderDb);
      const injected = {
        runInTransaction: <T>(fn: (ctx: FinancialTransactionContext) => Promise<T>) =>
          real.runInTransaction((ctx) =>
            fn({
              ...ctx,
              locks: {
                acquireLocks: async (spec) => {
                  attempts++;
                  try {
                    await ctx.locks.acquireLocks(spec);
                  } catch (error) {
                    if ((error as { code?: string }).code === '55P03') {
                      actualTimeouts++;
                      release();
                    }
                    throw error;
                  }
                },
              },
            }),
          ),
      };
      const service = new CreateRefund(
        injected,
        { generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase() },
        () => now,
      );
      const pending = service.execute(id, refundInput('100.00'), key, randomUUID());
      const deadline = Date.now() + 5000;
      let observed = false;
      while (Date.now() < deadline && !observed) {
        const activity = await fixture.pool.query(
          'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
          [secondPid],
        );
        observed =
          activity.rows[0]?.blockers.includes(firstPid) &&
          activity.rows[0]?.wait_event_type === 'Lock';
      }
      expect(observed).toBe(true);
      await expect(pending).resolves.toMatchObject({ amount: '100.00' });
      await blocking;
      expect(actualTimeouts).toBe(1);
      expect(attempts).toBe(2);
      const final = await state(id);
      expect(final.refunds).toHaveLength(1);
      expect(final.audit.map((event) => event.action)).toEqual(['TRANSACTION_REFUND_CREATED']);
      expect(
        await fixture.db
          .selectFrom('idempotency_keys')
          .selectAll()
          .where('idempotency_key', '=', key)
          .execute(),
      ).toHaveLength(1);
    } finally {
      release?.();
      if (blocking) await blocking;
      await blockingDb.destroy();
      await contenderDb.destroy();
    }
  });

  it('retries a real PostgreSQL deadlock after rolling back the victim transaction', async () => {
    const anotherBook = randomUUID();
    await fixture.run((ctx) =>
      ctx.books.create({
        id: anotherBook,
        name: anotherBook,
        normalizedName: anotherBook,
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const firstPool = new Pool({
      connectionString: fixture.connectionString,
      max: 1,
      options: '-c statement_timeout=10000 -c deadlock_timeout=5000ms',
    });
    const secondPool = new Pool({
      connectionString: fixture.connectionString,
      max: 1,
      options: '-c statement_timeout=10000 -c deadlock_timeout=100ms',
    });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let held!: () => void;
    let startFirstWait!: () => void;
    let firstBlocked!: () => void;
    const heldPromise = new Promise<void>((resolve) => {
      held = resolve;
    });
    const startFirstWaitPromise = new Promise<void>((resolve) => {
      startFirstWait = resolve;
    });
    const firstBlockedPromise = new Promise<void>((resolve) => {
      firstBlocked = resolve;
    });
    let first: Promise<void> | undefined;
    try {
      const firstPid = (await firstPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      const secondPid = (await secondPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      expect(firstPid).not.toBe(secondPid);
      first = firstDb.transaction().execute(async (tx) => {
        await tx.selectFrom('books').select('id').where('id', '=', book).forUpdate().execute();
        held();
        await startFirstWaitPromise;
        await tx
          .selectFrom('books')
          .select('id')
          .where('id', '=', anotherBook)
          .forUpdate()
          .execute();
      });
      await heldPromise;
      let attempts = 0;
      const second = new KyselyFinancialTransactionPort(secondDb).runInTransaction(async (ctx) => {
        attempts++;
        await ctx.locks.acquireLocks({ books: [anotherBook] });
        if (attempts === 1) {
          startFirstWait();
          await firstBlockedPromise;
          await ctx.locks.acquireLocks({ books: [book] });
        }
        return 'recovered';
      });
      const deadline = Date.now() + 5000;
      let observed = false;
      while (Date.now() < deadline && !observed) {
        const activity = await fixture.pool.query(
          'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
          [firstPid],
        );
        observed =
          activity.rows[0]?.blockers.includes(secondPid) &&
          activity.rows[0]?.wait_event_type === 'Lock';
      }
      expect(observed).toBe(true);
      firstBlocked();
      await expect(second).resolves.toBe('recovered');
      await first;
      expect(attempts).toBe(2);
    } finally {
      startFirstWait?.();
      firstBlocked?.();
      if (first) await first;
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });
});
