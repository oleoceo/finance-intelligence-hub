import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../apps/api/src/index.js';
import { t02Database } from '../repositories/t02-fixtures.js';
import { KyselyTransactionReadRepository } from '../../../packages/database/src/repositories/transaction-read-repository.js';
import type { TransactionReadRecord } from '@finance-hub/core';

const fixture = t02Database();
const instant = new Date('2024-03-01T02:30:00Z');
const book = randomUUID();
const otherBook = randomUUID();
const emptyBook = randomUUID();
const account = randomUUID();
const destination = randomUUID();
const otherAccount = randomUUID();
const expenseId = randomUUID();
const admin = { authorization: 'Bearer export-admin' };
let app: ReturnType<typeof buildApp>;

function transaction(
  type: string,
  amount: string,
  day: string,
  extra: Record<string, unknown> = {},
) {
  const id = randomUUID();
  return {
    id,
    human_ref: id.replaceAll('-', '').slice(0, 12).toUpperCase(),
    book_id: book,
    account_id: account,
    destination_account_id: null,
    category_id: null,
    merchant_id: null,
    type,
    status: 'posted',
    amount,
    currency: 'BRL',
    description: 'ação, "nova"\r\nlinha',
    notes: '=SUM(1,1)',
    transaction_date: day,
    source: 'direct_api',
    source_reference: '+cmd',
    inbox_message_id: null,
    refund_of_transaction_id: null,
    version: 1,
    voided_at: null,
    void_reason: null,
    created_at: instant,
    updated_at: instant,
    ...extra,
  };
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    for (const id of [book, otherBook, emptyBook]) {
      await ctx.books.create({
        id,
        name: id,
        normalizedName: id,
        currency: 'BRL',
        timezone: id === otherBook ? 'UTC' : 'America/Sao_Paulo',
        active: id !== book,
        archivedAt: id === book ? instant : null,
        createdAt: instant,
        updatedAt: instant,
      });
    }
    for (const [id, bookId] of [
      [account, book],
      [destination, book],
      [otherAccount, otherBook],
    ]) {
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
        createdAt: instant,
        updatedAt: instant,
      });
    }
  });
  const rows = [
    transaction('expense', '500.00', '2024-02-01', { id: expenseId, human_ref: 'EXPENSEP04' }),
    transaction('income', '100.00', '2024-02-29'),
    transaction('income', '200.00', '2024-02-29', { refund_of_transaction_id: expenseId }),
    transaction('transfer', '999.00', '2024-02-20', { destination_account_id: destination }),
    transaction('expense', '19.00', '2024-02-20', {
      status: 'voided',
      voided_at: instant,
      void_reason: '@bad',
    }),
    transaction('income', '20.00', '2024-03-01'),
    transaction('income', '40.00', '2024-03-01', { book_id: otherBook, account_id: otherAccount }),
    ...Array.from({ length: 270 }, () => transaction('income', '0.01', '2024-02-15')),
  ];
  await fixture.db.insertInto('transactions').values(rows).execute();
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    app = buildApp({
      adminToken: 'export-admin',
      ingestToken: 'export-ingest',
      now: () => instant,
    });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}, 180000);
afterAll(async () => {
  if (app) await app.close();
});

function get(query: string, headers: Record<string, string> = admin) {
  return app.inject({ method: 'GET', url: `/api/v1/exports/transactions.csv?${query}`, headers });
}

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

