import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * M02-T03 — Transaction structure and financial constraints.
 *
 * Creates: transactions with full V0.1 shape, FKs, CHECKs, unique constraints and indexes
 * from 04-DATABASE.md §§55–82.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── transactions ─────────────────────────────────────────────────────
  await db.schema
    .createTable('transactions')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('human_ref', 'varchar(16)', (col) => col.notNull())
    .addColumn('book_id', 'uuid', (col) => col.notNull())
    .addColumn('type', 'varchar(16)', (col) => col.notNull())
    .addColumn('status', 'varchar(16)', (col) => col.notNull())
    .addColumn('amount', sql`numeric(18,2)`, (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull())
    .addColumn('account_id', 'uuid', (col) => col.notNull())
    .addColumn('destination_account_id', 'uuid')
    .addColumn('category_id', 'uuid')
    .addColumn('merchant_id', 'uuid')
    .addColumn('description', 'varchar(500)', (col) => col.notNull())
    .addColumn('notes', 'text')
    .addColumn('transaction_date', 'date', (col) => col.notNull())
    .addColumn('source', 'varchar(32)', (col) => col.notNull())
    .addColumn('source_reference', 'varchar(255)')
    .addColumn('inbox_message_id', 'uuid')
    .addColumn('refund_of_transaction_id', 'uuid')
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('voided_at', 'timestamptz')
    .addColumn('void_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    // CHECK constraints
    .addCheckConstraint('transactions_type_check', sql`type IN ('expense', 'income', 'transfer')`)
    .addCheckConstraint('transactions_status_check', sql`status IN ('posted', 'voided')`)
    .addCheckConstraint('transactions_amount_positive', sql`amount > 0`)
    .addCheckConstraint('transactions_version_check', sql`version >= 1`)
    .addCheckConstraint('transactions_currency_format', sql`currency ~ '^[A-Z]{3}$'`)
    .addCheckConstraint(
      'transactions_refund_is_income',
      sql`refund_of_transaction_id IS NULL OR type = 'income'`,
    )
    .addCheckConstraint(
      'transactions_expense_income_no_destination',
      sql`(type IN ('expense', 'income') AND destination_account_id IS NULL) OR type = 'transfer'`,
    )
    .addCheckConstraint(
      'transactions_transfer_requires_destination',
      sql`type <> 'transfer' OR destination_account_id IS NOT NULL`,
    )
    .addCheckConstraint(
      'transactions_transfer_different_accounts',
      sql`type <> 'transfer' OR account_id <> destination_account_id`,
    )
    .addCheckConstraint(
      'transactions_transfer_no_refund',
      sql`type <> 'transfer' OR refund_of_transaction_id IS NULL`,
    )
    .addCheckConstraint(
      'transactions_void_consistency',
      sql`(status = 'posted' AND voided_at IS NULL AND void_reason IS NULL) OR (status = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)`,
    )
    // Foreign keys
    .addForeignKeyConstraint('fk_transactions_book', ['book_id'], 'books', ['id'])
    .addForeignKeyConstraint('fk_transactions_book_currency', ['book_id', 'currency'], 'books', [
      'id',
      'currency',
    ])
    .addForeignKeyConstraint(
      'fk_transactions_source_account',
      ['account_id', 'book_id', 'currency'],
      'accounts',
      ['id', 'book_id', 'currency'],
    )
    .addForeignKeyConstraint(
      'fk_transactions_dest_account',
      ['destination_account_id', 'book_id', 'currency'],
      'accounts',
      ['id', 'book_id', 'currency'],
    )
    .addForeignKeyConstraint('fk_transactions_category', ['category_id', 'book_id'], 'categories', [
      'id',
      'book_id',
    ])
    .addForeignKeyConstraint('fk_transactions_merchant', ['merchant_id'], 'merchants', ['id'])
    .addForeignKeyConstraint(
      'fk_transactions_inbox_message',
      ['inbox_message_id'],
      'inbox_messages',
      ['id'],
    )
    .addForeignKeyConstraint(
      'fk_transactions_refund_origin',
      ['refund_of_transaction_id'],
      'transactions',
      ['id'],
    )
    .addForeignKeyConstraint(
      'fk_transactions_refund_composite',
      ['refund_of_transaction_id', 'book_id', 'currency'],
      'transactions',
      ['id', 'book_id', 'currency'],
    )
    // Unique constraints
    .addUniqueConstraint('uq_transactions_human_ref', ['human_ref'])
    .addUniqueConstraint('uq_transactions_id_book_currency', ['id', 'book_id', 'currency'])
    .execute();

  // Partial unique index: at most one financial Transaction per originating Inbox
  await db.schema
    .createIndex('uq_transactions_inbox_message')
    .on('transactions')
    .column('inbox_message_id')
    .where(sql<boolean>`inbox_message_id IS NOT NULL`)
    .unique()
    .execute();

  // ── Indexes for access patterns (database §§80–82) ───────────────────
  await db.schema
    .createIndex('idx_transactions_book_date')
    .on('transactions')
    .columns(['book_id', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_book_status_date')
    .on('transactions')
    .columns(['book_id', 'status', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_account_date')
    .on('transactions')
    .columns(['account_id', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_dest_account_date')
    .on('transactions')
    .columns(['destination_account_id', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_category_date')
    .on('transactions')
    .columns(['category_id', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_merchant_date')
    .on('transactions')
    .columns(['merchant_id', 'transaction_date desc'])
    .execute();

  await db.schema
    .createIndex('idx_transactions_refund_status')
    .on('transactions')
    .columns(['refund_of_transaction_id', 'status'])
    .execute();

  // Canonical Last index: posted rows ordered by created_at DESC, id DESC
  await db.schema
    .createIndex('idx_transactions_last')
    .on('transactions')
    .columns(['book_id', 'created_at desc', 'id desc'])
    .where(sql<boolean>`status = 'posted'`)
    .execute();

  // Summary index for M08
  await db.schema
    .createIndex('idx_transactions_summary')
    .on('transactions')
    .columns(['book_id', 'transaction_date', 'type', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('transactions').ifExists().execute();
}
