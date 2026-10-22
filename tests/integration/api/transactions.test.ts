import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../apps/api/src/index.js';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const admin = { authorization: 'Bearer integration-admin' };
const now = new Date('2026-10-21T12:00:00Z');
let app: ReturnType<typeof buildApp>;
let bookId: string;
let accountId: string;
let destinationId: string;
let categoryId: string;
let merchantId: string;
let otherBookId: string;
let otherAccountId: string;

async function seedBook(currency = 'BRL') {
  const book = randomUUID();
  const account = randomUUID();
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: book,
      name: book,
      normalizedName: book,
      currency,
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
      currency,
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { book, account };
}
function createBody(type: 'expense' | 'income' | 'transfer' = 'expense') {
  const common = {
    book_id: bookId,
    type,
    amount: '35',
    account_id: accountId,
    description: `T08 ${type}`,
    transaction_date: '2026-10-20',
  };
  return type === 'transfer'
    ? { ...common, destination_account_id: destinationId }
    : { ...common, category_id: categoryId, merchant_id: merchantId };
}
async function post(
  payload: Record<string, unknown>,
  key = randomUUID(),
  headers: Record<string, string> = admin,
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    headers: { ...headers, 'idempotency-key': key },
    payload,
  });
}
async function counts(key: string) {
  const [transactions, audits, keys] = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().where('book_id', '=', bookId).execute(),
    fixture.db.selectFrom('audit_events').selectAll().where('correlation_id', '=', key).execute(),
    fixture.db
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('idempotency_key', '=', key)
      .execute(),
  ]);
  return { transactions, audits, keys };
}

