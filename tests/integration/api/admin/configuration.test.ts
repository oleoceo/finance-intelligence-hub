import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { MasterDataTransactionContextT04 } from '@finance-hub/core';
import { buildApp } from '../../../../apps/api/src/index.js';
import { t04Database } from '../../repositories/t04-fixtures.js';

const database = t04Database();
const headers = {
  authorization: 'Bearer synthetic-api-admin',
  'x-correlation-id': 't05.integration',
};
let app: FastifyInstance;
beforeAll(async () => {
  app = buildApp({
    adminToken: 'synthetic-api-admin',
    ingestToken: 'synthetic-api-ingest',
    transactions: { runInTransaction: database.run },
  });
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
});
const bases = [
  'books',
  'accounts',
  'categories',
  'merchants',
  'admin/classification-rules',
  'admin/authorized-senders',
] as const;
type Resource = Record<string, string | boolean | number | null> & { id: string };
async function request(
  method: InjectOptions['method'],
  path: string,
  payload?: object,
  instance = app,
) {
  return instance.inject({
    method,
    url: `/api/v1/${path}`,
    headers,
    ...(payload ? { payload } : {}),
  });
}
async function create(base: string, payload: object) {
  const result = await request('POST', base, payload);
  expect(result.statusCode, result.body).toBe(201);
  return result.json().data as Resource;
}
async function book() {
  return create('books', { name: randomUUID(), currency: 'BRL' });
}
async function bootstrap() {
  const b = await book();
  const a = await create('accounts', {
    book_id: b.id,
    name: randomUUID(),
    type: 'checking',
    institution_name: 'Bank',
    notes: 'Note',
  });
  const c = await create('categories', { book_id: b.id, name: randomUUID() });
  const m = await create('merchants', {
    name: randomUUID(),
    type: 'shop',
    tax_identifier: 'identity',
  });
  const r = await create('admin/classification-rules', {
    match_type: 'contains',
    pattern: ' Test PATTERN ',
    target_book_id: b.id,
    target_account_id: a.id,
    target_category_id: c.id,
    target_merchant_id: m.id,
  });
  const s = await create('admin/authorized-senders', {
    channel: 'custom-channel',
    sender_reference: randomUUID(),
    default_book_id: b.id,
    default_account_id: a.id,
  });
  return [b, a, c, m, r, s];
}
function error(
  result: Awaited<ReturnType<typeof request>>,
  status: number,
  code: string,
  reason?: string,
) {
  expect(result.statusCode, result.body).toBe(status);
  expect(result.json().error).toMatchObject({ code, details: reason ? { reason } : {} });
  expect(result.body).not.toMatch(/constraint|postgresql|SELECT|INSERT|stack|synthetic-api/);
}

