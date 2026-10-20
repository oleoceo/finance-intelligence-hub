import { waitForBlocker } from './schema-helpers.js';
import { verifyColumns } from './schema-helpers.js';
import { describe, it, expect } from 'vitest';
import {
  schemaDatabase,
  insert,
  book,
  account,
  transaction,
  id,
  now,
  rejects,
  indexes,
  columns,
  type Row,
} from './schema-helpers.js';

describe('M02-T04 Audit, Idempotency and Outbox schema', () => {
  const db = schemaDatabase();
  const payload = { amount: '9999999999999999.99', nested: { ok: true, values: [null, '0.10'] } };
  function audit(extra: Row = {}) {
    return {
      id: id(),
      entity_type: 'test',
      entity_id: id(),
      action: 'test',
      source: 'test',
      created_at: now,
      ...extra,
    };
  }
  function key(extra: Row = {}) {
    return {
      id: id(),
      scope: 'test',
      idempotency_key: id(),
      request_hash: 'synthetic',
      status: 'in_progress',
      created_at: now,
      ...extra,
    };
  }
  function outbox(extra: Row = {}) {
    return {
      id: id(),
      event_type: 'test',
      aggregate_type: 'test',
      aggregate_id: id(),
      payload,
      available_at: now,
      created_at: now,
      ...extra,
    };
  }
  it('migrations leave all thirteen business tables empty, especially Outbox', async () => {
    const tables = (
      await db.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'kysely_%' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    expect(tables).toEqual([
      'accounts',
      'audit_events',
      'authorized_senders',
      'books',
      'categories',
      'classification_rules',
      'confirmation_sessions',
      'idempotency_keys',
      'inbox_messages',
      'interpretations',
      'merchants',
      'outbox_events',
      'transactions',
    ]);
    for (const table of tables)
      expect((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('0');
  });
  it('matches Audit columns/indexes and round-trips JSONB with polymorphic references', async () => {
    const c = await columns(db.pool, 'audit_events');
    expect(c.map((c) => c.column_name)).toEqual([
      'id',
      'entity_type',
      'entity_id',
      'action',
      'source',
      'actor_reference',
      'old_data',
      'new_data',
      'correlation_id',
      'created_at',
    ]);
    for (const name of ['old_data', 'new_data'])
      expect(c.find((c) => c.column_name === name).data_type).toBe('jsonb');
    const ix = await indexes(db.pool, 'audit_events');
    expect(ix.idx_audit_entity_history).toContain('(entity_type, entity_id, created_at DESC)');
    expect(ix.idx_audit_action_history).toContain('(action, created_at DESC)');
    expect(ix.idx_audit_correlation_id).toContain('(correlation_id)');
    const row = audit({
      old_data: payload,
      new_data: { amount: '0.30' },
      correlation_id: id(),
      actor_reference: 'synthetic',
    });
    const { rows } = await insert(db.pool, 'audit_events', row);
    expect(rows[0]).toMatchObject({ ...row, created_at: new Date(now) });
    expect(rows[0].created_at.toISOString()).toBe(now);
  });
  it('enforces scoped idempotency uniqueness and completion consistency on INSERT/UPDATE', async () => {
    const row = key();
    await insert(db.pool, 'idempotency_keys', row);
    await rejects(
      insert(db.pool, 'idempotency_keys', { ...row, id: id() }),
      '23505',
      'uq_idempotency_scope_key',
    );
    await insert(db.pool, 'idempotency_keys', { ...row, id: id(), scope: 'other' });
    for (const extra of [
      { status: 'failed' },
      { status: 'pending' },
      { status: 'completed' },
      { completed_at: now },
    ])
      await rejects(insert(db.pool, 'idempotency_keys', key(extra)), '23514');
    await rejects(
      db.pool.query("UPDATE idempotency_keys SET status='completed' WHERE id=$1", [row.id]),
      '23514',
    );
    await rejects(
      db.pool.query('UPDATE idempotency_keys SET completed_at=$1 WHERE id=$2', [now, row.id]),
      '23514',
    );
    const completed = key({
      status: 'completed',
      completed_at: now,
      response_status: 201,
      response_body: payload,
      resource_type: 'test',
      resource_id: id(),
    });
    const { rows } = await insert(db.pool, 'idempotency_keys', completed);
    expect(rows[0].response_body).toEqual(payload);
    await rejects(
      db.pool.query("UPDATE idempotency_keys SET status='in_progress' WHERE id=$1", [completed.id]),
      '23514',
    );
    expect(
      (await columns(db.pool, 'idempotency_keys')).some((c) => c.column_name === 'expires_at'),
    ).toBe(false);
  });
  it('allows exactly one concurrent reservation on separate connections', async () => {
    const a = await db.pool.connect();
    const b = await db.pool.connect();
    const row = key();
    try {
      expect((await a.query('SELECT pg_backend_pid()')).rows[0]).not.toEqual(
        (await b.query('SELECT pg_backend_pid()')).rows[0],
      );
      const winnerPid = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const waiterPid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await a.query('BEGIN');
      await insert(a, 'idempotency_keys', row);
      const loser = rejects(
        insert(b, 'idempotency_keys', { ...row, id: id() }),
        '23505',
        'uq_idempotency_scope_key',
      );
      await waitForBlocker(db.pool, waiterPid, winnerPid);
      await a.query('COMMIT');
      await loser;
      expect(
        (
          await db.pool.query(
            'SELECT count(*) FROM idempotency_keys WHERE scope=$1 AND idempotency_key=$2',
            [row.scope, row.idempotency_key],
          )
        ).rows[0].count,
      ).toBe('1');
    } finally {
      await a.query('ROLLBACK');
      a.release();
      b.release();
    }
  });
  it('matches exact Outbox columns, defaults, four states and JSONB/lock/publication fields', async () => {
    const c = await columns(db.pool, 'outbox_events');
    expect(c.map((c) => c.column_name)).toEqual([
      'id',
      'event_type',
      'aggregate_type',
      'aggregate_id',
      'payload',
      'status',
      'attempts',
      'available_at',
      'locked_at',
      'locked_by',
      'published_at',
      'last_error',
      'created_at',
    ]);
    const initial = (await insert(db.pool, 'outbox_events', outbox())).rows[0];
    expect(initial.status).toBe('pending');
    expect(initial.attempts).toBe(0);
    expect(initial.payload).toEqual(payload);
    for (const status of ['pending', 'processing', 'published', 'failed']) {
      const row = (
        await insert(
          db.pool,
          'outbox_events',
          outbox({
            status,
            locked_at: now,
            locked_by: 'synthetic',
            published_at: now,
            last_error: 'synthetic',
            attempts: 2,
          }),
        )
      ).rows[0];
      expect(row.status).toBe(status);
      expect(row.locked_at.toISOString()).toBe(now);
      expect(row.published_at.toISOString()).toBe(now);
      expect(row.locked_by).toBe('synthetic');
    }
    await rejects(insert(db.pool, 'outbox_events', outbox({ status: 'completed' })), '23514');
    await rejects(
      db.pool.query("UPDATE outbox_events SET status='invalid' WHERE id=$1", [initial.id]),
      '23514',
    );
  });
  for (const withOutbox of [false, true])
    for (const commit of [false, true]) {
      it(`synthetic atomic ${commit ? 'commit' : 'forced rollback'} ${withOutbox ? 'with' : 'without'} Outbox`, async () => {
        const b = await book(db.pool);
        const a = await account(db.pool, b);
        const tx = transaction(b, a);
        const fixtures: Array<[string, Row]> = [
          ['transactions', tx],
          ['audit_events', audit({ entity_id: tx.id, new_data: payload })],
          [
            'idempotency_keys',
            key({
              status: 'completed',
              completed_at: now,
              resource_id: tx.id,
              response_body: payload,
            }),
          ],
        ];
        if (withOutbox) fixtures.push(['outbox_events', outbox({ aggregate_id: tx.id })]);
        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');
          for (const [table, row] of fixtures) await insert(client, table, row);
          if (commit) await client.query('COMMIT');
          else {
            await rejects(client.query('SELECT 1/0'), '22012');
            await client.query('ROLLBACK');
          }
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        for (const [table, row] of fixtures)
          expect(
            (await db.pool.query(`SELECT count(*) FROM ${table} WHERE id=$1`, [row.id])).rows[0]
              .count,
          ).toBe(commit ? '1' : '0');
        if (!withOutbox)
          expect(
            (
              await db.pool.query('SELECT count(*) FROM outbox_events WHERE aggregate_id=$1', [
                tx.id,
              ])
            ).rows[0].count,
          ).toBe('0');
      });
    }
  it('matches complete physical column types, lengths, nullability, defaults and UUID primary keys', async () => {
    await verifyColumns(db.pool, ['audit_events', 'idempotency_keys', 'outbox_events']);
  });
});