beforeAll(async () => {
  const first = await seedBook();
  bookId = first.book;
  accountId = first.account;
  const second = await seedBook('USD');
  otherBookId = second.book;
  otherAccountId = second.account;
  destinationId = randomUUID();
  categoryId = randomUUID();
  merchantId = randomUUID();
  await fixture.run(async (ctx) => {
    await ctx.accounts.create({
      id: destinationId,
      bookId,
      name: destinationId,
      normalizedName: destinationId,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.categories.create({
      id: categoryId,
      bookId,
      name: categoryId,
      normalizedName: categoryId,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.merchants.create({
      id: merchantId,
      name: merchantId,
      normalizedName: merchantId,
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    app = buildApp({
      adminToken: 'integration-admin',
      ingestToken: 'integration-ingest',
      now: () => now,
    });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  await app.ready();
}, 180000);
afterAll(async () => {
  if (app) await app.close();
});

describe('M04-T08 API with production Database store and PostgreSQL', () => {
  it('rejects unauthorized create before any financial effect', async () => {
    const key = randomUUID();
    for (const [headers, status, code] of [
      [{}, 401, 'UNAUTHORIZED'],
      [{ authorization: 'Bearer invalid' }, 401, 'UNAUTHORIZED'],
      [{ authorization: 'Bearer integration-ingest' }, 403, 'INSUFFICIENT_SCOPE'],
    ] as const) {
      const result = await post({ invalid: true }, key, headers);
      expect(result.statusCode).toBe(status);
      expect(result.json().error.code).toBe(code);
      const withoutKey = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers,
        payload: createBody(),
      });
      expect(withoutKey.statusCode).toBe(status);
      expect(withoutKey.json().error.code).toBe(code);
    }
    const state = await counts(key);
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
    expect(state.keys).toHaveLength(0);
    expect(await fixture.db.selectFrom('audit_events').selectAll().execute()).toHaveLength(0);
    expect(await fixture.db.selectFrom('idempotency_keys').selectAll().execute()).toHaveLength(0);
  });

  it('creates Expense, replays canonical-equivalent input, and rejects conflict atomically', async () => {
    const key = randomUUID();
    const first = await post(createBody(), key, { ...admin, 'x-correlation-id': key });
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({
      type: 'expense',
      source: 'direct_api',
      amount: '35.00',
      is_refund: false,
    });
    const initial = await counts(key);
    expect(initial.transactions).toHaveLength(1);
    expect(initial.transactions[0]).toMatchObject({
      id: first.json().data.id,
      type: 'expense',
      source: 'direct_api',
    });
    expect(initial.audits).toHaveLength(1);
    expect(initial.audits[0]).toMatchObject({
      action: 'TRANSACTION_CREATED',
      entity_id: first.json().data.id,
    });
    expect(initial.keys).toHaveLength(1);
    expect(initial.keys[0]?.status).toBe('completed');
    const replay = await post({ ...createBody(), amount: '35.00' }, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data).toEqual(first.json().data);
    expect(replay.json().meta.request_id).not.toBe(first.json().meta.request_id);
    const conflict = await post({ ...createBody(), amount: '36.00' }, key);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const final = await counts(key);
    expect(final.transactions).toHaveLength(1);
    expect(final.audits).toHaveLength(1);
    expect(final.keys).toHaveLength(1);
  });

  it.each(['income', 'transfer'] as const)(
    'creates %s through generic POST with Audit and idempotency',
    async (type) => {
      const key = randomUUID();
      const response = await post(createBody(type), key, { ...admin, 'x-correlation-id': key });
      expect(response.statusCode).toBe(201);
      expect(response.json().data.type).toBe(type);
      const state = await counts(key);
      expect(state.audits).toHaveLength(1);
      expect(state.keys).toHaveLength(1);
      expect(state.keys[0]?.status).toBe('completed');
      const row = state.transactions.find((item) => item.id === response.json().data.id);
      expect(row).toBeDefined();
      if (type === 'income') expect(row?.refund_of_transaction_id).toBeNull();
      else
        expect(row).toMatchObject({
          destination_account_id: destinationId,
          category_id: null,
          merchant_id: null,
        });
    },
  );

  it('gets, lists and selects Last using posted created-at ordering', async () => {
    const created = await post(createBody());
    expect(created.statusCode).toBe(201);
    const transactionId = created.json().data.id;
    const byId = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/${transactionId}`,
      headers: admin,
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().data.id).toBe(transactionId);
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/${randomUUID()}`,
      headers: admin,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('TRANSACTION_NOT_FOUND');
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions/invalid',
      headers: admin,
    });
    expect(malformed.statusCode).toBe(422);
    const all = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=1&page_size=100',
      headers: admin,
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().data.items.some((item: { book_id: string }) => item.book_id === bookId)).toBe(
      true,
    );
    const filtered = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${bookId}&type=expense&status=posted&account_id=${accountId}&category_id=${categoryId}&merchant_id=${merchantId}&date_from=2026-10-20&date_to=2026-10-20&search=t08&page=1&page_size=1`,
      headers: admin,
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data.items).toHaveLength(1);
    expect(filtered.json().data.total).toBeGreaterThan(1);
    expect(filtered.json().data.page_size).toBe(1);
    for (const query of [
      `book_id=${bookId}&account_id=${otherAccountId}`,
      `book_id=${bookId}&category_id=${randomUUID()}`,
      `book_id=${bookId}&merchant_id=${randomUUID()}`,
      `book_id=${bookId}&date_from=2026-10-21`,
      `book_id=${bookId}&date_to=2026-10-01`,
      `book_id=${bookId}&search=NO_MATCH`,
    ]) {
      const empty = await app.inject({
        method: 'GET',
        url: `/api/v1/transactions?${query}`,
        headers: admin,
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json().data.total).toBe(0);
    }
    const pageTwo = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${bookId}&page=2&page_size=1`,
      headers: admin,
    });
    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.json().data.items).toHaveLength(1);
    expect(pageTwo.json().data.page).toBe(2);
    const other = await post({
      ...createBody('income'),
      book_id: otherBookId,
      account_id: otherAccountId,
      category_id: null,
      merchant_id: null,
    });
    expect(other.statusCode).toBe(201);
    const crossBook = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page_size=100',
      headers: admin,
    });
    expect(
      crossBook.json().data.items.some((item: { book_id: string }) => item.book_id === otherBookId),
    ).toBe(true);
    const incomeOnly = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${otherBookId}&type=income`,
      headers: admin,
    });
    expect(incomeOnly.statusCode).toBe(200);
    expect(incomeOnly.json().data.items).toHaveLength(1);
    const bookOnly = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${bookId}`,
      headers: admin,
    });
    expect(
      bookOnly.json().data.items.every((item: { book_id: string }) => item.book_id === bookId),
    ).toBe(true);
    const last = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/last?book_id=${bookId}`,
      headers: admin,
    });
    expect(last.statusCode).toBe(200);
    expect(last.json().data.book_id).toBe(bookId);
    const noBook = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions/last',
      headers: admin,
    });
    expect(noBook.statusCode).toBe(422);
  });

  it('Last ignores a voided row and a later financial date, and breaks created-at ties by id', async () => {
    const own = await seedBook();
    const first = await post({
      ...createBody('income'),
      book_id: own.book,
      account_id: own.account,
      category_id: null,
      merchant_id: null,
      transaction_date: '2026-10-20',
    });
    const second = await post({
      ...createBody('income'),
      book_id: own.book,
      account_id: own.account,
      category_id: null,
      merchant_id: null,
      transaction_date: '2026-10-01',
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id > first.json().data.id).toBe(true);
    const newerId: string = second.json().data.id;
    const lastUrl = `/api/v1/transactions/last?book_id=${own.book}`;
    const tied = await app.inject({ method: 'GET', url: lastUrl, headers: admin });
    expect(tied.statusCode).toBe(200);
    expect(tied.json().data.id).toBe(newerId);
    await fixture.db
      .updateTable('transactions')
      .set({ status: 'voided', voided_at: now, void_reason: 'fixture' })
      .where('id', '=', newerId!)
      .execute();
    const posted = await app.inject({ method: 'GET', url: lastUrl, headers: admin });
    expect(posted.statusCode).toBe(200);
    expect(posted.json().data.id).toBe(first.json().data.id);
    expect(posted.json().data.status).toBe('posted');
    const voidedOnly = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${own.book}&status=voided`,
      headers: admin,
    });
    expect(voidedOnly.statusCode).toBe(200);
    expect(voidedOnly.json().data.items.map((item: { id: string }) => item.id)).toEqual([newerId]);
    const olderCreated = await post({
      ...createBody('income'),
      book_id: own.book,
      account_id: own.account,
      category_id: null,
      merchant_id: null,
      transaction_date: '2026-10-15',
    });
    expect(olderCreated.statusCode).toBe(201);
    await fixture.db
      .updateTable('transactions')
      .set({ created_at: new Date('2026-10-19T12:00:00Z') })
      .where('id', '=', olderCreated.json().data.id)
      .execute();
    const createdOrder = await app.inject({ method: 'GET', url: lastUrl, headers: admin });
    expect(createdOrder.json().data.id).toBe(first.json().data.id);
    const otherLast = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/last?book_id=${bookId}`,
      headers: admin,
    });
    expect(otherLast.json().data.book_id).toBe(bookId);
  });

  it('maps real missing targets and Transfer invariants', async () => {
    for (const [payload, status, code] of [
      [{ ...createBody(), book_id: randomUUID() }, 404, 'BOOK_NOT_FOUND'],
      [{ ...createBody(), account_id: randomUUID() }, 404, 'ACCOUNT_NOT_FOUND'],
      [{ ...createBody(), category_id: randomUUID() }, 404, 'CATEGORY_NOT_FOUND'],
      [{ ...createBody(), merchant_id: randomUUID() }, 404, 'MERCHANT_NOT_FOUND'],
      [{ ...createBody(), transaction_date: '2099-01-01' }, 422, 'TRANSACTION_DATE_IN_FUTURE'],
      [
        { ...createBody('transfer'), destination_account_id: accountId },
        422,
        'TRANSFER_SAME_ACCOUNT',
      ],
      [
        { ...createBody('transfer'), destination_account_id: otherAccountId },
        422,
        'CROSS_BOOK_TRANSFER_NOT_SUPPORTED',
      ],
    ] as const) {
      const response = await post(payload);
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
    }
  });

  it('maps inactive Book, Account, Category and Merchant from PostgreSQL', async () => {
    const cases = [
      ['categories', categoryId, 'CATEGORY_INACTIVE'],
      ['merchants', merchantId, 'MERCHANT_INACTIVE'],
      ['accounts', accountId, 'ACCOUNT_INACTIVE'],
      ['books', bookId, 'BOOK_INACTIVE'],
    ] as const;
    for (const [table, id, code] of cases) {
      await fixture.db
        .updateTable(table)
        .set({ active: false, archived_at: now })
        .where('id', '=', id)
        .execute();
      const response = await post(createBody());
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe(code);
      await fixture.db
        .updateTable(table)
        .set({ active: true, archived_at: null })
        .where('id', '=', id)
        .execute();
    }
  });
});