describe('M08-P04 PostgreSQL CSV export', () => {
  it('keeps correction and void states from one PostgreSQL snapshot across pages', async () => {
    const targets = await fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('book_id', '=', book)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
    const corrected = targets[260];
    const voided = targets[261];
    expect(corrected).toBeDefined();
    expect(voided).toBeDefined();
    const reached = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const exported: TransactionReadRecord[] = [];
    let pages = 0;
    const reader = new KyselyTransactionReadRepository(fixture.db);
    const snapshot = reader.exportSnapshot(
      { bookId: book, dateTo: '2024-02-29', limit: 256 },
      async () => {},
      async (page) => {
        pages++;
        if (pages === 1) {
          reached.resolve();
          await resume.promise;
        }
        exported.push(...page);
      },
    );
    try {
      await reached.promise;
      await fixture.db
        .updateTable('transactions')
        .set({ amount: '9.99', transaction_date: '2024-03-02' })
        .where('id', '=', corrected.id)
        .execute();
      await fixture.db
        .updateTable('transactions')
        .set({ status: 'voided', voided_at: instant, void_reason: 'review test' })
        .where('id', '=', voided.id)
        .execute();
      resume.resolve();
      await snapshot;
      expect(pages).toBe(2);
      expect(exported).toHaveLength(275);
      expect(new Set(exported.map((row) => row.id)).size).toBe(275);
      expect(exported.find((row) => row.id === corrected.id)?.amount).toBe(
        String(corrected.amount),
      );
      expect(exported.find((row) => row.id === corrected.id)?.transactionDate).toBe('2024-02-15');
      expect(exported.find((row) => row.id === voided.id)?.status).toBe('posted');
      const total = exported
        .filter((row) => row.status === 'posted' && row.type === 'income')
        .reduce((sum, row) => sum + minorUnits(row.amount), 0n);
      expect(decimal(total)).toBe('302.70');
    } finally {
      resume.resolve();
      await fixture.db
        .updateTable('transactions')
        .set({ amount: corrected.amount, transaction_date: corrected.transaction_date })
        .where('id', '=', corrected.id)
        .execute();
      await fixture.db
        .updateTable('transactions')
        .set({
          status: voided.status,
          voided_at: voided.voided_at,
          void_reason: voided.void_reason,
        })
        .where('id', '=', voided.id)
        .execute();
    }
  });
  it('releases the snapshot connection when a later page fails', async () => {
    const reader = new KyselyTransactionReadRepository(fixture.db);
    let pages = 0;
    await expect(reader.exportSnapshot(
      { bookId: book, limit: 256 },
      async () => {},
      async () => { if (++pages === 2) throw new Error('stream read failed'); },
    )).rejects.toThrow('stream read failed');
    expect(pages).toBe(2);
    const result = await fixture.db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll().as('n'))
      .where('book_id', '=', book)
      .executeTakeFirstOrThrow();
    expect(Number(result.n)).toBe(276);
  });
  it('fails the HTTP stream after headers when a later PostgreSQL page fails', async () => {
    const reader = new KyselyTransactionReadRepository(fixture.db);
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = fixture.connectionString;
    let failing: ReturnType<typeof buildApp>;
    try {
      failing = buildApp({
        adminToken: 'export-admin',
        ingestToken: 'export-ingest',
        now: () => instant,
        transactionExports: {
          exportPage: (input) => reader.exportPage(input),
          exportSnapshot: (input, first, page) =>
            reader.exportSnapshot(input, first, async (rows) => {
              await page(rows);
              if (rows.length === 256) throw new Error('simulated PostgreSQL page failure');
            }),
        },
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    try {
      await expect(
        failing.inject({
          method: 'GET',
          url: `/api/v1/exports/transactions.csv?book_id=${book}`,
          headers: admin,
        }),
      ).rejects.toThrow();
      expect(
        Number(
          (
            await fixture.db
              .selectFrom('transactions')
              .select((eb) => eb.fn.countAll().as('n'))
              .where('book_id', '=', book)
              .executeTakeFirstOrThrow()
          ).n,
        ),
      ).toBe(276);
    } finally {
      await failing.close();
    }
  });
  it('closes the PostgreSQL snapshot when the HTTP client disconnects', async () => {
    const reader = new KyselyTransactionReadRepository(fixture.db);
    const settled = Promise.withResolvers<void>();
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = fixture.connectionString;
    let interrupted: ReturnType<typeof buildApp>;
    try {
      interrupted = buildApp({
        adminToken: 'export-admin',
        ingestToken: 'export-ingest',
        now: () => instant,
        transactionExports: {
          exportPage: (input) => reader.exportPage(input),
          exportSnapshot: async (input, first, page) => {
            try {
              await reader.exportSnapshot(input, first, page);
            } finally {
              settled.resolve();
            }
          },
        },
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    try {
      const address = await interrupted.listen({ host: '127.0.0.1', port: 0 });
      const abort = new AbortController();
      const response = await fetch(`${address}/api/v1/exports/transactions.csv?book_id=${book}`, {
        headers: admin,
        signal: abort.signal,
      });
      expect(response.status).toBe(200);
      abort.abort();
      await expect(response.text()).rejects.toThrow();
      await settled.promise;
      expect(
        Number(
          (
            await fixture.db
              .selectFrom('transactions')
              .select((eb) => eb.fn.countAll().as('n'))
              .where('book_id', '=', book)
              .executeTakeFirstOrThrow()
          ).n,
        ),
      ).toBe(276);
    } finally {
      await interrupted.close();
    }
  });
  it('exports complete stable pages and reconciles posted rows with Summary', async () => {
    const before = await fixture.db
      .selectFrom('audit_events')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    const response = await get(`book_id=${book}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="transactions-${book}.csv"`,
    );
    const [header, ...records] = parseCsv(response.body);
    expect(header).toHaveLength(24);
    expect(records).toHaveLength(275);
    expect(records.every((row) => row.length === header.length)).toBe(true);
    const field = (row: string[], name: string) => row[header.indexOf(name)];
    const ids = records.map((row) => field(row, 'id'));
    expect(ids).toHaveLength(275);
    expect(new Set(ids).size).toBe(275);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(response.body).toContain('"expense","voided"');
    expect(response.body).toContain('"income","posted","true","' + expenseId + '"');
    expect(response.body).toContain('"500.00"');
    expect(response.body).toContain('"\'=SUM(1,1)"');
    expect(response.body).toContain('"\'+cmd"');
    expect(response.body).toContain('"ação, ""nova""\r\nlinha"');
    const summary = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/summary?book_id=${book}`,
      headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    const expected = {
      ordinary_income: '102.70',
      gross_expenses: '500.00',
      refunds: '200.00',
      net_expenses: '300.00',
      net: '-197.30',
    };
    expect(summary.json().data).toMatchObject(expected);
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
    expect(
      (
        await fixture.db
          .selectFrom('audit_events')
          .select((eb) => eb.fn.countAll().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    ).toBe(before.n);
  });
  it('applies Book-local default and inclusive or open explicit dates', async () => {
    expect((await get(`book_id=${otherBook}`)).body).toContain('"40.00"');
    expect(
      (await get(`book_id=${book}&date_from=2024-02-29&date_to=2024-02-29`)).body,
    ).not.toContain('"500.00"');
    const empty = await get(`book_id=${emptyBook}`);
    expect(empty.statusCode).toBe(200);
    expect(empty.body.trim().split('\r\n')).toHaveLength(1);
  });
  it('enforces admin and strict query errors', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/exports/transactions.csv?book_id=${book}` }))
        .statusCode,
    ).toBe(401);
    expect(
      (await get(`book_id=${book}`, { authorization: 'Bearer export-ingest' })).statusCode,
    ).toBe(403);
    expect((await get(`book_id=${randomUUID()}`)).statusCode).toBe(404);
    for (const query of [
      'book_id=bad',
      `book_id=${book}&date_from=2024-02-30`,
      `book_id=${book}&date_from=2024-03-01&date_to=2024-02-01`,
      `book_id=${book}&extra=1`,
    ]) {
      expect((await get(query)).statusCode).toBe(422);
    }
  });
  it('maps unavailable PostgreSQL to 503 before streaming', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://export-secret@127.0.0.1:1/unavailable';
    let unavailable: ReturnType<typeof buildApp>;
    try {
      unavailable = buildApp({ adminToken: 'export-admin', ingestToken: 'export-ingest' });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    try {
      const response = await unavailable.inject({
        method: 'GET',
        url: `/api/v1/exports/transactions.csv?book_id=${book}`,
        headers: admin,
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('DATABASE_UNAVAILABLE');
      expect(response.body).not.toContain('export-secret');
    } finally {
      await unavailable.close();
    }
  });
});
