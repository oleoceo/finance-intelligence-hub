import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getFinancialSummary } from '@finance-hub/core';
import { KyselyBookRepository, KyselySummaryReadRepository } from '@finance-hub/database';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const ids = {
  book: randomUUID(),
  other: randomUUID(),
  empty: randomUUID(),
  account: randomUUID(),
  otherAccount: randomUUID(),
  destination: randomUUID(),
  expense: randomUUID(),
  voidedExpense: randomUUID(),
};
const instant = new Date('2024-03-01T02:30:00Z');

async function insert(
  type: string,
  amount: string,
  day: string,
  options: {
    bookId?: string;
    accountId?: string;
    status?: string;
    refundOf?: string;
    destination?: string;
    id?: string;
  } = {},
) {
  const id = options.id ?? randomUUID();
  await fixture.db
    .insertInto('transactions')
    .values({
      id,
      human_ref: id.slice(0, 12).replaceAll('-', '').toUpperCase(),
      book_id: options.bookId ?? ids.book,
      account_id: options.accountId ?? ids.account,
      destination_account_id: options.destination ?? null,
      category_id: null,
      merchant_id: null,
      type,
      status: options.status ?? 'posted',
      amount,
      currency: options.bookId === ids.other ? 'USD' : 'BRL',
      description: 'Summary fixture',
      notes: null,
      transaction_date: day,
      source: 'direct_api',
      source_reference: null,
      inbox_message_id: null,
      refund_of_transaction_id: options.refundOf ?? null,
      version: 1,
      voided_at: options.status === 'voided' ? instant : null,
      void_reason: options.status === 'voided' ? 'fixture' : null,
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  return id;
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    for (const [id, name, currency, timezone, active] of [
      [ids.book, 'Summary', 'BRL', 'America/Sao_Paulo', false],
      [ids.other, 'Other', 'USD', 'UTC', true],
      [ids.empty, 'Empty', 'BRL', 'UTC', true],
    ] as const)
      await ctx.books.create({
        id,
        name,
        normalizedName: id,
        currency,
        timezone,
        active,
        archivedAt: active ? null : instant,
        createdAt: instant,
        updatedAt: instant,
      });
    for (const [id, bookId, currency] of [
      [ids.account, ids.book, 'BRL'],
      [ids.destination, ids.book, 'BRL'],
      [ids.otherAccount, ids.other, 'USD'],
    ])
      await ctx.accounts.create({
        id,
        bookId,
        name: id,
        normalizedName: id,
        type: 'checking',
        currency,
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: instant,
        updatedAt: instant,
      });
  });
  await insert('expense', '500.00', '2024-02-01', { id: ids.expense });
  await insert('income', '100.00', '2024-02-29');
  await insert('income', '75.00', '2024-02-15', { refundOf: ids.expense });
  await insert('income', '125.00', '2024-02-29', { refundOf: ids.expense });
  await insert('income', '9.00', '2024-02-20', { refundOf: ids.expense, status: 'voided' });
  await insert('expense', '19.00', '2024-02-20', { id: ids.voidedExpense, status: 'voided' });
  await insert('transfer', '999.00', '2024-02-20', { destination: ids.destination });
  await insert('income', '10.00', '2024-01-31');
  await insert('income', '20.00', '2024-03-01');
  await insert('expense', '900.00', '2024-02-29', {
    bookId: ids.other,
    accountId: ids.otherAccount,
  });
}, 180000);

function summary(bookId = ids.book, dateFrom?: string, dateTo?: string) {
  return getFinancialSummary(
    { bookId, dateFrom, dateTo },
    {
      books: new KyselyBookRepository(fixture.db),
      summaries: new KyselySummaryReadRepository(fixture.db),
      now: () => instant,
    },
  );
}

describe('M08-P01 real PostgreSQL Summary aggregation', () => {
  it('returns the five exact formulas over posted rows with inclusive leap-day bounds', async () => {
    expect(await summary()).toEqual({
      bookId: ids.book,
      currency: 'BRL',
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
      ordinaryIncome: '100.00',
      grossExpenses: '500.00',
      refunds: '200.00',
      netExpenses: '300.00',
      net: '-200.00',
    });
  });
  it('isolates Books and returns exact zeros for an empty Book', async () => {
    expect(await summary(ids.other, '2024-02-01', '2024-02-29')).toMatchObject({
      currency: 'USD',
      ordinaryIncome: '0.00',
      grossExpenses: '900.00',
      refunds: '0.00',
      net: '-900.00',
    });
    expect(await summary(ids.empty, '2024-02-01', '2024-02-29')).toMatchObject({
      ordinaryIncome: '0.00',
      grossExpenses: '0.00',
      refunds: '0.00',
      netExpenses: '0.00',
      net: '0.00',
    });
  });
  it('honors independent open bounds and transaction dates', async () => {
    expect(await summary(ids.book, '2024-03-01')).toMatchObject({ ordinaryIncome: '20.00' });
    expect(await summary(ids.book, undefined, '2024-01-31')).toMatchObject({
      ordinaryIncome: '10.00',
    });
  });
  it('aggregates beyond the 100-row list page limit without writes', async () => {
    const before = await fixture.db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow();
    for (let i = 0; i < 101; i++) await insert('income', '0.01', '2024-04-01');
    expect(await summary(ids.book, '2024-04-01', '2024-04-30')).toMatchObject({
      ordinaryIncome: '1.01',
      net: '1.01',
    });
    const after = await fixture.db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow();
    expect(BigInt(after.count) - BigInt(before.count)).toBe(101n);
  });

  it('reflects persisted amount and financial date corrections without audit side effects', async () => {
    const beforeAudit = await fixture.db
      .selectFrom('audit_events')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow();
    await fixture.db
      .updateTable('transactions')
      .set({
        amount: '600.00',
        transaction_date: '2024-02-29',
      })
      .where('id', '=', ids.expense)
      .execute();
    expect(await summary()).toMatchObject({
      grossExpenses: '600.00',
      netExpenses: '400.00',
      net: '-300.00',
    });
    await fixture.db
      .updateTable('transactions')
      .set({
        transaction_date: '2024-01-31',
      })
      .where('id', '=', ids.expense)
      .execute();
    expect(await summary()).toMatchObject({
      grossExpenses: '0.00',
      netExpenses: '-200.00',
      net: '300.00',
    });
    const afterAudit = await fixture.db
      .selectFrom('audit_events')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow();
    expect(afterAudit.count).toBe(beforeAudit.count);
  });
});
