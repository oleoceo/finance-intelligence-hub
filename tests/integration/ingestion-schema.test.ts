import { waitForBlocker } from './schema-helpers.js';
import { verifyColumns } from './schema-helpers.js';
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import {
  schemaDatabase,
  insert,
  sender,
  inbox,
  id,
  now,
  rejects,
  indexes,
  columns,
  type Row,
} from './schema-helpers.js';

describe('M02-T02 ingestion schema', () => {
  const db = schemaDatabase();
  async function origin() {
    const senderId = await sender(db.pool);
    const row = inbox(senderId);
    await insert(db.pool, 'inbox_messages', row);
    return { senderId, row };
  }
  function confirmation(senderId: string, inboxId: string, extra: Row = {}) {
    return {
      id: id(),
      channel: 'test',
      sender_reference: id(),
      authorized_sender_id: senderId,
      inbox_message_id: inboxId,
      action: 'test',
      payload: { amount: '0.10' },
      status: 'pending',
      expires_at: now,
      created_at: now,
      ...extra,
    };
  }
  it('enforces the complete three-part Inbox identity and sender FK', async () => {
    const { senderId, row } = await origin();
    await rejects(
      insert(db.pool, 'inbox_messages', { ...row, id: id() }),
      '23505',
      'uq_inbox_source_identity',
    );
    for (const key of ['source', 'source_instance', 'source_message_id'])
      await insert(db.pool, 'inbox_messages', { ...row, id: id(), [key]: 'other' });
    await rejects(insert(db.pool, 'inbox_messages', inbox(id())), '23503');
    await rejects(
      insert(db.pool, 'inbox_messages', inbox(senderId, { authorized_sender_id: null })),
      '23502',
    );
    await rejects(db.pool.query('DELETE FROM authorized_senders WHERE id=$1', [senderId]), '23503');
  });
  it('accepts exactly six processing statuses and nonnegative attempts on insert/update', async () => {
    const s = await sender(db.pool);
    for (const status of [
      'received',
      'processing',
      'needs_confirmation',
      'processed',
      'failed',
      'ignored',
    ]) {
      const { rows } = await insert(
        db.pool,
        'inbox_messages',
        inbox(s, { processing_status: status }),
      );
      expect(rows[0].attempt_count).toBe(0);
    }
    for (const status of ['pending', 'completed', ''])
      await rejects(
        insert(db.pool, 'inbox_messages', inbox(s, { processing_status: status })),
        '23514',
        'inbox_processing_status_check',
      );
    await rejects(insert(db.pool, 'inbox_messages', inbox(s, { attempt_count: -1 })), '23514');
    const row = inbox(s, { attempt_count: 2 });
    await insert(db.pool, 'inbox_messages', row);
    await rejects(
      db.pool.query('UPDATE inbox_messages SET attempt_count=-1 WHERE id=$1', [row.id]),
      '23514',
    );
    await rejects(
      db.pool.query("UPDATE inbox_messages SET processing_status='invalid' WHERE id=$1", [row.id]),
      '23514',
    );
  });
  it('enforces Interpretation attempt identity/range/confidence and restrictive origin FK', async () => {
    const { row } = await origin();
    const interpretation = {
      id: id(),
      inbox_message_id: row.id,
      attempt_number: 1,
      intent: 'unknown',
      parsed_data: { amount: '0.10' },
      parser_type: 'test',
      status: 'test',
      created_at: now,
    };
    for (const [i, confidence] of [null, '0.0000', '0.5000', '1.0000'].entries())
      await insert(db.pool, 'interpretations', {
        ...interpretation,
        id: id(),
        attempt_number: i + 1,
        confidence,
      });
    await rejects(insert(db.pool, 'interpretations', interpretation), '23505');
    for (const confidence of ['-0.0001', '1.0001'])
      await rejects(
        insert(db.pool, 'interpretations', {
          ...interpretation,
          id: id(),
          attempt_number: 10,
          confidence,
        }),
        '23514',
      );
    await rejects(
      insert(db.pool, 'interpretations', { ...interpretation, attempt_number: 0 }),
      '23514',
    );
    await rejects(
      insert(db.pool, 'interpretations', { ...interpretation, inbox_message_id: id() }),
      '23503',
    );
    await rejects(
      db.pool.query('UPDATE interpretations SET confidence=1.1 WHERE inbox_message_id=$1', [
        row.id,
      ]),
      '23514',
    );
    await rejects(
      db.pool.query('UPDATE interpretations SET attempt_number=0 WHERE inbox_message_id=$1', [
        row.id,
      ]),
      '23514',
    );
    await rejects(db.pool.query('DELETE FROM inbox_messages WHERE id=$1', [row.id]), '23503');
  });
  it('enforces four Confirmation statuses, resolution consistency and target_version', async () => {
    const { senderId, row } = await origin();
    for (const status of ['pending', 'confirmed', 'cancelled', 'expired']) {
      const c = confirmation(senderId, row.id, {
        status,
        resolved_at: status === 'pending' ? null : now,
        target_version: 1,
      });
      await insert(db.pool, 'confirmation_sessions', c);
      await rejects(
        db.pool.query('UPDATE confirmation_sessions SET resolved_at=$1 WHERE id=$2', [
          status === 'pending' ? now : null,
          c.id,
        ]),
        '23514',
      );
      await rejects(
        insert(db.pool, 'confirmation_sessions', {
          ...c,
          id: id(),
          resolved_at: status === 'pending' ? now : null,
        }),
        '23514',
      );
    }
    for (const status of ['superseded', 'completed', ''])
      await rejects(
        insert(
          db.pool,
          'confirmation_sessions',
          confirmation(senderId, row.id, { status, resolved_at: now }),
        ),
        '23514',
      );
    for (const target_version of [0, -1])
      await rejects(
        insert(
          db.pool,
          'confirmation_sessions',
          confirmation(senderId, row.id, { target_version }),
        ),
        '23514',
      );
    const c = confirmation(senderId, row.id);
    await insert(db.pool, 'confirmation_sessions', c);
    await rejects(
      db.pool.query('UPDATE confirmation_sessions SET target_version=0 WHERE id=$1', [c.id]),
      '23514',
    );
  });
  it('enforces pending uniqueness per channel/sender, allows resolved history and other channels', async () => {
    const { senderId, row } = await origin();
    const c = confirmation(senderId, row.id);
    await insert(db.pool, 'confirmation_sessions', c);
    await rejects(
      insert(db.pool, 'confirmation_sessions', { ...c, id: id() }),
      '23505',
      'uq_confirmation_pending_channel_sender',
    );
    await insert(db.pool, 'confirmation_sessions', { ...c, id: id(), channel: 'other' });
    const resolved = { ...c, id: id(), status: 'cancelled', resolved_at: now };
    await insert(db.pool, 'confirmation_sessions', resolved);
    await rejects(
      db.pool.query(
        "UPDATE confirmation_sessions SET status='pending', resolved_at=NULL WHERE id=$1",
        [resolved.id],
      ),
      '23505',
    );
    await db.pool.query(
      "UPDATE confirmation_sessions SET status='confirmed', resolved_at=$1 WHERE id=$2",
      [now, c.id],
    );
    await insert(db.pool, 'confirmation_sessions', { ...c, id: id() });
  });
  it('serializes competing pending sessions on two independent connections', async () => {
    const { senderId, row } = await origin();
    const c = confirmation(senderId, row.id);
    const a = await db.pool.connect();
    const b = await db.pool.connect();
    try {
      expect((await a.query('SELECT pg_backend_pid()')).rows[0]).not.toEqual(
        (await b.query('SELECT pg_backend_pid()')).rows[0],
      );
      const winnerPid = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const waiterPid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await a.query('BEGIN');
      await insert(a, 'confirmation_sessions', c);
      const loser = rejects(
        insert(b, 'confirmation_sessions', { ...c, id: id() }),
        '23505',
        'uq_confirmation_pending_channel_sender',
      );
      await waitForBlocker(db.pool, waiterPid, winnerPid);
      await a.query('COMMIT');
      await loser;
      expect(
        (
          await db.pool.query(
            'SELECT count(*) FROM confirmation_sessions WHERE channel=$1 AND sender_reference=$2',
            [c.channel, c.sender_reference],
          )
        ).rows[0].count,
      ).toBe('1');
    } finally {
      await a.query('ROLLBACK');
      a.release();
      b.release();
    }
  });
  it('preserves all Confirmation foreign keys and referenced history', async () => {
    const { senderId, row } = await origin();
    const resolution = inbox(senderId);
    await insert(db.pool, 'inbox_messages', resolution);
    const c = confirmation(senderId, row.id, {
      status: 'confirmed',
      resolved_at: now,
      resolved_by_inbox_message_id: resolution.id,
    });
    for (const key of ['authorized_sender_id', 'inbox_message_id', 'resolved_by_inbox_message_id'])
      await rejects(
        insert(db.pool, 'confirmation_sessions', { ...c, id: id(), [key]: id() }),
        '23503',
      );
    await insert(db.pool, 'confirmation_sessions', c);
    for (const inboxId of [row.id, resolution.id])
      await rejects(db.pool.query('DELETE FROM inbox_messages WHERE id=$1', [inboxId]), '23503');
    await rejects(
      db.pool.query(
        'UPDATE confirmation_sessions SET resolved_by_inbox_message_id=$1 WHERE id=$2',
        [id(), c.id],
      ),
      '23503',
    );
    await rejects(db.pool.query('DELETE FROM authorized_senders WHERE id=$1', [senderId]), '23503');
  });
  it('matches ingestion index ordering and confidence/timestamp metadata', async () => {
    const ix = await indexes(db.pool, 'inbox_messages');
    expect(ix.idx_inbox_status_last_attempt).toContain('(processing_status, last_attempt_at)');
    expect(ix.idx_inbox_sender_received).toContain('(authorized_sender_id, received_at DESC)');
    expect(ix.idx_inbox_sender_ref_received).toContain('(sender_reference, received_at DESC)');
    expect(ix.idx_inbox_correlation_id).toContain('(correlation_id)');
    const c = await columns(db.pool, 'interpretations');
    expect(c.find((c) => c.column_name === 'confidence')).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 5,
      numeric_scale: 4,
      is_nullable: 'YES',
    });
    expect(c.find((c) => c.column_name === 'created_at').data_type).toBe(
      'timestamp with time zone',
    );
    const pending = (await indexes(db.pool, 'confirmation_sessions'))
      .uq_confirmation_pending_channel_sender;
    expect(pending).toContain('UNIQUE');
    expect(pending).toContain('(channel, sender_reference)');
    expect(pending).toContain("'pending'");
  });
  it('persists retry metadata, JSON and cancelled/superseded TTL across a new connection', async () => {
    const { senderId, row } = await origin();
    const payload = { amount: '0.10', nested: [null, true] };
    await db.pool.query(
      "UPDATE inbox_messages SET processing_status='failed', attempt_count=2, processing_started_at=$1, last_attempt_at=$1, processed_at=$1, raw_payload=$2, failure_code='test', failure_message='synthetic' WHERE id=$3",
      [now, payload, row.id],
    );
    const c = confirmation(senderId, row.id, {
      status: 'cancelled',
      resolved_at: now,
      resolution_reason: 'superseded_by_new_command',
      target_version: 2,
      payload,
    });
    await insert(db.pool, 'confirmation_sessions', c);
    const fresh = new Pool({ connectionString: db.connectionString });
    try {
      const saved = (await fresh.query('SELECT * FROM confirmation_sessions WHERE id=$1', [c.id]))
        .rows[0];
      expect(saved.expires_at.toISOString()).toBe(now);
      expect(saved.resolution_reason).toBe('superseded_by_new_command');
      expect(saved.payload).toEqual(payload);
      expect(saved.target_version).toBe(2);
      const retry = (await fresh.query('SELECT * FROM inbox_messages WHERE id=$1', [row.id]))
        .rows[0];
      expect(retry.attempt_count).toBe(2);
      expect(retry.raw_payload).toEqual(payload);
      expect(retry.last_attempt_at.toISOString()).toBe(now);
      expect(retry.failure_code).toBe('test');
    } finally {
      await fresh.end();
    }
  });
  it('matches complete physical column types, lengths, nullability, defaults and UUID primary keys', async () => {
    await verifyColumns(db.pool, ['inbox_messages', 'interpretations', 'confirmation_sessions']);
  });
});
