import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from './index.js';
import type { BookRecord } from '@finance-hub/core';

const bookId = randomUUID();
const admin = { authorization: 'Bearer admin', 'x-correlation-id': 'summary-test' };
const data = {
  bookId,
  currency: 'BRL',
  ordinaryIncome: '100.00',
  grossExpenses: '500.00',
  refunds: '200.00',
  netExpenses: '300.00',
  net: '-200.00',
};
const calls: Array<{ dateFrom?: string; dateTo?: string }> = [];
const apps: ReturnType<typeof buildApp>[] = [];
function app() {
  const instance = buildApp({
    adminToken: 'admin',
    ingestToken: 'ingest',
    now: () => new Date('2024-03-01T02:30:00Z'),
    summaryBooks: {
      findById: async (id) =>
        id === bookId
          ? ({ id, currency: 'BRL', timezone: 'America/Sao_Paulo' } as BookRecord)
          : null,
    },
    summaryReads: {
      getSummary: async (query) => {
        calls.push(query);
        return { ordinaryIncome: '100.00', grossExpenses: '500.00', refunds: '200.00' };
      },
    },
  });
  apps.push(instance);
  return instance;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((instance) => instance.close()));
  calls.length = 0;
});
describe('M08-P02 admin Summary API', () => {
  it('returns exact data and meta using the Book local month', async () => {
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/reports/summary?book_id=${bookId}`,
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      book_id: data.bookId,
      currency: data.currency,
      ordinary_income: data.ordinaryIncome,
      gross_expenses: data.grossExpenses,
      refunds: data.refunds,
      net_expenses: data.netExpenses,
      net: data.net,
    });
    expect(Object.keys(body)).toEqual(['data', 'meta']);
    expect(body.meta).toEqual({ request_id: expect.any(String), correlation_id: 'summary-test' });
    expect(calls).toEqual([{ bookId, dateFrom: '2024-02-01', dateTo: '2024-02-29' }]);
  });
  it('requires admin authorization', async () => {
    const instance = app();
    const url = `/api/v1/reports/summary?book_id=${bookId}`;
    expect((await instance.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect(
      (await instance.inject({ method: 'GET', url, headers: { authorization: 'Bearer ingest' } }))
        .statusCode,
    ).toBe(403);
    expect(calls).toEqual([]);
  });
  it('rejects invalid queries and missing Books', async () => {
    const instance = app();
    for (const query of [
      '',
      '?book_id=bad',
      `?book_id=${bookId}&date_from=2024-02-30`,
      `?book_id=${bookId}&date_from=2024-03-01&date_to=2024-02-01`,
      `?book_id=${bookId}&extra=x`,
    ]) {
      const response = await instance.inject({
        method: 'GET',
        url: `/api/v1/reports/summary${query}`,
        headers: admin,
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    const missing = await instance.inject({
      method: 'GET',
      url: `/api/v1/reports/summary?book_id=${randomUUID()}`,
      headers: admin,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('BOOK_NOT_FOUND');
    expect(calls).toEqual([]);
  });
  it('maps unavailable PostgreSQL without leaking details', async () => {
    const instance = buildApp({ adminToken: 'admin', ingestToken: 'ingest' });
    apps.push(instance);
    const response = await instance.inject({
      method: 'GET',
      url: `/api/v1/reports/summary?book_id=${bookId}`,
      headers: admin,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body).not.toContain('DATABASE_URL');
  });
});
