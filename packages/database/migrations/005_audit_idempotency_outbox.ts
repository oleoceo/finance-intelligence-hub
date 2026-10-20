import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * M02-T04 — Audit, idempotency and outbox structure.
 *
 * Creates: audit_events, idempotency_keys, outbox_events
 * with all frozen constraints, foreign keys, unique indexes and CHECKs from 04-DATABASE.md §§83–94.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── audit_events ───────────────────────────────────────────────────
  await db.schema
    .createTable('audit_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('entity_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('entity_id', 'uuid', (col) => col.notNull())
    .addColumn('action', 'varchar(64)', (col) => col.notNull())
    .addColumn('source', 'varchar(32)', (col) => col.notNull())
    .addColumn('actor_reference', 'varchar(255)')
    .addColumn('old_data', 'jsonb')
    .addColumn('new_data', 'jsonb')
    .addColumn('correlation_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .execute();

  // Defaults grant business DML. Remove Audit mutation in the same migration
  // transaction, including down/reapply, when bootstrap roles are present.
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance_hub_app') THEN
      REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM finance_hub_app;
    END IF;
  END $$`.execute(db);

  // Audit indexes
  await db.schema
    .createIndex('idx_audit_entity_history')
    .on('audit_events')
    .columns(['entity_type', 'entity_id', 'created_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_audit_correlation_id')
    .on('audit_events')
    .column('correlation_id')
    .execute();

  await db.schema
    .createIndex('idx_audit_action_history')
    .on('audit_events')
    .columns(['action', 'created_at desc'])
    .execute();

  // ── idempotency_keys ───────────────────────────────────────────────
  await db.schema
    .createTable('idempotency_keys')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('scope', 'varchar(100)', (col) => col.notNull())
    .addColumn('idempotency_key', 'varchar(255)', (col) => col.notNull())
    .addColumn('request_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('status', 'varchar(24)', (col) => col.notNull())
    .addColumn('resource_type', 'varchar(64)')
    .addColumn('resource_id', 'uuid')
    .addColumn('response_status', 'integer')
    .addColumn('response_body', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('completed_at', 'timestamptz')
    .addCheckConstraint('idempotency_status_check', sql`status IN ('in_progress', 'completed')`)
    .addCheckConstraint(
      'idempotency_completion_consistency',
      sql`(status = 'in_progress' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL)`,
    )
    .addUniqueConstraint('uq_idempotency_scope_key', ['scope', 'idempotency_key'])
    .execute();

  // ── outbox_events ──────────────────────────────────────────────────
  await db.schema
    .createTable('outbox_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('event_type', 'varchar(80)', (col) => col.notNull())
    .addColumn('aggregate_type', 'varchar(64)', (col) => col.notNull())
    .addColumn('aggregate_id', 'uuid', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'varchar(24)', (col) => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('available_at', 'timestamptz', (col) => col.notNull())
    .addColumn('locked_at', 'timestamptz')
    .addColumn('locked_by', 'varchar(128)')
    .addColumn('published_at', 'timestamptz')
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint(
      'outbox_status_check',
      sql`status IN ('pending', 'processing', 'published', 'failed')`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop in reverse dependency order
  await db.schema.dropTable('outbox_events').ifExists().execute();
  await db.schema.dropTable('idempotency_keys').ifExists().execute();
  await db.schema.dropTable('audit_events').ifExists().execute();
}
