import { verifyColumns } from './schema-helpers.js';
import { describe, it, expect } from 'vitest';
import {
  schemaDatabase,
  insert,
  book,
  account,
  sender,
  inbox,
  named,
  transaction,
  id,
  now,
  rejects,
  indexes,
  columns,
  type Row,
} from './schema-helpers.js';

describe('M02-T03 Transaction schema', () => {
  const db = schemaDatabase();
  async function context(currency = 'BRL') {
    const b = await book(db.pool, currency);
    return { b, a: await account(db.pool, b, currency), dest: await account(db.pool, b, currency) };
  }
  it('preserves NUMERIC(18,2), DATE, TIMESTAMPTZ and exact decimal strings', async () => {
    const c = await columns(db.pool, 'transactions');
    expect(c.find((c) => c.column_name === 'amount')).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 18,
      numeric_scale: 2,
      is_nullable: 'NO',
    });
    expect(c.find((c) => c.column_name === 'transaction_date').data_type).toBe('date');
    for (const key of ['created_at', 'updated_at', 'voided_at'])
      expect(c.find((c) => c.column_name === key).data_type).toBe('timestamp with time zone');
    expect(c.some((c) => c.column_name === 'occurred_at')).toBe(false);
    const { b, a } = await context();
    for (const amount of ['0.10', '0.20', '9999999999999999.99']) {
      const { rows } = await insert(db.pool, 'transactions', transaction(b, a, { amount }));
      expect(rows[0].amount).toBe(amount);
      expect(typeof rows[0].amount).toBe('string');
      expect(rows[0].version).toBe(1);
    }
    expect(
      (await db.pool.query('SELECT 0.10::numeric(18,2) + 0.20::numeric(18,2) AS sum')).rows[0].sum,
    ).toBe('0.30');
    await rejects(
      insert(db.pool, 'transactions', transaction(b, a, { amount: '10000000000000000.00' })),
      '22003',
    );
  });
  it('accepts the three types and two statuses, rejects invalid amount/version/currency', async () => {
    const { b, a, dest } = await context();
    for (const type of ['expense', 'income', 'transfer'])
      for (const status of ['posted', 'voided']) {
        await insert(
          db.pool,
          'transactions',
          transaction(b, a, {
            type,
            status,
            destination_account_id: type === 'transfer' ? dest : null,
            voided_at: status === 'voided' ? now : null,
            void_reason: status === 'voided' ? 'test' : null,
          }),
        );
      }
    for (const extra of [
      { type: 'refund' },
      { type: 'adjustment' },
      { status: 'pending' },
      { status: 'active' },
      { amount: '0.00' },
      { amount: '-0.01' },
      { version: 0 },
      { version: -1 },
      { currency: 'brl' },
    ])
      await rejects(insert(db.pool, 'transactions', transaction(b, a, extra)), '23514');
    for (const key of ['amount', 'version', 'type', 'status'])
      await rejects(insert(db.pool, 'transactions', transaction(b, a, { [key]: null })), '23502');
    const row = transaction(b, a);
    await insert(db.pool, 'transactions', row);
    for (const assignment of ['amount=0', 'version=0', "type='refund'", "status='pending'"])
      await rejects(
        db.pool.query(`UPDATE transactions SET ${assignment} WHERE id=$1`, [row.id]),
        '23514',
      );
  });
  it('rejects missing, cross-Book and cross-currency financial references', async () => {
    const local = await context();
    const other = await context();
    const usd = await context('USD');
    const cat = named({ book_id: other.b });
    await insert(db.pool, 'categories', cat);
    const foreignRefund = transaction(other.b, other.a);
    await insert(db.pool, 'transactions', foreignRefund);
    const usdRefund = transaction(usd.b, usd.a, { currency: 'USD' });
    await insert(db.pool, 'transactions', usdRefund);
    const invalid: Row[] = [
      { book_id: id() },
      { account_id: id() },
      { currency: 'USD' },
      { category_id: id() },
      { category_id: cat.id },
      { merchant_id: id() },
      { inbox_message_id: id() },
      { type: 'income', refund_of_transaction_id: id() },
    ];
    for (const foreign of [other, usd]) {
      invalid.push(
        { account_id: foreign.a },
        { type: 'transfer', destination_account_id: foreign.a },
      );
    }
    for (const r of [foreignRefund, usdRefund])
      invalid.push({ type: 'income', refund_of_transaction_id: r.id });
    for (const extra of invalid)
      await rejects(insert(db.pool, 'transactions', transaction(local.b, local.a, extra)), '23503');
    const row = transaction(local.b, local.a);
    await insert(db.pool, 'transactions', row);
    await rejects(
      db.pool.query('UPDATE transactions SET account_id=$1 WHERE id=$2', [other.a, row.id]),
      '23503',
    );
    await rejects(db.pool.query('DELETE FROM accounts WHERE id=$1', [local.a]), '23503');
    await rejects(db.pool.query('DELETE FROM books WHERE id=$1', [local.b]), '23503');
  });
  it('enforces Transfer and linked Refund structural shape, without later Core rules', async () => {
    const { b, a, dest } = await context();
    const original = transaction(b, a);
    await insert(db.pool, 'transactions', original);
    await insert(
      db.pool,
      'transactions',
      transaction(b, dest, { type: 'income', refund_of_transaction_id: original.id }),
    );
    for (const extra of [
      { type: 'transfer' },
      { type: 'transfer', destination_account_id: a },
      { destination_account_id: dest },
      { type: 'income', destination_account_id: dest },
      { refund_of_transaction_id: original.id },
      { type: 'transfer', destination_account_id: dest, refund_of_transaction_id: original.id },
    ])
      await rejects(insert(db.pool, 'transactions', transaction(b, a, extra)), '23514');
    await rejects(
      db.pool.query('UPDATE transactions SET destination_account_id=$1 WHERE id=$2', [
        dest,
        original.id,
      ]),
      '23514',
    );
    await rejects(db.pool.query('DELETE FROM transactions WHERE id=$1', [original.id]), '23503');
  });
  it('enforces every posted/voided metadata NULL branch on INSERT and UPDATE', async () => {
    const { b, a } = await context();
    const row = transaction(b, a);
    await insert(db.pool, 'transactions', row);
    for (const status of ['posted', 'voided'])
      for (const voided_at of [null, now])
        for (const void_reason of [null, 'test']) {
          const valid =
            status === 'posted'
              ? voided_at === null && void_reason === null
              : voided_at !== null && void_reason !== null;
          if (valid) {
            await insert(
              db.pool,
              'transactions',
              transaction(b, a, { status, voided_at, void_reason }),
            );
            continue;
          }
          await rejects(
            insert(db.pool, 'transactions', transaction(b, a, { status, voided_at, void_reason })),
            '23514',
            'transactions_void_consistency',
          );
          await rejects(
            db.pool.query(
              'UPDATE transactions SET status=$1, voided_at=$2, void_reason=$3 WHERE id=$4',
              [status, voided_at, void_reason, row.id],
            ),
            '23514',
            'transactions_void_consistency',
          );
        }
  });
  it('enforces human_ref and non-null Inbox uniqueness, permits multiple null origins', async () => {
    const { b, a } = await context();
    const s = await sender(db.pool);
    const origin = inbox(s);
    await insert(db.pool, 'inbox_messages', origin);
    const row = transaction(b, a, { inbox_message_id: origin.id });
    await insert(db.pool, 'transactions', row);
    await rejects(
      insert(db.pool, 'transactions', transaction(b, a, { human_ref: row.human_ref })),
      '23505',
      'uq_transactions_human_ref',
    );
    await rejects(
      insert(db.pool, 'transactions', transaction(b, a, { inbox_message_id: origin.id })),
      '23505',
      'uq_transactions_inbox_message',
    );
    for (let i = 0; i < 2; i++) await insert(db.pool, 'transactions', transaction(b, a));
    await rejects(db.pool.query('DELETE FROM inbox_messages WHERE id=$1', [origin.id]), '23503');
  });
  it('matches every documented financial index including DESC and predicates', async () => {
    const ix = await indexes(db.pool, 'transactions');
    for (const [name, definition] of Object.entries({
      book_date: '(book_id, transaction_date DESC)',
      book_status_date: '(book_id, status, transaction_date DESC)',
      account_date: '(account_id, transaction_date DESC)',
      dest_account_date: '(destination_account_id, transaction_date DESC)',
      category_date: '(category_id, transaction_date DESC)',
      merchant_date: '(merchant_id, transaction_date DESC)',
      refund_status: '(refund_of_transaction_id, status)',
      last: '(book_id, created_at DESC, id DESC)',
      summary: '(book_id, transaction_date, type, status)',
    }))
      expect(ix[`idx_transactions_${name}`]).toContain(definition);
    expect(ix.idx_transactions_last).toContain("WHERE ((status)::text = 'posted'::text)");
    expect(ix.uq_transactions_inbox_message).toContain('UNIQUE');
    expect(ix.uq_transactions_inbox_message).toContain('WHERE (inbox_message_id IS NOT NULL)');
  });
  it('canonical Last uses created_at DESC then id DESC, excludes voided, allows backdating', async () => {
    const { b, a } = await context();
    const early = transaction(b, a, { created_at: '2026-01-01T00:00:00Z' });
    const lower = transaction(b, a, {
      id: '01900000-0000-7000-8000-000000000001',
      transaction_date: '2025-01-01',
    });
    const winner = transaction(b, a, {
      id: '01900000-0000-7000-8000-000000000002',
      transaction_date: '2024-01-01',
    });
    const voided = transaction(b, a, {
      status: 'voided',
      voided_at: now,
      void_reason: 'test',
      created_at: '2026-02-01T00:00:00Z',
    });
    for (const row of [early, lower, winner, voided]) await insert(db.pool, 'transactions', row);
    const { rows } = await db.pool.query(
      "SELECT id FROM transactions WHERE book_id=$1 AND status='posted' ORDER BY created_at DESC, id DESC",
      [b],
    );
    expect(rows.map((r) => r.id)).toEqual([winner.id, lower.id, early.id]);
  });
  it('matches complete physical column types, lengths, nullability, defaults and UUID primary keys', async () => {
    await verifyColumns(db.pool, ['transactions']);
  });
});
