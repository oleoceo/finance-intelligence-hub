import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * M02-T02 — Inbox, interpretation and confirmation structure.
 *
 * Creates: inbox_messages, interpretations, confirmation_sessions
 * with all frozen constraints, foreign keys, unique indexes and CHECKs from 04-DATABASE.md §§39–54.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── inbox_messages ───────────────────────────────────────────────────
  await db.schema
    .createTable('inbox_messages')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('source', 'varchar(32)', (col) => col.notNull())
    .addColumn('source_instance', 'varchar(255)', (col) => col.notNull())
    .addColumn('source_message_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('sender_reference', 'varchar(255)', (col) => col.notNull())
    .addColumn('authorized_sender_id', 'uuid', (col) => col.notNull())
    .addColumn('raw_text', 'text', (col) => col.notNull())
    .addColumn('raw_payload', 'jsonb')
    .addColumn('received_at', 'timestamptz', (col) => col.notNull())
    .addColumn('processing_status', 'varchar(32)', (col) => col.notNull())
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('processing_started_at', 'timestamptz')
    .addColumn('last_attempt_at', 'timestamptz')
    .addColumn('processed_at', 'timestamptz')
    .addColumn('correlation_id', 'uuid', (col) => col.notNull())
    .addColumn('failure_code', 'varchar(64)')
    .addColumn('failure_message', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint(
      'inbox_processing_status_check',
      sql`processing_status IN ('received', 'processing', 'needs_confirmation', 'processed', 'failed', 'ignored')`,
    )
    .addCheckConstraint('inbox_attempt_count_check', sql`attempt_count >= 0`)
    .addForeignKeyConstraint(
      'fk_inbox_authorized_sender',
      ['authorized_sender_id'],
      'authorized_senders',
      ['id'],
    )
    .addUniqueConstraint('uq_inbox_source_identity', [
      'source',
      'source_instance',
      'source_message_id',
    ])
    .execute();

  // Inbox indexes
  await db.schema
    .createIndex('idx_inbox_status_last_attempt')
    .on('inbox_messages')
    .columns(['processing_status', 'last_attempt_at'])
    .execute();

  await db.schema
    .createIndex('idx_inbox_sender_received')
    .on('inbox_messages')
    .columns(['authorized_sender_id', 'received_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_inbox_sender_ref_received')
    .on('inbox_messages')
    .columns(['sender_reference', 'received_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_inbox_correlation_id')
    .on('inbox_messages')
    .column('correlation_id')
    .execute();

  // ── interpretations ──────────────────────────────────────────────────
  await db.schema
    .createTable('interpretations')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('inbox_message_id', 'uuid', (col) => col.notNull())
    .addColumn('attempt_number', 'integer', (col) => col.notNull())
    .addColumn('intent', 'varchar(64)', (col) => col.notNull())
    .addColumn('confidence', sql`numeric(5,4)`)
    .addColumn('parsed_data', 'jsonb', (col) => col.notNull())
    .addColumn('parser_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('parser_version', 'varchar(64)')
    .addColumn('ai_provider', 'varchar(64)')
    .addColumn('ai_model', 'varchar(128)')
    .addColumn('prompt_version', 'varchar(64)')
    .addColumn('status', 'varchar(32)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint('interpretation_attempt_number_check', sql`attempt_number >= 1`)
    .addCheckConstraint(
      'interpretation_confidence_check',
      sql`confidence IS NULL OR (confidence >= 0 AND confidence <= 1)`,
    )
    .addForeignKeyConstraint(
      'fk_interpretation_inbox_message',
      ['inbox_message_id'],
      'inbox_messages',
      ['id'],
    )
    .addUniqueConstraint('uq_interpretation_message_attempt', [
      'inbox_message_id',
      'attempt_number',
    ])
    .execute();

  // ── confirmation_sessions ────────────────────────────────────────────
  await db.schema
    .createTable('confirmation_sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('channel', 'varchar(32)', (col) => col.notNull())
    .addColumn('sender_reference', 'varchar(255)', (col) => col.notNull())
    .addColumn('authorized_sender_id', 'uuid', (col) => col.notNull())
    .addColumn('inbox_message_id', 'uuid', (col) => col.notNull())
    .addColumn('resolved_by_inbox_message_id', 'uuid')
    .addColumn('action', 'varchar(64)', (col) => col.notNull())
    .addColumn('target_entity_type', 'varchar(64)')
    .addColumn('target_entity_id', 'uuid')
    .addColumn('target_version', 'integer')
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'varchar(24)', (col) => col.notNull())
    .addColumn('resolution_reason', 'varchar(64)')
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('resolved_at', 'timestamptz')
    .addCheckConstraint(
      'confirmation_status_check',
      sql`status IN ('pending', 'confirmed', 'cancelled', 'expired')`,
    )
    .addCheckConstraint(
      'confirmation_resolved_consistency',
      sql`(status = 'pending' AND resolved_at IS NULL) OR (status <> 'pending' AND resolved_at IS NOT NULL)`,
    )
    .addCheckConstraint(
      'confirmation_target_version_check',
      sql`target_version IS NULL OR target_version >= 1`,
    )
    .addForeignKeyConstraint(
      'fk_confirmation_authorized_sender',
      ['authorized_sender_id'],
      'authorized_senders',
      ['id'],
    )
    .addForeignKeyConstraint(
      'fk_confirmation_inbox_message',
      ['inbox_message_id'],
      'inbox_messages',
      ['id'],
    )
    .addForeignKeyConstraint(
      'fk_confirmation_resolved_by_inbox',
      ['resolved_by_inbox_message_id'],
      'inbox_messages',
      ['id'],
    )
    .execute();

  // Partial unique index for one pending confirmation per channel/sender
  await db.schema
    .createIndex('uq_confirmation_pending_channel_sender')
    .on('confirmation_sessions')
    .columns(['channel', 'sender_reference'])
    .where(sql<boolean>`status = 'pending'`)
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop in reverse dependency order
  await db.schema.dropTable('confirmation_sessions').ifExists().execute();
  await db.schema.dropTable('interpretations').ifExists().execute();
  await db.schema.dropTable('inbox_messages').ifExists().execute();
}
