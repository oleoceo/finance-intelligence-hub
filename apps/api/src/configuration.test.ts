import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './index.js';

const id = '019a0000-0000-7000-8000-000000000001';
const admin = { authorization: 'Bearer synthetic-admin' };
const entities = [
  ['books', { name: 'Book', currency: 'BRL' }],
  ['accounts', { book_id: id, name: 'Account', type: 'checking' }],
  ['categories', { book_id: id, name: 'Category' }],
  ['merchants', { name: 'Merchant' }],
  ['admin/classification-rules', { match_type: 'exact', pattern: 'Pattern', target_book_id: id }],
  ['admin/authorized-senders', { channel: 'custom', sender_reference: 'reference' }],
] as const;
const runInTransaction = vi.fn(async () => {
  throw new Error('Unexpected use-case invocation');
});
const app = buildApp({
  adminToken: 'synthetic-admin',
  ingestToken: 'synthetic-ingest',
  transactions: { runInTransaction },
});
beforeAll(() => app.ready());
beforeEach(() => {
  runInTransaction.mockClear();
});
afterAll(() => app.close());

describe.each(entities)('%s transport', (entity, valid) => {
  const base = `/api/v1/${entity}`;
  for (const [method, url] of [
    ['POST', base],
    ['GET', base],
    ['GET', `${base}/${id}`],
    ['PATCH', `${base}/${id}`],
  ] as const) {
    it.each([
      [undefined, 401, 'UNAUTHORIZED'],
      ['Bearer invalid', 401, 'UNAUTHORIZED'],
      ['Bearer synthetic-ingest', 403, 'INSUFFICIENT_SCOPE'],
    ] as const)(
      `${method} authorization %s wins over invalid shape`,
      async (authorization, status, code) => {
        const result = await app.inject({
          method,
          url: `${url}?unknown=1`,
          headers: authorization ? { authorization } : {},
          ...(method === 'POST' || method === 'PATCH'
            ? { payload: { server_controlled: true } }
            : {}),
        });
        expect(result.statusCode).toBe(status);
        expect(result.json().error.code).toBe(code);
        expect(result.body).not.toContain('synthetic');
        expect(runInTransaction).not.toHaveBeenCalled();
      },
    );
  }
  it.each([
    'id',
    'normalized_name',
    'normalized_pattern',
    'archived_at',
    'created_at',
    'updated_at',
    'source',
    'human_ref',
    'status',
    'version',
    'voided_at',
    'refund_of_transaction_id',
    'unexpected',
  ])(`rejects undeclared %s on POST and PATCH`, async (field) => {
    for (const method of ['POST', 'PATCH'] as const) {
      const result = await app.inject({
        method,
        url: method === 'POST' ? base : `${base}/${id}`,
        headers: admin,
        payload: { ...(method === 'POST' ? valid : { active: true }), [field]: 'value' },
      });
      expect(result.statusCode).toBe(422);
      expect(result.json().error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { reason: 'invalid_request' },
      });
    }
    expect(runInTransaction).not.toHaveBeenCalled();
  });
  it('rejects empty PATCH and boolean coercion', async () => {
    for (const payload of [{}, { active: 'false' }, { active: 0 }, { active: null }]) {
      expect(
        (await app.inject({ method: 'PATCH', url: `${base}/${id}`, headers: admin, payload }))
          .statusCode,
      ).toBe(422);
    }
    expect(runInTransaction).not.toHaveBeenCalled();
  });
  it('rejects malformed path and query values', async () => {
    for (const suffix of [
      '/not-a-uuid',
      '?active=1',
      '?active=TRUE',
      '?active=false&active=true',
      '?page=1',
      '?active=true&extra=1',
      '?name=',
      '?priority=not-a-number',
    ]) {
      const result = await app.inject({
        method: 'GET',
        url: `${base}${suffix}`,
        headers: admin,
      });
      expect(result.statusCode).toBe(422);
    }
    expect(runInTransaction).not.toHaveBeenCalled();
  });
  it('rejects missing required fields', async () => {
    const stripped: Record<string, unknown> = {};
    for (const key of Object.keys(valid)) {
      if (key !== 'timezone' && key !== 'match_type' && key !== 'pattern') {
        stripped[key] = undefined;
      }
    }
    const result = await app.inject({
      method: 'POST',
      url: base,
      headers: admin,
      payload: stripped,
    });
    expect(result.statusCode).toBe(422);
    expect(runInTransaction).not.toHaveBeenCalled();
  });
  it('distinguishes malformed JSON and schema errors, after authorization', async () => {
    for (const [headers, status] of [
      [admin, 400],
      [{}, 401],
      [{ authorization: 'Bearer synthetic-ingest' }, 403],
    ] as const) {
      const result = await app.inject({
        method: 'POST',
        url: base,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: '{',
      });
      expect(result.statusCode).toBe(status);
      if (status === 400) expect(result.json().error.details.reason).toBe('malformed_json');
    }
    expect(
      (await app.inject({ method: 'POST', url: base, headers: admin, payload: [] })).statusCode,
    ).toBe(422);
    expect(runInTransaction).not.toHaveBeenCalled();
  });
});

