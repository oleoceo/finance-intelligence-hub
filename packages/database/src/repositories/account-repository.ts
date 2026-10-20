/**
 * Account repository adapter implementing Core AccountRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL accounts table.
 * Translates known M03 configuration failures into Core errors.
 */
import type { Kysely } from 'kysely';
import type {
  AccountRepository,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountInput,
  ArchiveAccountInput,
} from '@finance-hub/core';
import { ValidationError } from '@finance-hub/core';
import type { DB } from '../db-types.js';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

function translatePgError(error: unknown): never {
  if (isPgUniqueViolation(error)) {
    throw new ValidationError('Account uniqueness constraint violated', 'name');
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export class KyselyAccountRepository implements AccountRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<AccountRecord | null> {
    const result = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToAccountRecord(result);
  }

  async findByBookId(bookId: string): Promise<AccountRecord[]> {
    const results = await this.db
      .selectFrom('accounts')
      .selectAll()
      .where('book_id', '=', bookId)
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToAccountRecord(r));
  }

  async find(): Promise<AccountRecord[]> {
    const results = await this.db
      .selectFrom('accounts')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToAccountRecord(r));
  }

  async create(input: CreateAccountInput): Promise<void> {
    try {
      await this.db
        .insertInto('accounts')
        .values({
          id: input.id,
          book_id: input.bookId,
          name: input.name,
          normalized_name: input.normalizedName,
          type: input.type,
          currency: input.currency,
          institution_name: input.institutionName,
          notes: input.notes,
          active: input.active,
          archived_at: input.archivedAt,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
        })
        .execute();
    } catch (error) {
      translatePgError(error);
    }
  }

  async update(input: UpdateAccountInput): Promise<AccountRecord> {
    try {
      const result = await this.db
        .updateTable('accounts')
        .set({
          name: input.name,
          normalized_name: input.normalizedName,
          type: input.type,
          currency: input.currency,
          institution_name: input.institutionName,
          notes: input.notes,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToAccountRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  async archive(input: ArchiveAccountInput): Promise<AccountRecord> {
    try {
      const result = await this.db
        .updateTable('accounts')
        .set({
          active: input.active,
          archived_at: input.archivedAt,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToAccountRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  private mapToAccountRecord(row: DB['accounts']): AccountRecord {
    return {
      id: row.id,
      bookId: row.book_id,
      name: row.name,
      normalizedName: row.normalized_name,
      type: row.type,
      currency: row.currency,
      institutionName: row.institution_name,
      notes: row.notes,
      active: row.active,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
