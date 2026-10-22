/**
 * M04-T02 — CreateExpense PostgreSQL integration tests.
 *
 * Proves with real PostgreSQL:
 * - Expense persisted and record returned equivalent
 * - FKs satisfied
 * - Inactive Book/Account/Category/Merchant rejection
 * - Future date rejection using real Book timezone
 * - Currency mismatch rejection via composite FK
 * - Structural CHECK constraints (destination_account_id IS NULL, refund_of_transaction_id IS NULL)
 * - human_ref uniqueness
 * - Collision forced + retry within same transaction
 * - Bounded exhaustion after 3 candidates
 * - Transaction remains usable after handled collision
 * - Concurrency: both orders for Expense create vs Book/Account/Category/Merchant archive
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from '../../../packages/database/src/db-types.js';
import { KyselyFinancialTransactionPort, KyselyTransactionPort } from '@finance-hub/database';
import {
  createExpense,
  archiveBook,
  archiveAccount,
  archiveCategory,
  archiveMerchant,
  updateBook,
  updateAccount,
  type CreateExpenseDependencies,
  type FinancialTransactionContext,
  type MasterDataTransactionContextT04,
} from '@finance-hub/core';
import { t02Database } from './t02-fixtures.js';

const db = t02Database();

function makeDeps(overrides: Partial<CreateExpenseDependencies> = {}): CreateExpenseDependencies {
  return {
    humanRefGenerator: {
      generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
    },
    now: new Date('2026-10-21T12:00:00Z'),
    ...overrides,
  };
}

async function seedTargets(ctx: FinancialTransactionContext) {
  const now = new Date('2026-10-21T12:00:00Z');
  const bookId = randomUUID();
  await ctx.books.create({
    id: bookId,
    name: 'Integration Book',
    normalizedName: `integration-book-${bookId}`,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const accountId = randomUUID();
  await ctx.accounts.create({
    id: accountId,
    bookId,
    name: 'Integration Account',
    normalizedName: `integration-account-${accountId}`,
    type: 'checking',
    currency: 'BRL',
    institutionName: null,
    notes: null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const categoryId = randomUUID();
  await ctx.categories.create({
    id: categoryId,
    bookId,
    name: 'Integration Category',
    normalizedName: `integration-category-${categoryId}`,
    parentCategoryId: null,
    type: 'expense',
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const merchantId = randomUUID();
  await ctx.merchants.create({
    id: merchantId,
    name: 'Integration Merchant',
    normalizedName: `integration-merchant-${merchantId}`,
    type: null,
    taxIdentifier: null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { bookId, accountId, categoryId, merchantId };
}

describe('M04-T02 CreateExpense PostgreSQL integration', () => {
  describe('successful creation', () => {
    it('persists expense and returns equivalent record with all FKs satisfied', async () => {
      const result = await db.run(async (ctx) => {
        const { bookId, accountId, categoryId, merchantId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '150.50',
            description: 'Integration test expense',
            transactionDate: '2026-10-21',
            categoryId,
            merchantId,
            notes: 'Test notes',
            sourceReference: 'REF-001',
          },
          ctx,
          deps,
        );
        expect(record.type).toBe('expense');
        expect(record.status).toBe('posted');
        expect(record.version).toBe(1);
        expect(record.source).toBe('direct_api');
        expect(record.amount).toBe('150.50');
        expect(record.currency).toBe('BRL');
        expect(record.destinationAccountId).toBeNull();
        expect(record.refundOfTransactionId).toBeNull();
        expect(record.bookId).toBe(bookId);
        expect(record.accountId).toBe(accountId);
        expect(record.categoryId).toBe(categoryId);
        expect(record.merchantId).toBe(merchantId);
        expect(record.transactionDate).toBe('2026-10-21');
        expect(record.description).toBe('Integration test expense');
        expect(record.notes).toBe('Test notes');
        expect(record.sourceReference).toBe('REF-001');
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.id).toBe(record.id);
        expect(persisted!.humanRef).toBe(record.humanRef);
        expect(persisted!.amount).toBe(record.amount);
        expect(persisted!.type).toBe('expense');
        expect(persisted!.status).toBe('posted');
        return record;
      });
      expect(result).toBeDefined();
    });

    it('creates expense without optional category and merchant', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '50.00',
            description: 'Minimal expense',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps,
        );
        expect(record.categoryId).toBeNull();
        expect(record.merchantId).toBeNull();
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted!.categoryId).toBeNull();
        expect(persisted!.merchantId).toBeNull();
      });
    });
  });

  describe('inactive entity rejection', () => {
    it('rejects expense when Book is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.books.archive({ id: bookId, active: false, archivedAt: now, updatedAt: now });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'BOOK_INACTIVE' });
    });

    it('rejects expense when Account is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.accounts.archive({
            id: accountId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });

    it('rejects expense when Category is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId, categoryId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.categories.archive({
            id: categoryId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail',
              transactionDate: '2026-10-21',
              categoryId,
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
    });

    it('rejects expense when Merchant is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId, merchantId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.merchants.archive({
            id: merchantId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail',
              transactionDate: '2026-10-21',
              merchantId,
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'MERCHANT_INACTIVE' });
    });
  });

  describe('future date rejection', () => {
    it('rejects future transaction_date using real Book timezone', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const deps = makeDeps({ now: new Date('2026-10-21T12:00:00Z') });
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Future date',
              transactionDate: '2026-12-31',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'TRANSACTION_DATE_IN_FUTURE' });
    });
  });

  describe('currency mismatch', () => {
    it('composite FK prevents Account currency differing from Book currency', async () => {
      await expect(
        db.run(async (ctx) => {
          const now = new Date('2026-10-21T12:00:00Z');
          const bookId = randomUUID();
          await ctx.books.create({
            id: bookId,
            name: 'USD Book',
            normalizedName: `usd-book-${bookId}`,
            currency: 'USD',
            timezone: 'America/Sao_Paulo',
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const accountId = randomUUID();
          await ctx.accounts.create({
            id: accountId,
            bookId,
            name: 'BRL Account',
            normalizedName: `brl-account-${accountId}`,
            type: 'checking',
            currency: 'BRL',
            institutionName: null,
            notes: null,
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }),
      ).rejects.toMatchObject({ code: '23503', constraint: 'fk_accounts_book_currency' });
    });
  });

  describe('structural constraints', () => {
    it('persists expense with destination_account_id IS NULL and refund_of_transaction_id IS NULL', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '25.00',
            description: 'Structural check',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps,
        );
        expect(record.destinationAccountId).toBeNull();
        expect(record.refundOfTransactionId).toBeNull();
      });
    });
  });

  describe('human_ref collision protocol', () => {
    it('handles forced collision and retries within same transaction', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps1 = makeDeps({
          humanRefGenerator: { generate: () => 'COLLISION00001' },
        });
        const first = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '10.00',
            description: 'First expense',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps1,
        );
        expect(first.humanRef).toBe('COLLISION00001');

        let callCount = 0;
        const deps2 = makeDeps({
          humanRefGenerator: {
            generate: () => {
              callCount++;
              return callCount === 1 ? 'COLLISION00001' : 'COLLISION00002';
            },
          },
        });
        const second = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '20.00',
            description: 'Second expense with collision',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps2,
        );
        expect(second.humanRef).toBe('COLLISION00002');
        expect(callCount).toBe(2);

        const p1 = await ctx.transactions.findById(first.id);
        const p2 = await ctx.transactions.findById(second.id);
        expect(p1).not.toBeNull();
        expect(p2).not.toBeNull();
      });
    });

    it('throws after exhausting 3 human_ref candidates', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const deps = makeDeps({
            humanRefGenerator: { generate: () => 'EXHAUST0000001' },
          });
          await ctx.transactions.create({
            type: 'expense',
            id: randomUUID(),
            humanRef: 'EXHAUST0000001',
            source: 'direct_api',
            currency: 'BRL',
            bookId,
            amount: '1.00',
            accountId,
            description: 'Pre-existing',
            transactionDate: '2026-10-21',
          });
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Exhaustion test',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toThrow(/Failed to generate unique human_ref after 3 attempts/);
    });

    it('transaction remains usable after handled collision', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        await ctx.transactions.create({
          type: 'expense',
          id: randomUUID(),
          humanRef: 'USABLE00000001',
          source: 'direct_api',
          currency: 'BRL',
          bookId,
          amount: '1.00',
          accountId,
          description: 'Blocker',
          transactionDate: '2026-10-21',
        });

        let genCalls = 0;
        const deps = makeDeps({
          humanRefGenerator: {
            generate: () => {
              genCalls++;
              return genCalls === 1 ? 'USABLE00000001' : 'USABLE00000002';
            },
          },
        });
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '30.00',
            description: 'After collision',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps,
        );
        expect(record.humanRef).toBe('USABLE00000002');
        expect(genCalls).toBe(2);

        const blocker = await ctx.transactions.findByHumanRef('USABLE00000001');
        const created = await ctx.transactions.findByHumanRef('USABLE00000002');
        expect(blocker).not.toBeNull();
        expect(created).not.toBeNull();
      });
    });
  });

  describe('concurrency: expense vs archive ordering', () => {
    it('rejects expense when Book is archived before creation (configuration-first)', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.books.archive({ id: bookId, active: false, archivedAt: now, updatedAt: now });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail after archive',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'BOOK_INACTIVE' });
    });

    it('rejects expense when Account is archived before creation (configuration-first)', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.accounts.archive({
            id: accountId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail after account archive',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });

    it('rejects expense when Category is archived before creation (configuration-first)', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId, categoryId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.categories.archive({
            id: categoryId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail after category archive',
              transactionDate: '2026-10-21',
              categoryId,
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
    });

    it('rejects expense when Merchant is archived before creation (configuration-first)', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId, merchantId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.merchants.archive({
            id: merchantId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createExpense(
            {
              type: 'expense',
              bookId,
              accountId,
              amount: '10.00',
              description: 'Should fail after merchant archive',
              transactionDate: '2026-10-21',
              merchantId,
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'MERCHANT_INACTIVE' });
    });

    it('allows Category archive after expense creation (historical reference preserved)', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId, categoryId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '40.00',
            description: 'Before category archive',
            transactionDate: '2026-10-21',
            categoryId,
          },
          ctx,
          deps,
        );
        expect(record.categoryId).toBe(categoryId);
        const now = new Date('2026-10-21T12:00:00Z');
        await ctx.categories.archive({
          id: categoryId,
          active: false,
          archivedAt: now,
          updatedAt: now,
        });
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.categoryId).toBe(categoryId);
      });
    });

    it('allows Merchant archive after expense creation (historical reference preserved)', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId, merchantId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createExpense(
          {
            type: 'expense',
            bookId,
            accountId,
            amount: '45.00',
            description: 'Before merchant archive',
            transactionDate: '2026-10-21',
            merchantId,
          },
          ctx,
          deps,
        );
        expect(record.merchantId).toBe(merchantId);
        const now = new Date('2026-10-21T12:00:00Z');
        await ctx.merchants.archive({
          id: merchantId,
          active: false,
          archivedAt: now,
          updatedAt: now,
        });
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.merchantId).toBe(merchantId);
      });
    });
  });
});

type RaceKind =
  | 'book-archive'
  | 'account-archive'
  | 'category-archive'
  | 'merchant-archive'
  | 'book-currency'
  | 'account-currency'
  | 'account-type';
type Targets = Awaited<ReturnType<typeof seedTargets>>;

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

async function configOperation(kind: RaceKind, ids: Targets, ctx: MasterDataTransactionContextT04) {
  const now = new Date('2026-10-21T12:00:00Z');
  switch (kind) {
    case 'book-archive':
      return archiveBook(ids.bookId, ctx, now);
    case 'account-archive':
      return archiveAccount(ids.accountId, ctx, now);
    case 'category-archive':
      return archiveCategory(ids.categoryId, ctx, now);
    case 'merchant-archive':
      return archiveMerchant(ids.merchantId, ctx, now);
    case 'book-currency':
      return updateBook({ id: ids.bookId, currency: 'USD' }, ctx, now);
    case 'account-currency':
      return updateAccount({ id: ids.accountId, currency: 'USD' }, ctx, now);
    case 'account-type':
      return updateAccount({ id: ids.accountId, type: 'savings' }, ctx, now);
  }
}

async function expenseOperation(kind: RaceKind, ids: Targets, ctx: FinancialTransactionContext) {
  return createExpense(
    {
      type: 'expense',
      bookId: ids.bookId,
      accountId: ids.accountId,
      categoryId: kind === 'category-archive' ? ids.categoryId : null,
      merchantId: kind === 'merchant-archive' ? ids.merchantId : null,
      amount: '11.00',
      description: 'Concurrent expense',
      transactionDate: '2026-10-21',
    },
    ctx,
    makeDeps(),
  );
}

async function coordinatedRace(kind: RaceKind, configFirst: boolean, ids: Targets) {
  const pool1 = new Pool({
    connectionString: db.connectionString,
    max: 1,
    options: '-c statement_timeout=10000 -c lock_timeout=10000',
  });
  const pool2 = new Pool({
    connectionString: db.connectionString,
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
    expect(pid1).not.toBe(pid2);
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
          configOperation(kind, ids, await holdLocks(ctx)),
        )
      : new KyselyFinancialTransactionPort(db1).runInTransaction(async (ctx) =>
          expenseOperation(kind, ids, await holdLocks(ctx)),
        );
    const firstObserved = Promise.allSettled([first]);
    await bounded(held.promise);
    const second = configFirst
      ? new KyselyFinancialTransactionPort(db2).runInTransaction(async (ctx) =>
          expenseOperation(kind, ids, await markStarted(ctx)),
        )
      : new KyselyTransactionPort(db2).runInTransaction(async (ctx) =>
          configOperation(kind, ids, await markStarted(ctx)),
        );
    pending = Promise.allSettled([first, second]);
    await bounded(started.promise);
    await bounded(
      (async () => {
        for (;;) {
          const observed = await db.pool.query(
            'select pg_blocking_pids($1) as blockers, wait_event_type from pg_stat_activity where pid=$1',
            [pid2],
          );
          if (
            observed.rows[0]?.blockers.includes(pid1) &&
            observed.rows[0].wait_event_type === 'Lock'
          ) {
            break;
          }
        }
      })(),
    );
    release.release();
    const result = await bounded(pending);
    await firstObserved;
    return result;
  } finally {
    release.release();
    if (pending) await pending;
    await db1.destroy();
    await db2.destroy();
  }
}

describe('M04-T02 real PostgreSQL configuration races', { timeout: 30000 }, () => {
  it.each([
    'book-archive',
    'account-archive',
    'category-archive',
    'merchant-archive',
    'book-currency',
    'account-currency',
    'account-type',
  ] as const)('%s: configuration first, expense waits and re-reads', async (kind) => {
    const ids = await db.run(seedTargets);
    const [configuration, expense] = await coordinatedRace(kind, true, ids);
    if (kind.endsWith('archive')) {
      expect(configuration.status).toBe('fulfilled');
      const code =
        kind === 'book-archive'
          ? 'BOOK_INACTIVE'
          : kind === 'account-archive'
            ? 'ACCOUNT_INACTIVE'
            : kind === 'category-archive'
              ? 'CATEGORY_INACTIVE'
              : 'MERCHANT_INACTIVE';
      expect(expense).toMatchObject({ status: 'rejected', reason: { code } });
    } else if (kind === 'account-type') {
      expect(configuration.status).toBe('fulfilled');
      expect(expense.status).toBe('fulfilled');
      const account = await db.run((ctx) => ctx.accounts.findById(ids.accountId));
      expect(account?.type).toBe('savings');
    } else {
      const code = kind === 'account-currency' ? 'CURRENCY_MISMATCH' : 'IMMUTABILITY_ERROR';
      expect(configuration).toMatchObject({ status: 'rejected', reason: { code } });
      expect(expense.status).toBe('fulfilled');
    }
  });

  it.each([
    'book-archive',
    'account-archive',
    'category-archive',
    'merchant-archive',
    'book-currency',
    'account-currency',
    'account-type',
  ] as const)('%s: expense first, mutation observes committed history', async (kind) => {
    const ids = await db.run(seedTargets);
    const [expense, configuration] = await coordinatedRace(kind, false, ids);
    expect(expense.status).toBe('fulfilled');
    if (kind.endsWith('archive')) {
      expect(configuration.status).toBe('fulfilled');
      const record = expense.status === 'fulfilled' ? (expense.value as { id: string }) : null;
      const persisted = await db.run((ctx) => ctx.transactions.findById(record!.id));
      expect(persisted).not.toBeNull();
    } else {
      expect(configuration).toMatchObject({
        status: 'rejected',
        reason: { code: 'IMMUTABILITY_ERROR' },
      });
      await db.run(async (ctx) => {
        expect(await ctx.financialUsage.hasBookUsage(ids.bookId)).toBe(true);
        expect(await ctx.financialUsage.hasAccountUsage(ids.accountId)).toBe(true);
      });
    }
  });
});
