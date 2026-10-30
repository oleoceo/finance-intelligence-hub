import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../apps/api/src/index.js';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const admin = { authorization: 'Bearer integration-admin' };
const now = new Date('2026-10-21T12:00:00Z');
let app: ReturnType<typeof buildApp>;
let bookId: string;
let accountId: string;

beforeAll(async () => {
  bookId = randomUUID();
  accountId = randomUUID();
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

it('proves the frozen Expense/Refund lifecycle and scoped read-only histories', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    headers: { ...admin, 'idempotency-key': randomUUID() },
    payload: {
      book_id: bookId,
      type: 'expense',
      amount: '500.00',
      account_id: accountId,
      description: 'expense',
      transaction_date: '2026-10-20',
    },
  });
  expect(create.statusCode).toBe(201);
  const expenseId: string = create.json().data.id;
  const refundUrl = `/api/v1/transactions/${expenseId}/refunds`;
  const auditUrl = `/api/v1/transactions/${expenseId}/audit`;
  const get = (url: string, headers: Record<string, string> = admin) =>
    app.inject({ method: 'GET', url, headers });
  for (const url of [refundUrl, auditUrl]) {
    expect((await get(url, {})).statusCode).toBe(401);
    expect((await get(url, { authorization: 'Bearer integration-ingest' })).statusCode).toBe(403);
    expect((await get(`${url}?unexpected=1`)).statusCode).toBe(422);
    expect((await get(url.replace(expenseId, 'bad-id'))).statusCode).toBe(422);
    expect((await get(url.replace(expenseId, randomUUID()))).statusCode).toBe(404);
  }
  const refundBody = {
    version: 1,
    amount: '200.00',
    account_id: accountId,
    transaction_date: '2026-10-20',
    description: 'refund',
  };
  const refundKey = randomUUID();
  const refund = (payload: object, key = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: refundUrl,
      headers: { ...admin, 'idempotency-key': key },
      payload,
    });
  const createdRefund = await refund(refundBody, refundKey);
  expect(createdRefund.statusCode).toBe(201);
  const refundId: string = createdRefund.json().data.id;
  expect((await refund(refundBody, refundKey)).json().data.id).toBe(refundId);
  expect((await refund({ ...refundBody, amount: '100.00' }, refundKey)).json().error.code).toBe(
    'IDEMPOTENCY_CONFLICT',
  );
  const patch = (version: number, amount: string) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${expenseId}`,
      headers: admin,
      payload: { version, amount },
    });
  const corrected = await patch(1, '450.00');
  expect(corrected.statusCode).toBe(200);
  expect(corrected.json().data.version).toBe(2);
  const beforeRejections = await Promise.all([
    fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('id', 'in', [expenseId, refundId])
      .execute(),
    fixture.db
      .selectFrom('audit_events')
      .selectAll()
      .where('entity_id', 'in', [expenseId, refundId])
      .execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  expect((await patch(1, '400.00')).json().error.code).toBe('VERSION_CONFLICT');
  const rejected = await patch(2, '100.00');
  expect(rejected.statusCode).toBe(422);
  const voidTransaction = (id: string, version: number, key = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/transactions/${id}/void`,
      headers: { ...admin, 'idempotency-key': key },
      payload: { version, reason: 'accepted test' },
    });
  const rejectedVoid = await voidTransaction(expenseId, 2);
  expect(rejectedVoid.statusCode).toBe(409);
  expect(rejectedVoid.json().error.code).toBe('TRANSACTION_HAS_POSTED_REFUNDS');
  const afterRejections = await Promise.all([
    fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('id', 'in', [expenseId, refundId])
      .execute(),
    fixture.db
      .selectFrom('audit_events')
      .selectAll()
      .where('entity_id', 'in', [expenseId, refundId])
      .execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  expect(afterRejections).toEqual(beforeRejections);
  const refundVoidKey = randomUUID();
  expect((await voidTransaction(refundId, 1, refundVoidKey)).statusCode).toBe(200);
  expect((await voidTransaction(refundId, 1, refundVoidKey)).statusCode).toBe(200);
  expect((await voidTransaction(expenseId, 2)).statusCode).toBe(200);
  const rows = await fixture.db
    .selectFrom('transactions')
    .selectAll()
    .where('id', 'in', [expenseId, refundId])
    .execute();
  expect(rows.find((row) => row.id === expenseId)).toMatchObject({
    amount: '450.00',
    status: 'voided',
    version: 3,
  });
  expect(rows.find((row) => row.id === refundId)).toMatchObject({
    amount: '200.00',
    status: 'voided',
    version: 2,
    refund_of_transaction_id: expenseId,
    type: 'income',
  });
  const refunds = await get(refundUrl);
  expect(refunds.statusCode).toBe(200);
  expect(refunds.json().data.items).toMatchObject([{ id: refundId, status: 'voided', version: 2 }]);
  const expenseAudit = await get(auditUrl);
  expect(expenseAudit.statusCode).toBe(200);
  expect(expenseAudit.json().data.items.map((event: { action: string }) => event.action)).toEqual([
    'TRANSACTION_CREATED',
    'TRANSACTION_UPDATED',
    'TRANSACTION_VOIDED',
  ]);
  expect(expenseAudit.json().data.items[0]).toMatchObject({ old_data: null, source: 'direct_api' });
  expect(expenseAudit.json().data.items[1].old_data.amount).toBe('500.00');
  expect(expenseAudit.json().data.items[1].new_data.amount).toBe('450.00');
  expect(expenseAudit.json().data.items[2].new_data.status).toBe('voided');
  expect(
    expenseAudit
      .json()
      .data.items.every(
        (event: { correlation_id: string; created_at: string }) =>
          typeof event.correlation_id === 'string' && !Number.isNaN(Date.parse(event.created_at)),
      ),
  ).toBe(true);
  expect(
    expenseAudit
      .json()
      .data.items.every((event: { entity_id: string }) => event.entity_id === expenseId),
  ).toBe(true);
  const refundAudit = await get(`/api/v1/transactions/${refundId}/audit`);
  expect(refundAudit.json().data.items.map((event: { action: string }) => event.action)).toEqual([
    'TRANSACTION_REFUND_CREATED',
    'TRANSACTION_VOIDED',
  ]);
  expect((await get(`/api/v1/transactions/${refundId}/refunds`)).statusCode).toBe(404);
  const beforeReads = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().execute(),
    fixture.db.selectFrom('audit_events').selectAll().execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  await get(refundUrl);
  await get(auditUrl);
  await get(`/api/v1/transactions/${refundId}/audit`);
  const afterReads = await Promise.all([
    fixture.db.selectFrom('transactions').selectAll().execute(),
    fixture.db.selectFrom('audit_events').selectAll().execute(),
    fixture.db.selectFrom('idempotency_keys').selectAll().execute(),
  ]);
  expect(afterReads).toEqual(beforeReads);
});

