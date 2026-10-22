/**
 * M04-T03 CreateOrdinaryIncome PostgreSQL integration tests.
 *
 * Proves with real PostgreSQL:
 * - Income persisted and record returned equivalent
 * - FKs satisfied
 * - Inactive Book/Account/Category/Merchant rejection
 * - Future date rejection using real Book timezone
 * - Currency mismatch rejection via composite FK
 * - Structural CHECK constraints (destination_account_id IS NULL, refund_of_transaction_id IS NULL)
 * - human_ref uniqueness
 * - Collision forced + retry within same transaction
 * - Bounded exhaustion after 3 candidates
 * - Transaction remains usable after handled collision
 * - Concurrency: both orders for Income create vs Book/Account/Category/Merchant archive
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createOrdinaryIncome,
  archiveBook,
  archiveAccount,
  archiveCategory,
  archiveMerchant,
  updateBook,
  updateAccount,
  type CreateIncomeDependencies,
  type FinancialTransactionContext,
  type MasterDataTransactionContextT04,
} from '@finance-hub/core';
import { t02Database } from './t02-fixtures.js';
import { coordinatedFinancialCreateRace } from '../helpers/financial-create-race.js';

const db = t02Database();

function makeDeps(overrides: Partial<CreateIncomeDependencies> = {}): CreateIncomeDependencies {
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
    type: 'income',
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

describe('M04-T03 CreateOrdinaryIncome PostgreSQL integration', () => {
  describe('successful creation', () => {
    it('persists income and returns equivalent record with all FKs satisfied', async () => {
      const result = await db.run(async (ctx) => {
        const { bookId, accountId, categoryId, merchantId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createOrdinaryIncome(
          {
            type: 'income',
            bookId,
            accountId,
            amount: '150.50',
            description: 'Integration test income',
            transactionDate: '2026-10-21',
            categoryId,
            merchantId,
            notes: 'Test notes',
            sourceReference: 'REF-001',
          },
          ctx,
          deps,
        );
        expect(record.type).toBe('income');
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
        expect(record.description).toBe('Integration test income');
        expect(record.notes).toBe('Test notes');
        expect(record.sourceReference).toBe('REF-001');
        const persisted = await ctx.transactions.findById(record.id);
        expect(persisted).not.toBeNull();
        expect(persisted!.id).toBe(record.id);
        expect(persisted!.humanRef).toBe(record.humanRef);
        expect(persisted!.amount).toBe(record.amount);
        expect(persisted!.type).toBe('income');
        expect(persisted!.status).toBe('posted');
        return record;
      });
      const persisted = await db.pool.query(
        'select type, status, book_id, account_id, category_id, merchant_id, destination_account_id, refund_of_transaction_id, currency, source, version, amount::text as amount from transactions where id = $1',
        [result.id],
      );
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]).toMatchObject({
        type: 'income',
        status: 'posted',
        book_id: result.bookId,
        account_id: result.accountId,
        category_id: result.categoryId,
        merchant_id: result.merchantId,
        destination_account_id: null,
        refund_of_transaction_id: null,
        currency: 'BRL',
        source: 'direct_api',
        version: 1,
        amount: '150.50',
      });
    });

    it('creates income without optional category and merchant', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createOrdinaryIncome(
          {
            type: 'income',
            bookId,
            accountId,
            amount: '50.00',
            description: 'Minimal income',
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
    it('rejects income when Book is inactive', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.books.archive({ id: bookId, active: false, archivedAt: now, updatedAt: now });
          const deps = makeDeps();
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Account is inactive', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Category is inactive', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Merchant is inactive', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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
          await createOrdinaryIncome(
            {
              type: 'income',
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
    it('persists income with destination_account_id IS NULL and refund_of_transaction_id IS NULL', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createOrdinaryIncome(
          {
            type: 'income',
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

    it('PostgreSQL CHECK rejects a destination account for Income', async () => {
      const record = await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        return createOrdinaryIncome(
          {
            type: 'income',
            bookId,
            accountId,
            amount: '25.00',
            description: 'CHECK proof',
            transactionDate: '2026-10-21',
          },
          ctx,
          makeDeps(),
        );
      });
      await expect(
        db.pool.query('update transactions set destination_account_id = $1 where id = $2', [
          record.accountId,
          record.id,
        ]),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'transactions_expense_income_no_destination',
      });
      const persisted = await db.run((ctx) => ctx.transactions.findById(record.id));
      expect(persisted?.destinationAccountId).toBeNull();
      expect(persisted?.refundOfTransactionId).toBeNull();
    });
  });

  describe('human_ref collision protocol', () => {
    it('handles forced collision and retries within same transaction', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId } = await seedTargets(ctx);
        const deps1 = makeDeps({
          humanRefGenerator: { generate: () => 'COLLISION00001' },
        });
        const first = await createOrdinaryIncome(
          {
            type: 'income',
            bookId,
            accountId,
            amount: '10.00',
            description: 'First income',
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
        const second = await createOrdinaryIncome(
          {
            type: 'income',
            bookId,
            accountId,
            amount: '20.00',
            description: 'Second income with collision',
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
            type: 'income',
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
          await createOrdinaryIncome(
            {
              type: 'income',
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
          type: 'income',
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
        const record = await createOrdinaryIncome(
          {
            type: 'income',
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

  describe('concurrency: income vs archive ordering', () => {
    it('rejects income when Book is archived before creation (configuration-first)', async () => {
      await expect(
        db.run(async (ctx) => {
          const { bookId, accountId } = await seedTargets(ctx);
          const now = new Date('2026-10-21T12:00:00Z');
          await ctx.books.archive({ id: bookId, active: false, archivedAt: now, updatedAt: now });
          const deps = makeDeps();
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Account is archived before creation (configuration-first)', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Category is archived before creation (configuration-first)', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('rejects income when Merchant is archived before creation (configuration-first)', async () => {
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
          await createOrdinaryIncome(
            {
              type: 'income',
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

    it('allows Category archive after income creation (historical reference preserved)', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId, categoryId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createOrdinaryIncome(
          {
            type: 'income',
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

    it('allows Merchant archive after income creation (historical reference preserved)', async () => {
      await db.run(async (ctx) => {
        const { bookId, accountId, merchantId } = await seedTargets(ctx);
        const deps = makeDeps();
        const record = await createOrdinaryIncome(
          {
            type: 'income',
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

async function incomeOperation(kind: RaceKind, ids: Targets, ctx: FinancialTransactionContext) {
  return createOrdinaryIncome(
    {
      type: 'income',
      bookId: ids.bookId,
      accountId: ids.accountId,
      categoryId: kind === 'category-archive' ? ids.categoryId : null,
      merchantId: kind === 'merchant-archive' ? ids.merchantId : null,
      amount: '11.00',
      description: 'Concurrent income',
      transactionDate: '2026-10-21',
    },
    ctx,
    makeDeps(),
  );
}

async function coordinatedRace(kind: RaceKind, configFirst: boolean, ids: Targets) {
  return coordinatedFinancialCreateRace(
    db.connectionString,
    db.pool,
    configFirst,
    (ctx) => configOperation(kind, ids, ctx),
    (ctx) => incomeOperation(kind, ids, ctx),
  );
}

describe('M04-T03 real PostgreSQL configuration races', { timeout: 30000 }, () => {
  it.each([
    'book-archive',
    'account-archive',
    'category-archive',
    'merchant-archive',
    'book-currency',
    'account-currency',
    'account-type',
  ] as const)('%s: configuration first, income waits and re-reads', async (kind) => {
    const ids = await db.run(seedTargets);
    const [configuration, income] = await coordinatedRace(kind, true, ids);
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
      expect(income).toMatchObject({ status: 'rejected', reason: { code } });
    } else if (kind === 'account-type') {
      expect(configuration.status).toBe('fulfilled');
      expect(income.status).toBe('fulfilled');
      const account = await db.run((ctx) => ctx.accounts.findById(ids.accountId));
      expect(account?.type).toBe('savings');
    } else {
      const code = kind === 'account-currency' ? 'CURRENCY_MISMATCH' : 'IMMUTABILITY_ERROR';
      expect(configuration).toMatchObject({ status: 'rejected', reason: { code } });
      expect(income.status).toBe('fulfilled');
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
  ] as const)('%s: income first, mutation observes committed history', async (kind) => {
    const ids = await db.run(seedTargets);
    const [income, configuration] = await coordinatedRace(kind, false, ids);
    expect(income.status).toBe('fulfilled');
    if (kind.endsWith('archive')) {
      expect(configuration.status).toBe('fulfilled');
      const record = income.status === 'fulfilled' ? (income.value as { id: string }) : null;
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
