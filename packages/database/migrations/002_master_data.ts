import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * M02-T01 — Master data and authorized-sender structure.
 *
 * Creates: books, accounts, categories, merchants, classification_rules, authorized_senders
 * with all frozen constraints, foreign keys, unique indexes and CHECKs from 04-DATABASE.md §§14–38.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── books ──────────────────────────────────────────────────────────────
  await db.schema
    .createTable('books')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'varchar(120)', (col) => col.notNull())
    .addColumn('normalized_name', 'varchar(120)', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull())
    .addColumn('timezone', 'varchar(64)', (col) => col.notNull().defaultTo('America/Sao_Paulo'))
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint('books_currency_format', sql`currency ~ '^[A-Z]{3}$'`)
    .addCheckConstraint(
      'books_archive_consistency',
      sql`(active = TRUE AND archived_at IS NULL) OR (active = FALSE AND archived_at IS NOT NULL)`,
    )
    .addUniqueConstraint('uq_books_normalized_name', ['normalized_name'])
    .addUniqueConstraint('uq_books_id_currency', ['id', 'currency'])
    .execute();

  // ── accounts ───────────────────────────────────────────────────────────
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('book_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(160)', (col) => col.notNull())
    .addColumn('normalized_name', 'varchar(160)', (col) => col.notNull())
    .addColumn('type', 'varchar(32)', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull())
    .addColumn('institution_name', 'varchar(160)')
    .addColumn('notes', 'text')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint(
      'accounts_type_check',
      sql`type IN ('checking', 'savings', 'cash', 'credit_card', 'other')`,
    )
    .addCheckConstraint('accounts_currency_format', sql`currency ~ '^[A-Z]{3}$'`)
    .addCheckConstraint(
      'accounts_archive_consistency',
      sql`(active = TRUE AND archived_at IS NULL) OR (active = FALSE AND archived_at IS NOT NULL)`,
    )
    .addForeignKeyConstraint('fk_accounts_book_id', ['book_id'], 'books', ['id'])
    .addForeignKeyConstraint('fk_accounts_book_currency', ['book_id', 'currency'], 'books', [
      'id',
      'currency',
    ])
    .addUniqueConstraint('uq_accounts_book_normalized_name', ['book_id', 'normalized_name'])
    .addUniqueConstraint('uq_accounts_id_book_id', ['id', 'book_id'])
    .addUniqueConstraint('uq_accounts_id_book_currency', ['id', 'book_id', 'currency'])
    .execute();

  // ── categories ─────────────────────────────────────────────────────────
  await db.schema
    .createTable('categories')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('book_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(160)', (col) => col.notNull())
    .addColumn('normalized_name', 'varchar(160)', (col) => col.notNull())
    .addColumn('parent_category_id', 'uuid')
    .addColumn('type', 'varchar(16)', (col) => col.notNull().defaultTo('both'))
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint('categories_type_check', sql`type IN ('expense', 'income', 'both')`)
    .addCheckConstraint(
      'categories_archive_consistency',
      sql`(active = TRUE AND archived_at IS NULL) OR (active = FALSE AND archived_at IS NOT NULL)`,
    )
    .addCheckConstraint(
      'categories_no_self_parent',
      sql`parent_category_id IS NULL OR parent_category_id <> id`,
    )
    .addForeignKeyConstraint('fk_categories_book_id', ['book_id'], 'books', ['id'])
    .addForeignKeyConstraint(
      'fk_categories_parent',
      ['parent_category_id', 'book_id'],
      'categories',
      ['id', 'book_id'],
    )
    .addUniqueConstraint('uq_categories_id_book_id', ['id', 'book_id'])
    .execute();

  // Partial unique indexes for category name uniqueness
  await db.schema
    .createIndex('uq_categories_root_name_per_book')
    .on('categories')
    .columns(['book_id', 'normalized_name'])
    .where(sql<boolean>`parent_category_id IS NULL`)
    .unique()
    .execute();

  await db.schema
    .createIndex('uq_categories_child_name_per_book_parent')
    .on('categories')
    .columns(['book_id', 'parent_category_id', 'normalized_name'])
    .where(sql<boolean>`parent_category_id IS NOT NULL`)
    .unique()
    .execute();

  // ── merchants ──────────────────────────────────────────────────────────
  await db.schema
    .createTable('merchants')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('normalized_name', 'varchar(200)', (col) => col.notNull())
    .addColumn('type', 'varchar(50)')
    .addColumn('tax_identifier', 'varchar(32)')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint(
      'merchants_archive_consistency',
      sql`(active = TRUE AND archived_at IS NULL) OR (active = FALSE AND archived_at IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .createIndex('idx_merchants_normalized_name')
    .on('merchants')
    .column('normalized_name')
    .execute();

  // ── classification_rules ───────────────────────────────────────────────
  await db.schema
    .createTable('classification_rules')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(100))
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('match_type', 'varchar(32)', (col) => col.notNull())
    .addColumn('pattern', 'varchar(500)', (col) => col.notNull())
    .addColumn('normalized_pattern', 'varchar(500)', (col) => col.notNull())
    .addColumn('target_book_id', 'uuid')
    .addColumn('target_account_id', 'uuid')
    .addColumn('target_category_id', 'uuid')
    .addColumn('target_merchant_id', 'uuid')
    .addColumn('source', 'varchar(32)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint('classification_rules_match_type', sql`match_type IN ('exact', 'contains')`)
    .addCheckConstraint('classification_rules_source', sql`source IN ('manual', 'system')`)
    .addCheckConstraint(
      'classification_rules_at_least_one_target',
      sql`target_book_id IS NOT NULL OR target_account_id IS NOT NULL OR target_category_id IS NOT NULL OR target_merchant_id IS NOT NULL`,
    )
    .addForeignKeyConstraint('fk_rules_target_book', ['target_book_id'], 'books', ['id'])
    .addForeignKeyConstraint('fk_rules_target_account', ['target_account_id'], 'accounts', ['id'])
    .addForeignKeyConstraint('fk_rules_target_category', ['target_category_id'], 'categories', [
      'id',
    ])
    .addForeignKeyConstraint('fk_rules_target_merchant', ['target_merchant_id'], 'merchants', [
      'id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_classification_rules_active_priority')
    .on('classification_rules')
    .columns(['active', 'priority'])
    .execute();

  await db.schema
    .createIndex('idx_classification_rules_normalized_pattern')
    .on('classification_rules')
    .column('normalized_pattern')
    .execute();

  // ── authorized_senders ─────────────────────────────────────────────────
  await db.schema
    .createTable('authorized_senders')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('channel', 'varchar(32)', (col) => col.notNull())
    .addColumn('sender_reference', 'varchar(255)', (col) => col.notNull())
    .addColumn('name', 'varchar(160)')
    .addColumn('default_book_id', 'uuid')
    .addColumn('default_account_id', 'uuid')
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
    .addCheckConstraint(
      'senders_default_account_requires_book',
      sql`default_account_id IS NULL OR default_book_id IS NOT NULL`,
    )
    .addForeignKeyConstraint('fk_senders_default_book', ['default_book_id'], 'books', ['id'])
    .addForeignKeyConstraint(
      'fk_senders_default_account_book',
      ['default_account_id', 'default_book_id'],
      'accounts',
      ['id', 'book_id'],
    )
    .addUniqueConstraint('uq_senders_channel_reference', ['channel', 'sender_reference'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop in reverse dependency order
  await db.schema.dropTable('authorized_senders').ifExists().execute();
  await db.schema.dropTable('classification_rules').ifExists().execute();
  await db.schema.dropTable('merchants').ifExists().execute();
  await db.schema.dropTable('categories').ifExists().execute();
  await db.schema.dropTable('accounts').ifExists().execute();
  await db.schema.dropTable('books').ifExists().execute();
}