it('returns multiple linked Refunds in stable order and excludes ordinary Income', async () => {
  const expense = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    headers: { ...admin, 'idempotency-key': randomUUID() },
    payload: {
      book_id: bookId,
      type: 'expense',
      amount: '100.00',
      account_id: accountId,
      description: 'other expense',
      transaction_date: '2026-10-20',
    },
  });
  expect(expense.statusCode).toBe(201);
  const expenseId: string = expense.json().data.id;
  const url = `/api/v1/transactions/${expenseId}/refunds`;
  const ids: string[] = [];
  for (const amount of ['20.00', '30.00']) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { ...admin, 'idempotency-key': randomUUID() },
      payload: {
        version: 1,
        amount,
        account_id: accountId,
        transaction_date: '2026-10-20',
        description: 'partial',
      },
    });
    expect(response.statusCode).toBe(201);
    ids.push(response.json().data.id);
  }
  const ordinary = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    headers: { ...admin, 'idempotency-key': randomUUID() },
    payload: {
      book_id: bookId,
      type: 'income',
      amount: '15.00',
      account_id: accountId,
      description: 'ordinary',
      transaction_date: '2026-10-20',
    },
  });
  expect(ordinary.statusCode).toBe(201);
  const result = await app.inject({ method: 'GET', url, headers: admin });
  expect(result.statusCode).toBe(200);
  expect(result.json().data.items.map((item: { id: string }) => item.id)).toEqual(ids);
  expect(
    result
      .json()
      .data.items.every(
        (item: { refund_of_transaction_id: string }) => item.refund_of_transaction_id === expenseId,
      ),
  ).toBe(true);
});
