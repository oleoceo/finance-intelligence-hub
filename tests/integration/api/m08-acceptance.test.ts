import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../../../apps/api/src/index.js';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const admin = { authorization: 'Bearer m08-admin' };
const now = new Date('2026-10-21T12:00:00Z');
const bookId = randomUUID();
const accountId = randomUUID();
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: bookId,
      name: bookId,
      normalizedName: bookId,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.accounts.create({
      id: accountId,
      bookId,
      name: accountId,
      normalizedName: accountId,
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
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    app = buildApp({ adminToken: 'm08-admin', ingestToken: 'm08-ingest', now: () => now });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  await app.ready();
}, 180000);

afterAll(async () => {
  if (app) await app.close();
});

type Totals = {
  ordinary_income: string;
  gross_expenses: string;
  refunds: string;
  net_expenses: string;
  net: string;
};

const url = `/api/v1/reports/summary?book_id=${bookId}&date_from=2026-10-01&date_to=2026-10-31`;

function parseCsv(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      record.push(cell);
      cell = '';
    } else if (char === '\r' && csv[index + 1] === '\n' && !quoted) {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      index++;
    } else cell += char;
  }
  expect(quoted).toBe(false);
  expect(cell).toBe('');
  expect(record).toEqual([]);
  return records;
}

function minorUnits(amount: string): bigint {
  const [whole, fraction] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}

