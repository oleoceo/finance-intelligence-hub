import type { Kysely } from 'kysely';

/**
 * Technical validation migration — no-op.
 *
 * This migration proves the Kysely Migrator framework works without creating
 * permanent application tables. Domain schema migrations begin in M02.
 */
export async function up(_db: Kysely<unknown>): Promise<void> {
  // Intentionally empty: validates that the migration framework can apply
  // a migration successfully without side effects.
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Intentionally empty: nothing to roll back.
}