it.each(entities.slice(0, 5))('%s rejects initial active even when true', async (entity, valid) => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/v1/${entity}`,
        headers: admin,
        payload: { ...valid, active: true },
      })
    ).statusCode,
  ).toBe(422);
  expect(runInTransaction).not.toHaveBeenCalled();
});
it.each([
  ['accounts', 'POST', { book_id: id, name: 'A', type: 'cash', currency: 'BRL' }],
  ['accounts', 'PATCH', { book_id: id }],
  ['categories', 'PATCH', { book_id: id }],
  ['admin/authorized-senders', 'PATCH', { channel: 'custom' }],
  ['admin/authorized-senders', 'PATCH', { sender_reference: 'x' }],
  [
    'admin/classification-rules',
    'POST',
    { match_type: 'exact', pattern: 'x', target_book_id: id, priority: '100' },
  ],
  [
    'admin/classification-rules',
    'POST',
    { match_type: 'exact', pattern: 'x', target_book_id: id, priority: 2147483648 },
  ],
  [
    'admin/classification-rules',
    'POST',
    { match_type: 'exact', pattern: 'x', target_book_id: id, priority: -2147483649 },
  ],
  ['books', 'POST', { name: 'İ'.repeat(120), currency: 'BRL' }],
  ['books', 'POST', { name: ' ', currency: 'BRL' }],
  ['books', 'POST', { name: true, currency: 'BRL' }],
] as const)('%s %s rejects invalid contract %j', async (entity, method, payload) => {
  const result = await app.inject({
    method,
    url: `/api/v1/${entity}${method === 'PATCH' ? `/${id}` : ''}`,
    headers: admin,
    payload,
  });
  expect(result.statusCode).toBe(422);
  expect(runInTransaction).not.toHaveBeenCalled();
});

it('rejects identical role credentials without disclosing the value', () => {
  expect(() => buildApp({ adminToken: 'synthetic-same', ingestToken: 'synthetic-same' })).toThrow(
    'must be distinct',
  );
});
it('requires credentials even when none are configured', async () => {
  const isolated = buildApp({
    adminToken: '',
    ingestToken: '',
    transactions: { runInTransaction },
  });
  try {
    expect((await isolated.inject({ url: '/api/v1/books', headers: admin })).statusCode).toBe(401);
  } finally {
    await isolated.close();
  }
});

it.each(entities)('%s auth precedes malformed UUID validation', async (entity) => {
  for (const method of ['GET', 'PATCH'] as const) {
    const result = await app.inject({
      method,
      url: `/api/v1/${entity}/invalid`,
      headers: { authorization: 'Bearer synthetic-ingest' },
      ...(method === 'PATCH' ? { payload: {} } : {}),
    });
    expect(result.statusCode).toBe(403);
  }
  expect(runInTransaction).not.toHaveBeenCalled();
});

it.each([
  ['accounts', 'book_id=invalid'],
  ['categories', 'parent_category_id=null'],
  ['categories', 'type=transfer'],
  ['admin/classification-rules', 'match_type=regex'],
  ['admin/classification-rules', 'target_book_id=invalid'],
  ['admin/authorized-senders', 'channel='],
] as const)('%s rejects malformed filter %s', async (entity, query) => {
  expect((await app.inject({ url: `/api/v1/${entity}?${query}`, headers: admin })).statusCode).toBe(
    422,
  );
  expect(runInTransaction).not.toHaveBeenCalled();
});

it.each([
  [0, 'name', 120],
  [0, 'timezone', 64],
  [1, 'name', 160],
  [1, 'institution_name', 160],
  [2, 'name', 160],
  [3, 'name', 200],
  [3, 'type', 50],
  [3, 'tax_identifier', 32],
  [4, 'pattern', 500],
  [5, 'name', 160],
  [5, 'channel', 32],
  [5, 'sender_reference', 255],
] as const)('rejects storage overflow entity=%i field=%s max=%i', async (index, field, max) => {
  const [entity, valid] = entities[index];
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/v1/${entity}`,
        headers: admin,
        payload: { ...valid, [field]: 'x'.repeat(max + 1) },
      })
    ).statusCode,
  ).toBe(422);
  expect(runInTransaction).not.toHaveBeenCalled();
});

// Regression: AuthorizedSender.name is raw VARCHAR(160) with no normalized_name.
it('accepts AuthorizedSender.name with Unicode expansion without normalizing', async () => {
  // 'İ' (U+0130) lowercases to 'i̇' (2 chars). 80 'İ' = 80 raw chars.
  const unicodeName = 'İ'.repeat(80);
  expect([...unicodeName].length).toBe(80);
  const fake = {
    id: '019a0000-0000-7000-8000-000000000001',
    channel: 'whatsapp',
    senderReference: 'ref',
    name: unicodeName,
    defaultBookId: null,
    defaultAccountId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // Short-circuit Core to avoid needing a real transaction context; prove transport validation accepts raw <=160
  const mockSuccess = vi.fn(async () => fake);
  const isolated = buildApp({
    adminToken: 'synthetic-admin',
    ingestToken: 'synthetic-ingest',
    transactions: { runInTransaction: mockSuccess as never },
  });
  try {
    await isolated.ready();
    const result = await isolated.inject({
      method: 'POST',
      url: '/api/v1/admin/authorized-senders',
      headers: admin,
      payload: { channel: 'whatsapp', sender_reference: 'ref', name: unicodeName },
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().data.name).toBe(unicodeName);
  } finally {
    await isolated.close();
  }
});