function decimal(amount: bigint): string {
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

async function prove(expected: Totals, transactionCount: number) {
  const before = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().execute(),
    fixture.db.selectFrom('audit_events').selectAll().execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  expect(before[0]).toHaveLength(transactionCount);
  const summary = await app.inject({ method: 'GET', url, headers: admin });
  expect(summary.statusCode, summary.body).toBe(200);
  expect(summary.json().data).toMatchObject(expected);
  const csv = await app.inject({
    method: 'GET',
    url: `/api/v1/exports/transactions.csv?book_id=${bookId}&date_from=2026-10-01&date_to=2026-10-31`,
    headers: admin,
  });
  expect(csv.statusCode, csv.body).toBe(200);
  const [header, ...records] = parseCsv(csv.body);
  expect(header).toBeDefined();
  const field = (row: string[], name: string) => row[header!.indexOf(name)]!;
  expect(records).toHaveLength(transactionCount);
  expect(new Set(records.map((record) => field(record, 'id'))).size).toBe(transactionCount);
  for (const row of before[0]) {
    const record = records.find((candidate) => field(candidate, 'id') === row.id);
    expect(record).toBeDefined();
    expect(record).toHaveLength(header!.length);
    expect(field(record!, 'book_id')).toBe(row.book_id);
    expect(field(record!, 'transaction_date')).toBe(
      row.transaction_date instanceof Date
        ? row.transaction_date.toISOString().slice(0, 10)
        : row.transaction_date,
    );
    expect(field(record!, 'type')).toBe(row.type);
    expect(field(record!, 'status')).toBe(row.status);
    expect(field(record!, 'amount')).toBe(row.amount);
    expect(field(record!, 'refund_of_transaction_id')).toBe(row.refund_of_transaction_id ?? '');
    expect(field(record!, 'is_refund')).toBe(String(row.refund_of_transaction_id !== null));
  }
  expect(records.filter((record) => field(record, 'status') === 'voided')).toHaveLength(
    before[0].filter((row) => row.status === 'voided').length,
  );
  const posted = records.filter((row) => field(row, 'status') === 'posted');
  const sum = (rows: string[][]) =>
    rows.reduce((total, row) => total + minorUnits(field(row, 'amount')), 0n);
  const ordinary = sum(
    posted.filter(
      (row) => field(row, 'type') === 'income' && field(row, 'refund_of_transaction_id') === '',
    ),
  );
  const gross = sum(posted.filter((row) => field(row, 'type') === 'expense'));
  const refunds = sum(
    posted.filter(
      (row) => field(row, 'type') === 'income' && field(row, 'refund_of_transaction_id') !== '',
    ),
  );
  expect({
    ordinary_income: decimal(ordinary),
    gross_expenses: decimal(gross),
    refunds: decimal(refunds),
    net_expenses: decimal(gross - refunds),
    net: decimal(ordinary - gross + refunds),
  }).toEqual(expected);
  const after = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().execute(),
    fixture.db.selectFrom('audit_events').selectAll().execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  expect(after).toEqual(before);
}

it('reconciles the accepted financial lifecycle through real API operations and PostgreSQL', async () => {
  const create = async (type: 'expense' | 'income', amount: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { ...admin, 'idempotency-key': randomUUID() },
      payload: {
        book_id: bookId,
        type,
        amount,
        account_id: accountId,
        description: type,
        transaction_date: '2026-10-20',
      },
    });
  const expense = await create('expense', '500.00');
  expect(expense.statusCode, expense.body).toBe(201);
  const expenseId: string = expense.json().data.id;
  const refund = await app.inject({
    method: 'POST',
    url: `/api/v1/transactions/${expenseId}/refunds`,
    headers: { ...admin, 'idempotency-key': randomUUID() },
    payload: {
      version: 1,
      amount: '200.00',
      account_id: accountId,
      transaction_date: '2026-10-20',
      description: 'refund',
    },
  });
  expect(refund.statusCode, refund.body).toBe(201);
  const refundId: string = refund.json().data.id;
  const income = await create('income', '100.00');
  expect(income.statusCode, income.body).toBe(201);
  await prove(
    {
      ordinary_income: '100.00',
      gross_expenses: '500.00',
      refunds: '200.00',
      net_expenses: '300.00',
      net: '-200.00',
    },
    3,
  );
  const correction = await app.inject({
    method: 'PATCH',
    url: `/api/v1/transactions/${expenseId}`,
    headers: admin,
    payload: { version: 1, amount: '450.00' },
  });
  expect(correction.statusCode, correction.body).toBe(200);
  await prove(
    {
      ordinary_income: '100.00',
      gross_expenses: '450.00',
      refunds: '200.00',
      net_expenses: '250.00',
      net: '-150.00',
    },
    3,
  );
  const voidTransaction = (id: string, version: number) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/transactions/${id}/void`,
      headers: { ...admin, 'idempotency-key': randomUUID() },
      payload: { version, reason: 'm08 acceptance' },
    });
  const beforeBlocked = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().execute(),
    fixture.db.selectFrom('audit_events').selectAll().execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  const blocked = await voidTransaction(expenseId, 2);
  expect(blocked.statusCode).toBe(409);
  expect(blocked.json().error.code).toBe('TRANSACTION_HAS_POSTED_REFUNDS');
  expect(
    await Promise.all([
      fixture.db.selectFrom('transactions').selectAll().execute(),
      fixture.db.selectFrom('audit_events').selectAll().execute(),
      fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
    ]),
  ).toEqual(beforeBlocked);
  expect((await voidTransaction(refundId, 1)).statusCode).toBe(200);
  await prove(
    {
      ordinary_income: '100.00',
      gross_expenses: '450.00',
      refunds: '0.00',
      net_expenses: '450.00',
      net: '-350.00',
    },
    3,
  );
  expect((await voidTransaction(expenseId, 2)).statusCode).toBe(200);
  await prove(
    {
      ordinary_income: '100.00',
      gross_expenses: '0.00',
      refunds: '0.00',
      net_expenses: '0.00',
      net: '100.00',
    },
    3,
  );
  const history = await fixture.db.selectFrom('transactions').selectAll().execute();
  expect(history.find((row) => row.id === expenseId)).toMatchObject({
    status: 'voided',
    amount: '450.00',
  });
  expect(history.find((row) => row.id === refundId)).toMatchObject({
    status: 'voided',
    type: 'income',
    refund_of_transaction_id: expenseId,
  });
  expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
  expect(
    (await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer m08-ingest' } }))
      .statusCode,
  ).toBe(403);
});
