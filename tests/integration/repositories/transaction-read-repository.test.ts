import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { KyselyTransactionReadRepository } from '@finance-hub/database';
import { getTransaction, getLastTransaction, listTransactions } from '@finance-hub/core';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const ids = {
  bookA: randomUUID(),
  bookB: randomUUID(),
  empty: randomUUID(),
  accountA: randomUUID(),
  destination: randomUUID(),
  accountB: randomUUID(),
  category: randomUUID(),
  merchant: randomUUID(),
  expense: randomUUID(),
  income: randomUUID(),
  transfer: randomUUID(),
  refund: randomUUID(),
  voided: randomUUID(),
  other: randomUUID(),
  tieLow: '00000000-0000-4000-8000-000000000001',
  tieHigh: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};
const t = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`);

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    for (const [id, name] of [
      [ids.bookA, 'A'],
      [ids.bookB, 'B'],
      [ids.empty, 'Empty'],
    ]) {
      await ctx.books.create({
        id,
        name,
        normalizedName: `t05-${id}`,
        currency: 'BRL',
        timezone: 'UTC',
        active: true,
        archivedAt: null,
        createdAt: t(1),
        updatedAt: t(1),
      });
    }
    for (const [id, bookId] of [
      [ids.accountA, ids.bookA],
      [ids.destination, ids.bookA],
      [ids.accountB, ids.bookB],
    ]) {
      await ctx.accounts.create({
        id,
        bookId,
        name: `Account ${id}`,
        normalizedName: `t05-${id}`,
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: t(1),
        updatedAt: t(1),
      });
    }
    await ctx.categories.create({
      id: ids.category,
      bookId: ids.bookA,
      name: 'T05 Category',
      normalizedName: `t05-${ids.category}`,
      parentCategoryId: null,
      type: 'expense',
      active: true,
      archivedAt: null,
      createdAt: t(1),
      updatedAt: t(1),
    });
    await ctx.merchants.create({
      id: ids.merchant,
      name: 'T05 Merchant',
      normalizedName: `t05-${ids.merchant}`,
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: t(1),
      updatedAt: t(1),
    });
  });
  const rows = [
    {
      id: ids.expense,
      human_ref: 'HUMANONLY',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'expense',
      amount: '123.45',
      description: 'CoffeeCase',
      notes: null,
      source_reference: null,
      category_id: ids.category,
      merchant_id: ids.merchant,
      transaction_date: '2026-10-20',
      created_at: t(2),
    },
    {
      id: ids.income,
      human_ref: 'T05INCOME',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'income',
      amount: '25.00',
      description: 'ordinary income',
      notes: 'NoteNeedle',
      source_reference: null,
      transaction_date: '2026-10-15',
      created_at: t(3),
    },
    {
      id: ids.transfer,
      human_ref: 'T05TRANSFER',
      book_id: ids.bookA,
      account_id: ids.accountA,
      destination_account_id: ids.destination,
      type: 'transfer',
      amount: '10.00',
      description: 'transfer',
      notes: null,
      source_reference: 'SourceNeedle',
      transaction_date: '2026-10-10',
      created_at: t(4),
    },
    {
      id: ids.refund,
      human_ref: 'T05REFUND',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'income',
      amount: '23.45',
      description: 'refund',
      refund_of_transaction_id: ids.expense,
      transaction_date: '2026-10-11',
      created_at: t(5),
    },
    {
      id: ids.voided,
      human_ref: 'T05VOIDED',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'expense',
      amount: '9.00',
      description: 'voided',
      status: 'voided',
      voided_at: t(8),
      void_reason: 'fixture',
      transaction_date: '2026-10-21',
      created_at: t(8),
    },
    {
      id: ids.other,
      human_ref: 'T05OTHER',
      book_id: ids.bookB,
      account_id: ids.accountB,
      type: 'expense',
      amount: '8.00',
      description: 'other book',
      transaction_date: '2026-10-01',
      created_at: t(9),
    },
    {
      id: ids.tieLow,
      human_ref: 'T05TIELOW',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'expense',
      amount: '2.00',
      description: 'older date',
      transaction_date: '2026-10-20',
      created_at: t(7),
    },
    {
      id: ids.tieHigh,
      human_ref: 'T05TIEHIGH',
      book_id: ids.bookA,
      account_id: ids.accountA,
      type: 'expense',
      amount: '3.00',
      description: 'retroactive date',
      transaction_date: '2026-01-01',
      created_at: t(7),
    },
  ];
  for (const row of rows) {
    await fixture.db
      .insertInto('transactions')
      .values({
        id: row.id,
        human_ref: row.human_ref,
        book_id: row.book_id,
        account_id: row.account_id,
        destination_account_id:
          'destination_account_id' in row ? (row.destination_account_id ?? null) : null,
        category_id: 'category_id' in row ? (row.category_id ?? null) : null,
        merchant_id: 'merchant_id' in row ? (row.merchant_id ?? null) : null,
        type: row.type,
        status: 'status' in row ? (row.status ?? 'posted') : 'posted',
        amount: row.amount,
        currency: 'BRL',
        description: row.description,
        notes: row.notes ?? null,
        transaction_date: row.transaction_date,
        source: 'direct_api',
        source_reference: row.source_reference ?? null,
        inbox_message_id: null,
        refund_of_transaction_id:
          'refund_of_transaction_id' in row ? (row.refund_of_transaction_id ?? null) : null,
        version: 1,
        voided_at: 'voided_at' in row ? (row.voided_at ?? null) : null,
        void_reason: 'void_reason' in row ? (row.void_reason ?? null) : null,
        created_at: row.created_at,
        updated_at: row.created_at,
      })
      .execute();
  }
}, 180000);

const port = () => new KyselyTransactionReadRepository(fixture.db);

describe('M04-T05 PostgreSQL transaction reads', () => {
  it('gets full Expense, Income and Transfer records and maps all nullable fields', async () => {
    for (const [id, type] of [
      [ids.expense, 'expense'],
      [ids.income, 'income'],
      [ids.transfer, 'transfer'],
    ]) {
      const record = await getTransaction(id, { readPort: port() });
      expect(record).toMatchObject({
        id,
        type,
        status: 'posted',
        currency: 'BRL',
        source: 'direct_api',
        version: 1,
        isRefund: false,
      });
      expect(record?.amount).toMatch(/^\d+\.\d{2}$/);
      expect(record?.createdAt).toBeInstanceOf(Date);
      expect(record?.updatedAt).toBeInstanceOf(Date);
      expect(record?.voidedAt).toBeNull();
      expect(record?.voidReason).toBeNull();
      expect(record?.inboxMessageId).toBeNull();
    }
    expect(await getTransaction(ids.expense, { readPort: port() })).toMatchObject({
      amount: '123.45',
      transactionDate: '2026-10-20',
      categoryId: ids.category,
      merchantId: ids.merchant,
      destinationAccountId: null,
      notes: null,
      sourceReference: null,
      refundOfTransactionId: null,
    });
    expect(await getTransaction(ids.income, { readPort: port() })).toMatchObject({
      notes: 'NoteNeedle',
      categoryId: null,
      merchantId: null,
    });
    expect(await getTransaction(ids.transfer, { readPort: port() })).toMatchObject({
      destinationAccountId: ids.destination,
      sourceReference: 'SourceNeedle',
    });
    expect(await getTransaction(randomUUID(), { readPort: port() })).toBeNull();
  });

  it('derives refund flag from a physically valid Income refund relation', async () => {
    expect(await getTransaction(ids.refund, { readPort: port() })).toMatchObject({
      type: 'income',
      refundOfTransactionId: ids.expense,
      isRefund: true,
    });
    expect(await getTransaction(ids.income, { readPort: port() })).toMatchObject({
      type: 'income',
      refundOfTransactionId: null,
      isRefund: false,
    });
  });

  it('lists both Books by default and isolates a supplied Book', async () => {
    const all = await listTransactions({}, { readPort: port() });
    expect(all).toMatchObject({ total: 8, page: 1, pageSize: 50 });
    expect(all.items).toHaveLength(8);
    expect(new Set(all.items.map((item) => item.bookId))).toEqual(new Set([ids.bookA, ids.bookB]));
    const one = await listTransactions({ bookId: ids.bookA }, { readPort: port() });
    expect(one.total).toBe(7);
    expect(one.items.every((item) => item.bookId === ids.bookA)).toBe(true);
    expect(one.items.some((item) => item.status === 'voided')).toBe(true);
    expect(one.items.find((item) => item.id === ids.refund)?.isRefund).toBe(true);
  });

  it.each([
    [{ type: 'transfer' }, ids.transfer],
    [{ status: 'voided' }, ids.voided],
    [{ accountId: ids.accountB }, ids.other],
    [{ categoryId: ids.category }, ids.expense],
    [{ merchantId: ids.merchant }, ids.expense],
    [{ dateFrom: '2026-10-21' }, ids.voided],
    [{ dateTo: '2026-01-01' }, ids.tieHigh],
    [{ dateFrom: '2026-10-10', dateTo: '2026-10-10' }, ids.transfer],
    [{ search: 'coffeecase' }, ids.expense],
    [{ search: 'noteneedle' }, ids.income],
    [{ search: 'sourceneedle' }, ids.transfer],
  ] as const)('applies PostgreSQL filter %j', async (filter, id) => {
    const result = await listTransactions(filter, { readPort: port() });
    expect(result.items.map((item) => item.id)).toEqual([id]);
    expect(result.total).toBe(1);
  });

  it('does not search human_ref and applies filters to count and items', async () => {
    expect(await listTransactions({ search: 'HUMANONLY' }, { readPort: port() })).toMatchObject({
      total: 0,
      items: [],
    });
    const result = await listTransactions(
      { bookId: ids.bookA, status: 'posted', type: 'income' },
      { readPort: port() },
    );
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([ids.income, ids.refund]),
    );
    expect(
      await listTransactions(
        { dateFrom: '2026-10-21', dateTo: '2026-01-01' },
        { readPort: port() },
      ),
    ).toMatchObject({ total: 0, items: [] });
  });

  it('paginates after filtering and orders created_at then id descending', async () => {
    const page1 = await listTransactions({ bookId: ids.bookA, pageSize: 2 }, { readPort: port() });
    expect(page1).toMatchObject({ total: 7, page: 1, pageSize: 2 });
    expect(page1.items.map((item) => item.id)).toEqual([ids.voided, ids.tieHigh]);
    const page2 = await listTransactions(
      { bookId: ids.bookA, page: 2, pageSize: 2 },
      { readPort: port() },
    );
    expect(page2).toMatchObject({ total: 7, page: 2, pageSize: 2 });
    expect(page2.items.map((item) => item.id)).toEqual([ids.tieLow, ids.refund]);
    expect(
      await listTransactions({ bookId: ids.bookA, page: 9, pageSize: 2 }, { readPort: port() }),
    ).toMatchObject({ total: 7, page: 9, pageSize: 2, items: [] });
  });

  it('gets latest created posted by Book, ignoring voided and transaction_date', async () => {
    expect(await getLastTransaction({ bookId: ids.bookA }, { readPort: port() })).toMatchObject({
      id: ids.tieHigh,
      status: 'posted',
      transactionDate: '2026-01-01',
    });
    expect(await getLastTransaction({ bookId: ids.bookB }, { readPort: port() })).toMatchObject({
      id: ids.other,
    });
    expect(await getLastTransaction({ bookId: ids.empty }, { readPort: port() })).toBeNull();
  });
});
