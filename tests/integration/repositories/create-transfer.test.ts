/**
 * M04-T04 — CreateTransfer PostgreSQL integration tests.
 *
 * Proves with real PostgreSQL:
 * - Transfer persisted and record returned equivalent
 * - FKs satisfied (source/destination accounts)
 * - Inactive Book/Account rejection
 * - Future date rejection using real Book timezone
 * - Currency mismatch rejection via composite FK
 * - Structural CHECK constraints (destination_account_id NOT NULL, category_id IS NULL, etc.)
 * - Same-account rejection at Core and DB level
 * - Cross-Book rejection
 * - Prohibited fields (categoryId, merchantId, refundOfTransactionId)
 * - Deterministic account lock sorting
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createTransfer,
  type CreateTransferDependencies,
  type FinancialTransactionContext,
} from '@finance-hub/core';
import { t02Database } from './t02-fixtures.js';
import {
  archiveBook,
  archiveAccount,
  updateBook,
  updateAccount,
  type MasterDataTransactionContextT04,
} from '@finance-hub/core';
import {
  coordinatedFinancialCreateRace,
  coordinatedFinancialPair,
} from '../helpers/financial-create-race.js';

const db = t02Database();

function makeDeps(overrides: Partial<CreateTransferDependencies> = {}): CreateTransferDependencies {
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
  const sourceAccountId = randomUUID();
  await ctx.accounts.create({
    id: sourceAccountId,
    bookId,
    name: 'Source Account',
    normalizedName: `integration-source-${sourceAccountId}`,
    type: 'checking',
    currency: 'BRL',
    institutionName: null,
    notes: null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const destAccountId = randomUUID();
  await ctx.accounts.create({
    id: destAccountId,
    bookId,
    name: 'Dest Account',
    normalizedName: `integration-dest-${destAccountId}`,
    type: 'checking',
    currency: 'BRL',
    institutionName: null,
    notes: null,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { bookId, sourceAccountId, destAccountId };
}

describe('M04-T04 CreateTransfer PostgreSQL integration', () => {
  describe('successful creation', () => {
    it('persists transfer and returns equivalent record with all FKs satisfied', async () => {
      const result = await db.run(async (ctx) => {
        const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createTransfer(
          {
            type: 'transfer',
            bookId,
            accountId: sourceAccountId,
            destinationAccountId: destAccountId,
            amount: '500.00',
            description: 'Integration test transfer',
            transactionDate: '2026-10-21',
          },
          ctx,
          deps,
        );
        expect(record.type).toBe('transfer');
        expect(record.status).toBe('posted');
        expect(record.version).toBe(1);
        expect(record.source).toBe('direct_api');
        expect(record.amount).toBe('500.00');
        expect(record.currency).toBe('BRL');
        expect(record.accountId).toBe(sourceAccountId);
        expect(record.destinationAccountId).toBe(destAccountId);
        expect(record.categoryId).toBeNull();
        expect(record.merchantId).toBeNull();
        expect(record.refundOfTransactionId).toBeNull();
        expect(record.transactionDate).toBe('2026-10-21');
        expect(record.description).toBe('Integration test transfer');

        // Verify in DB
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.id).toBe(record.id);
        expect(persisted!.type).toBe('transfer');
        expect(persisted!.destinationAccountId).toBe(destAccountId);
        expect(persisted!.categoryId).toBeNull();
        expect(persisted!.merchantId).toBeNull();
        expect(persisted!.refundOfTransactionId).toBeNull();
        return record;
      });
      expect(result).toBeDefined();
    });
  });

  describe('same-account rejection', () => {
    it('rejects transfer when source equals destination at Core level', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId } = await seedTargets(ctx);
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: sourceAccountId,
              amount: '100.00',
              description: 'Same account',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'TRANSFER_SAME_ACCOUNT' });
    });
  });

  describe('cross-book rejection', () => {
    it('rejects transfer when accounts belong to different Books', async () => {
      await expect(
        db.run(async (ctx) => {
          const now = new Date('2026-10-21T12:00:00Z');
          const book1Id = randomUUID();
          const book2Id = randomUUID();
          await ctx.books.create({
            id: book1Id,
            name: 'Book 1',
            normalizedName: `book-1-${book1Id}`,
            currency: 'BRL',
            timezone: 'UTC',
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          await ctx.books.create({
            id: book2Id,
            name: 'Book 2',
            normalizedName: `book-2-${book2Id}`,
            currency: 'BRL',
            timezone: 'UTC',
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const sourceAccountId = randomUUID();
          await ctx.accounts.create({
            id: sourceAccountId,
            bookId: book1Id,
            name: 'Source',
            normalizedName: `source-${sourceAccountId}`,
            type: 'checking',
            currency: 'BRL',
            institutionName: null,
            notes: null,
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const destAccountId = randomUUID();
          await ctx.accounts.create({
            id: destAccountId,
            bookId: book2Id,
            name: 'Dest',
            normalizedName: `dest-${destAccountId}`,
            type: 'checking',
            currency: 'BRL',
            institutionName: null,
            notes: null,
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId: book1Id,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Cross book',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'CROSS_BOOK_TRANSFER_NOT_SUPPORTED' });
    });
    it('leaves no Transaction when real Accounts belong to different Books', async () => {
      const ids = await db.run(seedTargets);
      const other = await db.run(async (ctx) => {
        const now = new Date('2026-10-21T12:00:00Z');
        const bookId = randomUUID();
        const accountId = randomUUID();
        await ctx.books.create({
          id: bookId,
          name: 'Other',
          normalizedName: `other-${bookId}`,
          currency: 'USD',
          timezone: 'UTC',
          active: true,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.accounts.create({
          id: accountId,
          bookId,
          name: 'Other',
          normalizedName: `other-${accountId}`,
          type: 'checking',
          currency: 'USD',
          institutionName: null,
          notes: null,
          active: true,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        return accountId;
      });
      const before = await db.pool.query('select count(*)::int as total from transactions');
      await expect(
        db.run((ctx) =>
          createTransfer({ ...transferInput(ids), destinationAccountId: other }, ctx, makeDeps()),
        ),
      ).rejects.toMatchObject({ code: 'CROSS_BOOK_TRANSFER_NOT_SUPPORTED' });
      const after = await db.pool.query('select count(*)::int as total from transactions');
      expect(after.rows[0].total).toBe(before.rows[0].total);
    });
  });

  describe('inactive entity rejection', () => {
    it('rejects transfer when source Account is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.accounts.archive({
            id: sourceAccountId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Inactive source',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });

    it('rejects transfer when destination Account is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.accounts.archive({
            id: destAccountId,
            active: false,
            archivedAt: now,
            updatedAt: now,
          });
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Inactive dest',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });

    it('rejects transfer when Book is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.books.archive({ id: bookId, active: false, archivedAt: now, updatedAt: now });
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Inactive book',
              transactionDate: '2026-10-21',
            },
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'BOOK_INACTIVE' });
    });
  });

  describe('future date rejection', () => {
    it('rejects future transaction_date using real Book timezone', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const deps = makeDeps({ now: new Date('2026-10-21T12:00:00Z') });
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
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

  describe('prohibited fields', () => {
    it('rejects categoryId field', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Prohibited cat',
              transactionDate: '2026-10-21',
              categoryId: 'cat-1',
            } as any,
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects merchantId field', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Prohibited merch',
              transactionDate: '2026-10-21',
              merchantId: 'merch-1',
            } as any,
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects refundOfTransactionId field', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, sourceAccountId, destAccountId } = await seedTargets(ctx);
          const deps = makeDeps();
          await createTransfer(
            {
              type: 'transfer',
              bookId,
              accountId: sourceAccountId,
              destinationAccountId: destAccountId,
              amount: '100.00',
              description: 'Prohibited refund',
              transactionDate: '2026-10-21',
              refundOfTransactionId: 'ref-1',
            } as any,
            ctx,
            deps,
          );
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});

type Targets = Awaited<ReturnType<typeof seedTargets>>;
type RaceKind =
  | 'book-archive'
  | 'source-archive'
  | 'destination-archive'
  | 'book-currency'
  | 'source-currency'
  | 'destination-currency'
  | 'source-type'
  | 'destination-type';
const raceKinds: RaceKind[] = [
  'book-archive',
  'source-archive',
  'destination-archive',
  'book-currency',
  'source-currency',
  'destination-currency',
  'source-type',
  'destination-type',
];

function transferInput(ids: Targets) {
  return {
    type: 'transfer' as const,
    bookId: ids.bookId,
    accountId: ids.sourceAccountId,
    destinationAccountId: ids.destAccountId,
    amount: '11.00',
    description: 'Concurrent transfer',
    transactionDate: '2026-10-21',
  };
}

async function configOperation(kind: RaceKind, ids: Targets, ctx: MasterDataTransactionContextT04) {
  const now = new Date('2026-10-21T12:00:00Z');
  const accountId = kind.startsWith('source') ? ids.sourceAccountId : ids.destAccountId;
  switch (kind) {
    case 'book-archive':
      return archiveBook(ids.bookId, ctx, now);
    case 'source-archive':
    case 'destination-archive':
      return archiveAccount(accountId, ctx, now);
    case 'book-currency':
      return updateBook({ id: ids.bookId, currency: 'USD' }, ctx, now);
    case 'source-currency':
    case 'destination-currency':
      return updateAccount({ id: accountId, currency: 'USD' }, ctx, now);
    case 'source-type':
    case 'destination-type':
      return updateAccount({ id: accountId, type: 'savings' }, ctx, now);
  }
}

describe('M04-T04 structural PostgreSQL constraints', () => {
  it.each([
    [
      'transactions_transfer_different_accounts',
      (id: Targets) => ['destination_account_id', id.sourceAccountId],
    ],
    ['transactions_transfer_requires_destination', () => ['destination_account_id', null]],
    [
      'transactions_transfer_no_refund',
      (_: Targets, transactionId: string) => ['refund_of_transaction_id', transactionId],
    ],
  ] as const)('%s rejects a direct physical violation', async (constraint, change) => {
    const { ids, recordId } = await db.run(async (ctx) => {
      const ids = await seedTargets(ctx);
      const record = await createTransfer(transferInput(ids), ctx, makeDeps());
      return { ids, recordId: record.id };
    });
    const [column, value] = change(ids, recordId);
    await expect(
      db.pool.query(`update transactions set ${column} = $1 where id = $2`, [value, recordId]),
    ).rejects.toMatchObject({
      code: '23514',
      constraint:
        constraint === 'transactions_transfer_no_refund'
          ? 'transactions_refund_is_income'
          : constraint,
    });
    if (constraint === 'transactions_transfer_no_refund') {
      const check = await db.pool.query(
        'select pg_get_constraintdef(oid) as definition from pg_constraint where conname = $1',
        [constraint],
      );
      expect(check.rows[0]?.definition).toContain('refund_of_transaction_id IS NULL');
    }
    const persisted = await db.run((ctx) => ctx.transactions.findById(recordId));
    expect(persisted?.destinationAccountId).toBe(ids.destAccountId);
    expect(persisted?.refundOfTransactionId).toBeNull();
  });

  it('composite FK rejects Account currency different from its Book', async () => {
    const ids = await db.run(seedTargets);
    await expect(
      db.pool.query('update accounts set currency = $1 where id = $2', ['USD', ids.destAccountId]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('retries a colliding human_ref with the same logical ID and keeps the transaction usable', async () => {
    const ids = await db.run(seedTargets);
    const blocker = await db.run((ctx) =>
      createTransfer(
        transferInput(ids),
        ctx,
        makeDeps({ humanRefGenerator: { generate: () => 'TRANSFERREF0001' } }),
      ),
    );
    let attempts = 0;
    const logicalId = randomUUID();
    const created = await db.run(async (ctx) => {
      const record = await createTransfer(
        transferInput(ids),
        ctx,
        makeDeps({
          generateId: () => logicalId,
          humanRefGenerator: {
            generate: () => (++attempts === 1 ? 'TRANSFERREF0001' : 'TRANSFERREF0002'),
          },
        }),
      );
      expect(await ctx.transactions.findById(blocker.id)).not.toBeNull();
      expect(await ctx.transactions.findById(logicalId)).not.toBeNull();
      return record;
    });
    expect(attempts).toBe(2);
    expect(created.id).toBe(logicalId);
    expect(created.humanRef).toBe('TRANSFERREF0002');
  });
});

describe('M04-T04 real PostgreSQL configuration races', { timeout: 30000 }, () => {
  it.each(raceKinds)('%s: configuration first, Transfer re-reads', async (kind) => {
    const ids = await db.run(seedTargets);
    const [configuration, creation] = await coordinatedFinancialCreateRace(
      db.connectionString,
      db.pool,
      true,
      (ctx) => configOperation(kind, ids, ctx),
      (ctx) => createTransfer(transferInput(ids), ctx, makeDeps()),
    );
    if (kind.endsWith('archive')) {
      expect(configuration.status).toBe('fulfilled');
      expect(creation).toMatchObject({
        status: 'rejected',
        reason: { code: kind === 'book-archive' ? 'BOOK_INACTIVE' : 'ACCOUNT_INACTIVE' },
      });
    } else if (kind.endsWith('type')) {
      expect(configuration.status).toBe('fulfilled');
      expect(creation.status).toBe('fulfilled');
    } else {
      expect(configuration).toMatchObject({
        status: 'rejected',
        reason: { code: kind === 'book-currency' ? 'IMMUTABILITY_ERROR' : 'CURRENCY_MISMATCH' },
      });
      expect(creation.status).toBe('fulfilled');
    }
  });

  it.each(raceKinds)('%s: Transfer first, mutation observes history', async (kind) => {
    const ids = await db.run(seedTargets);
    const [creation, configuration] = await coordinatedFinancialCreateRace(
      db.connectionString,
      db.pool,
      false,
      (ctx) => configOperation(kind, ids, ctx),
      (ctx) => createTransfer(transferInput(ids), ctx, makeDeps()),
    );
    expect(creation.status).toBe('fulfilled');
    if (kind.endsWith('archive')) {
      expect(configuration.status).toBe('fulfilled');
    } else {
      expect(configuration).toMatchObject({
        status: 'rejected',
        reason: { code: 'IMMUTABILITY_ERROR' },
      });
    }
    const recordId = creation.status === 'fulfilled' ? (creation.value as { id: string }).id : '';
    await db.run(async (ctx) => {
      expect(await ctx.transactions.findById(recordId)).not.toBeNull();
      expect(await ctx.financialUsage.hasAccountUsage(ids.sourceAccountId)).toBe(true);
      expect(await ctx.financialUsage.hasAccountUsage(ids.destAccountId)).toBe(true);
    });
  });
});

describe('M04-T04 overlapping reverse transfers', { timeout: 30000 }, () => {
  it('locks the same UUID-ascending Account set in both directions and commits both', async () => {
    const ids = await db.run(seedTargets);
    const forward = transferInput(ids);
    const reverse = {
      ...forward,
      accountId: ids.destAccountId,
      destinationAccountId: ids.sourceAccountId,
    };
    const results = await coordinatedFinancialPair(
      db.connectionString,
      db.pool,
      (ctx) => createTransfer(forward, ctx, makeDeps()),
      (ctx) => createTransfer(reverse, ctx, makeDeps()),
      (first, second) => {
        expect(first).toEqual([ids.sourceAccountId, ids.destAccountId].sort());
        expect(second).toEqual(first);
      },
    );
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    for (const result of results) {
      if (result.status !== 'fulfilled') throw result.reason;
      const record = result.value as { id: string };
      const persisted = await db.run((ctx) => ctx.transactions.findById(record.id));
      expect(persisted?.type).toBe('transfer');
      expect(persisted?.destinationAccountId).not.toBeNull();
    }
  });
});
