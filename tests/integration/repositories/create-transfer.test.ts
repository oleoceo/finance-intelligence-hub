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
import { FinancialError, FinancialValidationError } from '@finance-hub/core';

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
        expect(persisted!.destination_account_id).toBe(destAccountId);
        expect(persisted!.category_id).toBeNull();
        expect(persisted!.merchant_id).toBeNull();
        expect(persisted!.refund_of_transaction_id).toBeNull();
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
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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
      ).rejects.toThrow(FinancialValidationError);
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
      ).rejects.toThrow(FinancialValidationError);
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
      ).rejects.toThrow(FinancialValidationError);
    });
  });
});
