import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConcurrencyError, type TransactionRecord } from '@finance-hub/core';
import { buildApp } from './index.js';

const id = '019a0000-0000-7000-8000-000000000001';
const other = '019a0000-0000-7000-8000-000000000002';
const admin = { authorization: 'Bearer unit-admin' };
const record: TransactionRecord = {
  id,
  humanRef: 'ABC123',
  bookId: other,
  type: 'expense',
  status: 'posted',
  amount: '35.00',
  currency: 'BRL',
  accountId: id,
  destinationAccountId: null,
  categoryId: null,
  merchantId: null,
  description: 'Lunch',
  notes: null,
  transactionDate: '2026-10-20',
  source: 'direct_api',
  sourceReference: null,
  inboxMessageId: null,
  refundOfTransactionId: null,
  version: 1,
  createdAt: new Date('2026-10-20T12:00:00Z'),
  updatedAt: new Date('2026-10-20T12:00:00Z'),
  voidedAt: null,
  voidReason: null,
};
const readRecord = { ...record, isRefund: false };
const body = {
  book_id: other,
  type: 'expense',
  amount: '35.00',
  account_id: id,
  description: 'Lunch',
  transaction_date: '2026-10-20',
};
const execute = vi.fn(async () => record);
const findById = vi.fn(async () => readRecord);
const list = vi.fn(async () => ({ items: [readRecord], total: 1, page: 1, pageSize: 50 }));
const getLast = vi.fn(async () => readRecord);
const app = buildApp({
  adminToken: 'unit-admin',
  ingestToken: 'unit-ingest',
  genericCreate: { execute },
  transactionReads: { findById, listRefunds: vi.fn(async () => []), list, getLast },
  transactions: {
    runInTransaction: vi.fn(async () => {
      throw new Error('configuration invoked');
    }),
  },
});
beforeAll(() => app.ready());
afterAll(() => app.close());
beforeEach(() => {
  execute.mockClear();
  findById.mockClear();
  list.mockClear();
  getLast.mockClear();
});