it('bootstraps all six resources through all 24 routes with exact envelope and persisted reads', async () => {
  const records = await bootstrap();
  const keys = [
    ['name', 'normalized_name', 'currency', 'timezone', 'archived_at'],
    [
      'book_id',
      'name',
      'normalized_name',
      'type',
      'currency',
      'institution_name',
      'notes',
      'archived_at',
    ],
    ['book_id', 'name', 'normalized_name', 'parent_category_id', 'type', 'archived_at'],
    ['name', 'normalized_name', 'type', 'tax_identifier', 'archived_at'],
    [
      'priority',
      'match_type',
      'pattern',
      'normalized_pattern',
      'source',
      'target_book_id',
      'target_account_id',
      'target_category_id',
      'target_merchant_id',
    ],
    ['channel', 'sender_reference', 'name', 'default_book_id', 'default_account_id'],
  ];
  for (let i = 0; i < bases.length; i++) {
    const record = records[i];
    const base = bases[i];
    expect(Object.keys(record).sort()).toEqual(
      [...keys[i], 'id', 'active', 'created_at', 'updated_at'].sort(),
    );
    expect(record.active).toBe(true);
    expect(record.created_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    const get = await request('GET', `${base}/${record.id}`);
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({
      data: record,
      meta: { request_id: expect.any(String), correlation_id: 't05.integration' },
    });
    const list = await request('GET', base);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toContainEqual(record);
    const patch = await request(
      'PATCH',
      `${base}/${record.id}`,
      i === 4 ? { priority: -10 } : { name: `updated-${randomUUID()}` },
    );
    expect(patch.statusCode, patch.body).toBe(200);
    expect((await request('GET', `${base}/${record.id}`)).json().data).toEqual(patch.json().data);
  }
  expect(records[0].timezone).toBe('America/Sao_Paulo');
  expect(records[1].currency).toBe('BRL');
  expect(records[2].type).toBe('both');
  expect(records[4]).toMatchObject({
    priority: 100,
    source: 'manual',
    normalized_pattern: 'test pattern',
  });
  expect(
    (await database.pool.query('select count(*)::int as count from transactions')).rows[0].count,
  ).toBe(0);
  expect(
    (await database.pool.query('select count(*)::int as count from outbox_events')).rows[0].count,
  ).toBe(0);
});

it.each(bases)('%s missing get/patch is deterministic', async (base) => {
  const code = base.startsWith('admin/')
    ? 'VALIDATION_ERROR'
    : `${base === 'categories' ? 'CATEGORY' : base.slice(0, -1).toUpperCase()}_NOT_FOUND`;
  for (const method of ['GET', 'PATCH'] as const)
    error(
      await request(
        method,
        `${base}/${randomUUID()}`,
        method === 'PATCH' ? { active: true } : undefined,
      ),
      404,
      code,
      base.startsWith('admin/') ? 'resource_not_found' : undefined,
    );
});

it('Sender POST false, identity preservation, null clearing and inactive default archive protection', async () => {
  const b = await book();
  const a = await create('accounts', { book_id: b.id, name: 'A', type: 'cash' });
  const reference = ` ${randomUUID()} `;
  const s = await create('admin/authorized-senders', {
    channel: ' custom ',
    sender_reference: reference,
    name: 'Name',
    active: false,
    default_book_id: b.id,
    default_account_id: a.id,
  });
  expect(s).toMatchObject({ active: false, channel: ' custom ', sender_reference: reference });
  error(await request('PATCH', `books/${b.id}`, { active: false }), 409, 'DEFAULT_BOOK_IN_USE');
  error(
    await request('PATCH', `accounts/${a.id}`, { active: false }),
    409,
    'DEFAULT_ACCOUNT_IN_USE',
  );
  const cleared = await request('PATCH', `admin/authorized-senders/${s.id}`, {
    name: null,
    default_account_id: null,
    default_book_id: null,
  });
  expect(cleared.statusCode).toBe(200);
  expect(cleared.json().data).toMatchObject({
    name: null,
    default_account_id: null,
    default_book_id: null,
    active: false,
  });
  expect((await request('PATCH', `books/${b.id}`, { active: false })).statusCode).toBe(200);
  expect((await request('PATCH', `accounts/${a.id}`, { active: false })).statusCode).toBe(200);
});

it('archives, reads, lists, repeats archive, restores and atomically patches the four lifecycle resources', async () => {
  const records = await bootstrap();
  await request('PATCH', `admin/authorized-senders/${records[5].id}`, {
    default_book_id: null,
    default_account_id: null,
  });
  for (let i = 0; i < 4; i++) {
    const path = `${bases[i]}/${records[i].id}`;
    const result = await request('PATCH', path, { active: false, name: `archive-${randomUUID()}` });
    expect(result.statusCode, result.body).toBe(200);
    const archived = result.json().data;
    expect(archived.active).toBe(false);
    expect(archived.archived_at).toEqual(expect.any(String));
    expect((await request('GET', path)).json().data).toEqual(archived);
    expect((await request('GET', `${bases[i]}?active=false`)).json().data).toContainEqual(archived);
    expect((await request('PATCH', path, { active: false })).json().data.archived_at).toBe(
      archived.archived_at,
    );
    expect((await request('PATCH', path, { active: true })).json().data).toMatchObject({
      active: true,
      archived_at: null,
    });
  }
});

it('Account nullable fields clear; currency no-op succeeds and mismatched currency fails', async () => {
  const b = await book();
  const a = await create('accounts', {
    book_id: b.id,
    name: 'A',
    type: 'cash',
    institution_name: null,
    notes: null,
  });
  expect(
    (
      await request('PATCH', `accounts/${a.id}`, {
        institution_name: 'bank',
        notes: 'note',
        currency: 'BRL',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await request('PATCH', `accounts/${a.id}`, { institution_name: null, notes: null })).json()
      .data,
  ).toMatchObject({ institution_name: null, notes: null });
  error(await request('PATCH', `accounts/${a.id}`, { currency: 'USD' }), 422, 'CURRENCY_MISMATCH');
  error(
    await request('PATCH', `books/${b.id}`, { currency: 'USD' }),
    422,
    'VALIDATION_ERROR',
    'immutable_field',
  );
});

it.each(['posted', 'voided'] as const)(
  '%s history protects Book currency and Account currency/type including transfer destination',
  async (status) => {
    const b = await book();
    const a = await create('accounts', { book_id: b.id, name: 'source', type: 'cash' });
    const dest = await create('accounts', { book_id: b.id, name: 'dest', type: 'checking' });
    const tx = randomUUID();
    await database.pool.query(
      `insert into transactions(id,human_ref,book_id,account_id,destination_account_id,type,status,amount,currency,description,transaction_date,source,voided_at,void_reason,created_at,updated_at) values($1,$2,$3,$4,$5,'transfer',$6,'1.00','BRL','fixture','2026-01-01','manual',$7,$8,now(),now())`,
      [
        tx,
        tx.replaceAll('-', '').slice(0, 16),
        b.id,
        a.id,
        dest.id,
        status,
        status === 'voided' ? new Date() : null,
        status === 'voided' ? 'fixture' : null,
      ],
    );
    error(
      await request('PATCH', `books/${b.id}`, { currency: 'USD' }),
      422,
      'VALIDATION_ERROR',
      'immutable_field',
    );
    for (const account of [a, dest])
      for (const patch of [{ type: 'savings' }, { currency: 'USD' }])
        error(
          await request('PATCH', `accounts/${account.id}`, patch),
          422,
          'VALIDATION_ERROR',
          'immutable_field',
        );
    expect(
      (
        await request('PATCH', `accounts/${dest.id}`, {
          type: 'checking',
          currency: 'BRL',
          active: false,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await database.pool.query('select status from transactions where id=$1', [tx])).rows[0]
        .status,
    ).toBe(status);
  },
);

it('Category reparent, null root, same-Book, missing and inactive parent, self and longer cycles', async () => {
  const b = await book();
  const other = await book();
  const a = await create('categories', { book_id: b.id, name: 'A' });
  const child = await create('categories', { book_id: b.id, name: 'B', parent_category_id: a.id });
  const c = await create('categories', { book_id: b.id, name: 'C', parent_category_id: child.id });
  const foreign = await create('categories', { book_id: other.id, name: 'foreign' });
  error(
    await request('PATCH', `categories/${a.id}`, { parent_category_id: a.id }),
    422,
    'CATEGORY_CYCLE',
  );
  error(
    await request('PATCH', `categories/${a.id}`, { parent_category_id: c.id }),
    422,
    'CATEGORY_CYCLE',
  );
  error(
    await request('PATCH', `categories/${a.id}`, { parent_category_id: foreign.id }),
    422,
    'VALIDATION_ERROR',
    'category_parent_book_mismatch',
  );
  error(
    await request('PATCH', `categories/${a.id}`, { parent_category_id: randomUUID() }),
    404,
    'CATEGORY_NOT_FOUND',
  );
  await request('PATCH', `categories/${c.id}`, { active: false });
  error(
    await request('PATCH', `categories/${a.id}`, { parent_category_id: c.id }),
    422,
    'CATEGORY_CYCLE',
  );
  expect(
    (await request('PATCH', `categories/${child.id}`, { parent_category_id: null })).json().data
      .parent_category_id,
  ).toBeNull();
  expect(
    (await request('PATCH', `categories/${a.id}`, { parent_category_id: child.id })).statusCode,
  ).toBe(200);
});

it('Rule complete effective targets, independent targets, context, activity and clearing', async () => {
  const [b, a, c, m] = await bootstrap();
  const other = await book();
  for (const [key, target] of [
    ['target_book_id', b],
    ['target_account_id', a],
    ['target_category_id', c],
    ['target_merchant_id', m],
  ] as const) {
    const rule = await create('admin/classification-rules', {
      pattern: ' alias ',
      match_type: 'exact',
      [key]: target.id,
      priority: -2147483648,
    });
    expect(rule.priority).toBe(-2147483648);
    error(
      await request('PATCH', `admin/classification-rules/${rule.id}`, { [key]: null }),
      422,
      'VALIDATION_ERROR',
      'missing_target',
    );
  }
  error(
    await request('POST', 'admin/classification-rules', { pattern: 'x', match_type: 'exact' }),
    422,
    'VALIDATION_ERROR',
    'missing_target',
  );
  error(
    await request('POST', 'admin/classification-rules', {
      pattern: 'x',
      match_type: 'exact',
      target_book_id: other.id,
      target_account_id: a.id,
    }),
    422,
    'VALIDATION_ERROR',
    'incompatible_targets',
  );
  const rule = await create('admin/classification-rules', {
    pattern: 'x',
    match_type: 'contains',
    target_category_id: c.id,
    target_merchant_id: m.id,
  });
  await request('PATCH', `categories/${c.id}`, { active: false });
  error(
    await request('PATCH', `admin/classification-rules/${rule.id}`, { active: false }),
    422,
    'CATEGORY_INACTIVE',
  );
  expect(
    (
      await request('PATCH', `admin/classification-rules/${rule.id}`, {
        target_category_id: null,
        active: false,
      })
    ).statusCode,
  ).toBe(200);
  expect((await request('GET', `admin/classification-rules/${rule.id}`)).json().data).toMatchObject(
    { target_category_id: null, target_merchant_id: m.id, active: false },
  );
});

it('deterministic existence then compatibility then activity precedence for Rule and Sender', async () => {
  const b = await book();
  const other = await book();
  const a = await create('accounts', { book_id: other.id, name: 'A', type: 'cash' });
  await request('PATCH', `books/${b.id}`, { active: false });
  error(
    await request('POST', 'admin/classification-rules', {
      pattern: 'x',
      match_type: 'exact',
      target_book_id: b.id,
      target_account_id: randomUUID(),
    }),
    404,
    'ACCOUNT_NOT_FOUND',
  );
  error(
    await request('POST', 'admin/classification-rules', {
      pattern: 'x',
      match_type: 'exact',
      target_book_id: b.id,
      target_account_id: a.id,
    }),
    422,
    'VALIDATION_ERROR',
    'incompatible_targets',
  );
  error(
    await request('POST', 'admin/authorized-senders', {
      channel: 'custom',
      sender_reference: randomUUID(),
      default_account_id: randomUUID(),
    }),
    422,
    'DEFAULT_ACCOUNT_REQUIRED_BOOK',
  );
  error(
    await request('POST', 'admin/authorized-senders', {
      channel: 'custom',
      sender_reference: randomUUID(),
      default_book_id: b.id,
      default_account_id: randomUUID(),
    }),
    404,
    'ACCOUNT_NOT_FOUND',
  );
  error(
    await request('POST', 'admin/authorized-senders', {
      channel: 'custom',
      sender_reference: randomUUID(),
      default_book_id: b.id,
      default_account_id: a.id,
    }),
    422,
    'DEFAULT_ACCOUNT_BOOK_MISMATCH',
  );
});

it.each(['book', 'account', 'category', 'merchant'] as const)(
  'Rule missing and inactive %s mapping',
  async (entity) => {
    const targets = await database.targets();
    const target = targets[entity];
    error(
      await request('POST', 'admin/classification-rules', {
        pattern: 'x',
        match_type: 'exact',
        [`target_${entity}_id`]: randomUUID(),
      }),
      404,
      `${entity.toUpperCase()}_NOT_FOUND`,
    );
    const base = entity === 'category' ? 'categories' : `${entity}s`;
    await request('PATCH', `${base}/${target.id}`, { active: false });
    error(
      await request('POST', 'admin/classification-rules', {
        pattern: 'x',
        match_type: 'exact',
        [`target_${entity}_id`]: target.id,
      }),
      422,
      `${entity.toUpperCase()}_INACTIVE`,
    );
  },
);

it('rejects auth and malformed input without persistence; valid Sender false reaches Core', async () => {
  const before = (await database.pool.query('select count(*)::int as n from books')).rows[0].n;
  for (const authorization of [undefined, 'Bearer invalid', 'Bearer synthetic-api-ingest']) {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/books',
      headers: authorization ? { authorization } : {},
      payload: { name: randomUUID(), currency: 'BRL', unknown: 1 },
    });
    expect(result.statusCode).toBe(authorization === 'Bearer synthetic-api-ingest' ? 403 : 401);
  }
  expect((await database.pool.query('select count(*)::int as n from books')).rows[0].n).toBe(
    before,
  );
  expect(
    (
      await create('admin/authorized-senders', {
        channel: 'new-channel',
        sender_reference: randomUUID(),
        active: false,
      })
    ).active,
  ).toBe(false);
});

it('Sender validates missing/inactive defaults and account compatibility even on inactive create', async () => {
  const b = await book();
  const a = await create('accounts', { book_id: b.id, name: 'A', type: 'cash' });
  const payload = { channel: 'custom', sender_reference: randomUUID(), active: false };
  error(
    await request('POST', 'admin/authorized-senders', {
      ...payload,
      default_book_id: randomUUID(),
    }),
    404,
    'BOOK_NOT_FOUND',
  );
  await request('PATCH', `accounts/${a.id}`, { active: false });
  error(
    await request('POST', 'admin/authorized-senders', {
      ...payload,
      default_book_id: b.id,
      default_account_id: a.id,
    }),
    422,
    'ACCOUNT_INACTIVE',
  );
  await request('PATCH', `books/${b.id}`, { active: false });
  error(
    await request('POST', 'admin/authorized-senders', { ...payload, default_book_id: b.id }),
    422,
    'BOOK_INACTIVE',
  );
});

it('Book invalid timezone, Merchant null clearing and Rule priority upper bound', async () => {
  error(
    await request('POST', 'books', { name: randomUUID(), currency: 'BRL', timezone: 'Not/AZone' }),
    422,
    'VALIDATION_ERROR',
    'invalid_request',
  );
  const m = await create('merchants', {
    name: randomUUID(),
    type: 'shop',
    tax_identifier: 'arbitrary',
  });
  expect(
    (await request('PATCH', `merchants/${m.id}`, { type: null, tax_identifier: null })).json().data,
  ).toMatchObject({ type: null, tax_identifier: null });
  expect(
    (
      await create('admin/classification-rules', {
        match_type: 'exact',
        pattern: 'x',
        target_merchant_id: m.id,
        priority: 2147483647,
      })
    ).priority,
  ).toBe(2147483647);
});

it('ties use UUID ordering for equal creation time, names and rule priority', async () => {
  const b1 = await book();
  const b2 = await book();
  const a1 = await create('accounts', { book_id: b1.id, name: 'same', type: 'cash' });
  const a2 = await create('accounts', { book_id: b2.id, name: 'same', type: 'cash' });
  const c1 = await create('categories', { book_id: b1.id, name: 'same' });
  const c2 = await create('categories', { book_id: b2.id, name: 'same' });
  const m1 = await create('merchants', { name: 'same' });
  const m2 = await create('merchants', { name: 'same' });
  const r1 = await create('admin/classification-rules', {
    match_type: 'exact',
    pattern: 'x',
    target_book_id: b1.id,
  });
  const r2 = await create('admin/classification-rules', {
    match_type: 'exact',
    pattern: 'x',
    target_book_id: b2.id,
  });
  const s1 = await create('admin/authorized-senders', {
    channel: 'tie',
    sender_reference: randomUUID(),
  });
  const s2 = await create('admin/authorized-senders', {
    channel: 'tie',
    sender_reference: randomUUID(),
  });
  const pairs = [
    [b1, b2],
    [a1, a2],
    [c1, c2],
    [m1, m2],
    [r1, r2],
    [s1, s2],
  ];
  const tables = [
    'books',
    'accounts',
    'categories',
    'merchants',
    'classification_rules',
    'authorized_senders',
  ];
  for (let i = 0; i < 6; i++) {
    const ids = pairs[i].map((r) => r.id);
    // Table identifiers come exclusively from this fixed fixture allowlist.
    await database.pool.query(
      `update ${tables[i]} set created_at='2026-01-01T00:00:00Z' where id=any($1::uuid[])`,
      [ids],
    );
    const listed = (await request('GET', bases[i])).json().data as Resource[];
    const selected = listed.filter((r) => ids.includes(r.id)).map((r) => r.id);
    const expected = [...ids].sort();
    if ([0, 1, 5].includes(i)) expected.reverse();
    expect(selected).toEqual(expected);
  }
});

it('stable ordering with equal sort keys and exact supported filters', async () => {
  const records = await bootstrap();
  for (let i = 0; i < bases.length; i++) {
    const response = await request('GET', bases[i]);
    const data = response.json().data as Resource[];
    const expected = [...data].sort((a, b) => {
      const cmp = (x: unknown, y: unknown) => (x! < y! ? -1 : x! > y! ? 1 : 0);
      if (i === 2 || i === 3) return cmp(a.normalized_name, b.normalized_name) || cmp(a.id, b.id);
      if (i === 4)
        return (
          Number(a.priority) - Number(b.priority) ||
          cmp(a.created_at, b.created_at) ||
          cmp(a.id, b.id)
        );
      return -(cmp(a.created_at, b.created_at) || cmp(a.id, b.id));
    });
    expect(data).toEqual(expected);
    expect(
      (await request('GET', `${bases[i]}?active=true`))
        .json()
        .data.every((r: Resource) => r.active),
    ).toBe(true);
  }
  const filters = [
    ['accounts', 'book_id', records[0].id],
    ['categories', 'book_id', records[0].id],
    ['categories', 'type', 'both'],
    ['admin/classification-rules', 'match_type', 'contains'],
    ['admin/classification-rules', 'target_book_id', records[0].id],
    ['admin/authorized-senders', 'channel', 'custom-channel'],
  ];
  for (const [base, key, value] of filters) {
    const result = await request('GET', `${base}?${key}=${value}`);
    expect(result.statusCode).toBe(200);
    expect(result.json().data.length).toBeGreaterThan(0);
    expect(result.json().data.every((r: Resource) => r[key] === value)).toBe(true);
  }
  const child = await create('categories', {
    book_id: records[0].id,
    name: randomUUID(),
    parent_category_id: records[2].id,
  });
  expect(
    (await request('GET', `categories?parent_category_id=${records[2].id}`)).json().data,
  ).toEqual([child]);
});

// Reuse canonical T04 barriers: independent PostgreSQL backends, observed lock wait,
// first HTTP operation completed while its transaction remains open; no sleeps.
async function inContext(
  ctx: MasterDataTransactionContextT04,
  method: InjectOptions['method'],
  path: string,
  payload: object,
) {
  const isolated = buildApp({
    adminToken: 'synthetic-api-admin',
    transactions: { runInTransaction: (fn) => fn(ctx) },
  });
  try {
    const result = await request(method, path, payload, isolated);
    return { status: result.statusCode, body: result.json() };
  } finally {
    await isolated.close();
  }
}
describe('API PostgreSQL barriers', () => {
  it.each([
    'books',
    'accounts',
    'categories',
    'category-children',
    'admin/authorized-senders',
    'merchants',
  ])('concurrent duplicate %s preserves the selected uniqueness policy', async (kind) => {
    const b = await book();
    const parent = await create('categories', { book_id: b.id, name: randomUUID() });
    const base = kind === 'category-children' ? 'categories' : kind;
    const name = randomUUID();
    const payload =
      kind === 'books'
        ? { name, currency: 'BRL' }
        : kind === 'accounts'
          ? { name, book_id: b.id, type: 'cash' }
          : kind === 'categories'
            ? { name, book_id: b.id }
            : kind === 'category-children'
              ? { name, book_id: b.id, parent_category_id: parent.id }
              : kind === 'admin/authorized-senders'
                ? { channel: 'concurrent', sender_reference: name }
                : { name };
    let release!: () => void;
    let held!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      held = resolve;
    });
    const first = database.run(async (ctx) => {
      const result = await inContext(ctx, 'POST', base, payload);
      expect(result.status).toBe(201);
      held();
      await hold;
      return result;
    });
    // Capture failure immediately so a rejected operation cannot become unhandled.
    const settled = Promise.allSettled([first]);
    let second: ReturnType<typeof request> | undefined;
    try {
      await Promise.race([started, first.then(() => {})]);
      second = request('POST', base, payload);
      if (kind === 'merchants') {
        const result = await second;
        expect(result.statusCode).toBe(201);
        // First insert is still uncommitted: duplicate succeeds on another connection.
        expect(
          (
            await database.pool.query('select count(*)::int as n from merchants where name=$1', [
              name,
            ])
          ).rows[0].n,
        ).toBe(1);
      } else {
        const deadline = Date.now() + 7000;
        let observed = false;
        while (Date.now() < deadline) {
          const rows = await database.pool.query(
            "select pid,pg_blocking_pids(pid) as blockers from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid <> pg_backend_pid()",
          );
          if (rows.rows.some((row) => row.blockers.length > 0 && !row.blockers.includes(row.pid))) {
            observed = true;
            break;
          }
        }
        expect(observed).toBe(true);
        release();
        error(await second, 409, 'VALIDATION_ERROR', 'duplicate_configuration');
      }
    } finally {
      release();
      await settled;
      if (second) await second;
    }
    expect((await settled)[0].status).toBe('fulfilled');
    if (kind === 'merchants')
      expect(
        (
          await database.pool.query('select count(*)::int as n from merchants where name=$1', [
            name,
          ])
        ).rows[0].n,
      ).toBe(2);
  });
  it('opposing category moves serialize and cannot form a cycle', async () => {
    const b = await book();
    const a = await create('categories', { book_id: b.id, name: 'A' });
    const c = await create('categories', { book_id: b.id, name: 'C' });
    const results = await database.coordinated(
      (ctx) => inContext(ctx, 'PATCH', `categories/${a.id}`, { parent_category_id: c.id }),
      (ctx) => inContext(ctx, 'PATCH', `categories/${c.id}`, { parent_category_id: a.id }),
    );
    expect(results).toMatchObject([
      { status: 'fulfilled', value: { status: 200 } },
      { status: 'fulfilled', value: { status: 422, body: { error: { code: 'CATEGORY_CYCLE' } } } },
    ]);
    expect((await request('GET', `categories/${c.id}`)).json().data.parent_category_id).toBeNull();
  });
  it.each([true, false])(
    'Sender assignment/archive order assignmentFirst=%s',
    async (assignmentFirst) => {
      const b = await book();
      const s = await create('admin/authorized-senders', {
        channel: 'custom',
        sender_reference: randomUUID(),
        active: false,
      });
      const assign = (ctx: MasterDataTransactionContextT04) =>
        inContext(ctx, 'PATCH', `admin/authorized-senders/${s.id}`, { default_book_id: b.id });
      const archive = (ctx: MasterDataTransactionContextT04) =>
        inContext(ctx, 'PATCH', `books/${b.id}`, { active: false });
      const results = await database.coordinated(
        assignmentFirst ? assign : archive,
        assignmentFirst ? archive : assign,
      );
      expect(results).toMatchObject([
        { status: 'fulfilled', value: { status: 200 } },
        {
          status: 'fulfilled',
          value: {
            status: assignmentFirst ? 409 : 422,
            body: { error: { code: assignmentFirst ? 'DEFAULT_BOOK_IN_USE' : 'BOOK_INACTIVE' } },
          },
        },
      ]);
    },
  );
  it.each([true, false])('Rule target/archive order ruleFirst=%s', async (ruleFirst) => {
    const target = await create('merchants', { name: randomUUID() });
    const rule = (ctx: MasterDataTransactionContextT04) =>
      inContext(ctx, 'POST', 'admin/classification-rules', {
        pattern: 'x',
        match_type: 'exact',
        target_merchant_id: target.id,
      });
    const archive = (ctx: MasterDataTransactionContextT04) =>
      inContext(ctx, 'PATCH', `merchants/${target.id}`, { active: false });
    const results = await database.coordinated(
      ruleFirst ? rule : archive,
      ruleFirst ? archive : rule,
    );
    expect(results).toMatchObject([
      { status: 'fulfilled', value: { status: ruleFirst ? 201 : 200 } },
      { status: 'fulfilled', value: { status: ruleFirst ? 200 : 422 } },
    ]);
  });
});
