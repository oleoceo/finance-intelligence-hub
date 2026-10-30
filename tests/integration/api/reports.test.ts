import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../apps/api/src/index.js';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const instant = new Date('2024-03-01T02:30:00Z');
const book = randomUUID();
const utcBook = randomUUID();
const emptyBook = randomUUID();
const account = randomUUID();
const destination = randomUUID();
const utcAccount = randomUUID();
const expense = randomUUID();
const admin = { authorization: 'Bearer integration-admin', 'x-correlation-id': 'summary-pg' };
let app: ReturnType<typeof buildApp>;

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
      human_ref: id.replaceAll('-', '').slice(0, 12).toUpperCase(),
      book_id: options.bookId ?? book,
      account_id: options.accountId ?? account,
      destination_account_id: options.destination ?? null,
      category_id: null,
      merchant_id: null,
      type,
      status: options.status ?? 'posted',
      amount,
      currency: options.bookId === utcBook ? 'USD' : 'BRL',
      description: 'Summary API fixture',
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
}
beforeAll(async () => {
  await fixture.run(async (ctx) => {
    for (const [id, currency, timezone, active] of [
      [book, 'BRL', 'America/Sao_Paulo', false],
      [utcBook, 'USD', 'UTC', true],
      [emptyBook, 'BRL', 'UTC', true],
    ] as const)
      await ctx.books.create({
        id,
        name: id,
        normalizedName: id,
        currency,
        timezone,
        active,
        archivedAt: active ? null : instant,
        createdAt: instant,
        updatedAt: instant,
      });
    for (const [id, bookId, currency] of [
      [account, book, 'BRL'],
      [destination, book, 'BRL'],
      [utcAccount, utcBook, 'USD'],
    ] as const)
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
  await insert('expense', '500.00', '2024-02-01', { id: expense });
  await insert('income', '100.00', '2024-02-29');
  await insert('income', '200.00', '2024-02-29', { refundOf: expense });
  await insert('income', '9.00', '2024-02-20', { refundOf: expense, status: 'voided' });
  await insert('expense', '19.00', '2024-02-20', { status: 'voided' });
  await insert('transfer', '999.00', '2024-02-20', { destination });
  await insert('income', '10.00', '2024-01-31');
  await insert('income', '20.00', '2024-03-01');
  await insert('income', '40.00', '2024-03-01', { bookId: utcBook, accountId: utcAccount });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    app = buildApp({
      adminToken: 'integration-admin',
      ingestToken: 'integration-ingest',
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
async function get(query: string, headers: Record<string, string> = admin) {
  return app.inject({ method: 'GET', url: `/api/v1/reports/summary?${query}`, headers });
}
async function counts() {
  const [transactions, audits, keys] = await Promise.all([
    fixture.db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow(),
    fixture.db
      .selectFrom('audit_events')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow(),
    fixture.db
      .selectFrom('idempotency_keys')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow(),
  ]);
  return [transactions.n, audits.n, keys.n];
}
describe('M08-P02 real PostgreSQL Summary API', () => {
  it('returns exact archived Book totals and no financial effects', async () => {
    const before = await counts();
    const response = await get(`book_id=${book}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        book_id: book,
        currency: 'BRL',
        ordinary_income: '100.00',
        gross_expenses: '500.00',
        refunds: '200.00',
        net_expenses: '300.00',
        net: '-200.00',
      },
      meta: { request_id: expect.any(String), correlation_id: 'summary-pg' },
    });
    expect(await counts()).toEqual(before);
  });
  it('uses each Book timezone across UTC month rollover and returns empty Book zeros', async () => {
    const utc = await get(`book_id=${utcBook}`);
    expect(utc.statusCode).toBe(200);
    expect(utc.json().data).toEqual({
      book_id: utcBook,
      currency: 'USD',
      ordinary_income: '40.00',
      gross_expenses: '0.00',
      refunds: '0.00',
      net_expenses: '0.00',
      net: '40.00',
    });
    const empty = await get(`book_id=${emptyBook}`);
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data.net).toBe('0.00');
  });
  it('honors inclusive dates and independent open filters', async () => {
    expect(
      (await get(`book_id=${book}&date_from=2024-02-29&date_to=2024-02-29`)).json().data,
    ).toMatchObject({
      ordinary_income: '100.00',
      gross_expenses: '0.00',
      refunds: '200.00',
      net: '300.00',
    });
    expect((await get(`book_id=${book}&date_from=2024-03-01`)).json().data.ordinary_income).toBe(
      '20.00',
    );
    expect((await get(`book_id=${book}&date_to=2024-01-31`)).json().data.ordinary_income).toBe(
      '10.00',
    );
  });
  it('does not reach PostgreSQL for unauthorized requests', async () => {
    const before = await counts();
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/reports/summary?book_id=${book}` }))
        .statusCode,
    ).toBe(401);
    expect(
      (await get(`book_id=${book}`, { authorization: 'Bearer integration-ingest' })).statusCode,
    ).toBe(403);
    expect(await counts()).toEqual(before);
  });
  it('returns 503 for a real PostgreSQL connection failure without leaking the connection string', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://summary-secret@127.0.0.1:1/unavailable';
    let unavailable: ReturnType<typeof buildApp>;
    try {
      unavailable = buildApp({
        adminToken: 'integration-admin',
        ingestToken: 'integration-ingest',
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    try {
      const response = await unavailable.inject({
        method: 'GET',
        url: `/api/v1/reports/summary?book_id=${book}`,
        headers: admin,
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('DATABASE_UNAVAILABLE');
      expect(response.body).not.toContain('summary-secret');
      expect(response.json().meta.correlation_id).toBe('summary-pg');
    } finally {
      await unavailable.close();
    }
  });
});