describe('M04-T08 transaction transport', () => {
  for (const [method, url, payload] of [
    ['POST', '/api/v1/transactions', { extra: true }],
    ['GET', '/api/v1/transactions?unknown=1', undefined],
    ['GET', '/api/v1/transactions/last?unknown=1', undefined],
    ['GET', '/api/v1/transactions/bad-id?unknown=1', undefined],
  ] as const) {
    it.each([
      [undefined, 401, 'UNAUTHORIZED'],
      ['Bearer wrong', 401, 'UNAUTHORIZED'],
      ['Bearer unit-ingest', 403, 'INSUFFICIENT_SCOPE'],
    ] as const)(
      `${method} ${url}: auth %s precedes validation`,
      async (authorization, status, code) => {
        const response = await app.inject({
          method,
          url,
          headers: authorization ? { authorization } : {},
          payload,
        });
        expect(response.statusCode).toBe(status);
        expect(response.json().error.code).toBe(code);
        expect(execute).not.toHaveBeenCalled();
        expect(findById).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
        expect(getLast).not.toHaveBeenCalled();
      },
    );
  }

  it.each([
    ['unknown', 'x'],
    ['id', id],
    ['human_ref', 'X'],
    ['status', 'posted'],
    ['source', 'direct_api'],
    ['currency', 'BRL'],
    ['version', 1],
    ['created_at', '2026-10-20'],
    ['updated_at', '2026-10-20'],
    ['voided_at', null],
    ['inbox_message_id', null],
    ['refund_of_transaction_id', null],
  ])('rejects server-controlled or unknown %s', async (field, value) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { ...admin, 'idempotency-key': 'key' },
      payload: { ...body, [field]: value },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, type: 'refund' },
    { ...body, amount: 'bad' },
    { ...body, transaction_date: '2026-02-30' },
    { ...body, transaction_date: '2026/02/20' },
    { ...body, type: 'transfer', destination_account_id: other, category_id: null },
    { ...body, type: 'transfer', destination_account_id: other, merchant_id: null },
  ])('rejects invalid create shape %#', async (payload) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { ...admin, 'idempotency-key': 'key' },
      payload,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '  ', '😀'.repeat(256)])('validates key %s before Core', async (key) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { ...admin, ...(key === undefined ? {} : { 'idempotency-key': key }) },
      payload: body,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['expense', 'income', 'transfer'] as const)(
    'maps %s to GenericCreate and serializes',
    async (type) => {
      const payload =
        type === 'transfer'
          ? { ...body, type, destination_account_id: other, notes: null, source_reference: 'ref' }
          : {
              ...body,
              type,
              category_id: null,
              merchant_id: null,
              notes: null,
              source_reference: 'ref',
            };
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: {
          ...admin,
          'idempotency-key': '😀'.repeat(255),
          'x-correlation-id': 'unit-correlation',
        },
        payload,
      });
      expect(response.statusCode).toBe(201);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type,
          bookId: other,
          accountId: id,
          amount: '35.00',
          transactionDate: '2026-10-20',
          sourceReference: 'ref',
          ...(type === 'transfer'
            ? { destinationAccountId: other }
            : { categoryId: null, merchantId: null }),
        }),
        '😀'.repeat(255),
        { correlationId: 'unit-correlation' },
      );
      expect(response.json().data).toMatchObject({
        id,
        human_ref: 'ABC123',
        amount: '35.00',
        is_refund: false,
      });
      expect(response.json().data).not.toHaveProperty('humanRef');
      expect(response.json().meta).toMatchObject({
        correlation_id: 'unit-correlation',
        request_id: expect.any(String),
      });
      expect(response.body).not.toContain('unit-admin');
    },
  );

  it('maps List query with numeric pagination and read result', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?book_id=${other}&page=2&page_size=10&type=expense&status=posted&search=Lunch`,
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: other,
        page: 2,
        pageSize: 10,
        type: 'expense',
        status: 'posted',
        search: 'Lunch',
      }),
    );
    expect(response.json().data).toMatchObject({ items: [{ id }], total: 1, page_size: 50 });
  });

  it.each(['0', '-1', '1.5', '1e2', '01', 'abc'])('rejects invalid page %s', async (page) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions?page=${page}`,
      headers: admin,
    });
    expect(response.statusCode).toBe(422);
    expect(list).not.toHaveBeenCalled();
  });
  it('rejects page_size 101', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page_size=101',
      headers: admin,
    });
    expect(response.statusCode).toBe(422);
    expect(list).not.toHaveBeenCalled();
  });
  it.each([
    '/api/v1/transactions?unknown=1',
    '/api/v1/transactions?date_from=2026-02-30',
    '/api/v1/transactions?date_to=bad',
    '/api/v1/transactions/last',
    '/api/v1/transactions/last?book_id=bad',
    '/api/v1/transactions/bad',
  ])('rejects invalid read query or path %s', async (url) => {
    const response = await app.inject({ method: 'GET', url, headers: admin });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(findById).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(getLast).not.toHaveBeenCalled();
  });
  it('maps Get Last and Get ID, including missing record', async () => {
    const last = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/last?book_id=${other}`,
      headers: admin,
    });
    expect(last.statusCode).toBe(200);
    expect(getLast).toHaveBeenCalledWith({ bookId: other });
    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/${id}`,
      headers: admin,
    });
    expect(found.statusCode).toBe(200);
    expect(findById).toHaveBeenCalledWith(id);
    findById.mockResolvedValueOnce(null as never);
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/transactions/${other}`,
      headers: admin,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('TRANSACTION_NOT_FOUND');
  });
  it('maps financial retry exhaustion to 503 and unexpected failure to 500', async () => {
    for (const [error, status, code] of [
      [new ConcurrencyError('private'), 503, 'DATABASE_UNAVAILABLE'],
      [new Error('private secret'), 500, 'INTERNAL_ERROR'],
    ] as const) {
      execute.mockRejectedValueOnce(error);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { ...admin, 'idempotency-key': 'key' },
        payload: body,
      });
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
      expect(response.body).not.toContain('private');
    }
  });
});

it('returns DATABASE_UNAVAILABLE when no financial store is configured', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const unavailable = buildApp({ adminToken: 'unit-admin', ingestToken: 'unit-ingest' });
  try {
    const create = await unavailable.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { ...admin, 'idempotency-key': 'key' },
      payload: body,
    });
    expect(create.statusCode).toBe(503);
    expect(create.json().error.code).toBe('DATABASE_UNAVAILABLE');
    const read = await unavailable.inject({
      method: 'GET',
      url: `/api/v1/transactions/${id}`,
      headers: admin,
    });
    expect(read.statusCode).toBe(503);
    expect(read.json().error.code).toBe('DATABASE_UNAVAILABLE');
  } finally {
    await unavailable.close();
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});
