import { beforeAll, afterAll, expect } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { migrateUp } from '@finance-hub/database';
import { schemaContract } from './schema-contract.js';

export const chain = [
  '001_technical_validation',
  '002_master_data',
  '003_ingestion_structure',
  '004_transaction_structure',
  '005_audit_idempotency_outbox',
];
export const now = '2026-01-15T12:00:00.000Z';
export const id = randomUUID;
export type Row = Record<string, unknown>;
export type Db = Pool | PoolClient;

// Identifiers come only from test source, values always use pg parameters.
export async function insert(db: Db, table: string, row: Row) {
  const keys = Object.keys(row);
  return db.query(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    Object.values(row),
  );
}
export function schemaDatabase(migrate = true) {
  let container: Awaited<ReturnType<GenericContainer['start']>>;
  let pool: Pool;
  let connectionString: string;
  beforeAll(async () => {
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'schema_test',
        POSTGRES_USER: 'test_admin',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    connectionString = `postgresql://test_admin:${password}@${container.getHost()}:${container.getMappedPort(5432)}/schema_test`;
    pool = new Pool({ connectionString });
    if (migrate) await migrateUp({ connectionString });
  });
  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });
  return {
    get pool() {
      return pool;
    },
    get connectionString() {
      return connectionString;
    },
  };
}
export function named(extra: Row = {}) {
  return {
    id: id(),
    name: 'Synthetic',
    normalized_name: id(),
    created_at: now,
    updated_at: now,
    ...extra,
  };
}
export async function book(db: Db, currency = 'BRL') {
  const row = named({ currency });
  await insert(db, 'books', row);
  return row.id;
}
export async function account(db: Db, bookId: string, currency = 'BRL') {
  const row = named({ book_id: bookId, currency, type: 'checking' });
  await insert(db, 'accounts', row);
  return row.id;
}
export async function sender(db: Db) {
  const row = {
    id: id(),
    channel: 'test',
    sender_reference: id(),
    created_at: now,
    updated_at: now,
  };
  await insert(db, 'authorized_senders', row);
  return row.id;
}
export function inbox(senderId: string, extra: Row = {}) {
  return {
    id: id(),
    source: 'test',
    source_instance: 'test',
    source_message_id: id(),
    sender_reference: 'synthetic',
    authorized_sender_id: senderId,
    raw_text: 'synthetic',
    received_at: now,
    processing_status: 'received',
    correlation_id: id(),
    created_at: now,
    updated_at: now,
    ...extra,
  };
}
export function transaction(bookId: string, accountId: string, extra: Row = {}) {
  return {
    id: id(),
    human_ref: id().replaceAll('-', '').slice(0, 16),
    book_id: bookId,
    account_id: accountId,
    type: 'expense',
    status: 'posted',
    amount: '0.10',
    currency: 'BRL',
    description: 'Synthetic',
    transaction_date: '2026-01-15',
    source: 'test',
    created_at: now,
    updated_at: now,
    ...extra,
  };
}
export async function rejects(promise: Promise<unknown>, code: string, constraint?: string) {
  await expect(promise).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
}

// Observe a real PostgreSQL lock wait before releasing the winning transaction.
export async function waitForBlocker(db: Db, waiter: number, blocker: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await db.query('SELECT pg_blocking_pids($1) AS blockers', [waiter]);
    if (rows[0].blockers.includes(blocker)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing reservation did not enter the expected PostgreSQL lock wait');
}
export async function indexes(db: Db, table: string) {
  const { rows } = await db.query(
    'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2',
    ['public', table],
  );
  return Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef])) as Record<string, string>;
}
export async function columns(db: Db, table: string) {
  return (
    await db.query(
      'SELECT column_name, data_type, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      ['public', table],
    )
  ).rows;
}

export async function verifyColumns(db: Db, tables: string[]) {
  const types: Record<string, string> = {
    JSONB: 'jsonb',
    UUID: 'uuid',
    VARCHAR: 'character varying',
    NUMERIC: 'numeric',
    BOOLEAN: 'boolean',
    INTEGER: 'integer',
    TEXT: 'text',
    TIMESTAMPTZ: 'timestamp with time zone',
    DATE: 'date',
  };
  for (const table of tables) {
    const actual = await columns(db, table);
    const expected = schemaContract[table];
    expect(
      actual.map((c) => c.column_name),
      table,
    ).toEqual(expected.map((c) => c[0]));
    for (const [name, type, nullable, defaultValue] of expected) {
      const column = actual.find((c) => c.column_name === name);
      const [base, ...numbers] = type.split(/[(),]/);
      expect(column, `${table}.${name}`).toMatchObject({
        data_type: types[base],
        is_nullable: nullable,
      });
      if (base === 'VARCHAR') expect(column.character_maximum_length).toBe(Number(numbers[0]));
      if (base === 'NUMERIC') {
        expect(column.numeric_precision).toBe(Number(numbers[0]));
        expect(column.numeric_scale).toBe(Number(numbers[1]));
      }
      if (defaultValue === null)
        expect(column.column_default, `${table}.${name} default`).toBeNull();
      else expect(column.column_default.toLowerCase()).toContain(defaultValue.toLowerCase());
    }
    const pk = await db.query(
      "SELECT a.attname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid=$1::regclass AND c.contype='p'",
      [table],
    );
    expect(pk.rows).toEqual([{ attname: 'id' }]);
  }
}
