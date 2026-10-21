/**
 * Book repository adapter implementing Core BookRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL books table.
 * Translates known M03 configuration failures (uniqueness/conflict) into Core errors.
 */
import type { Kysely } from 'kysely';
import type {
  BookRepository,
  BookRecord,
  CreateBookInput,
  UpdateBookInput,
  ArchiveBookInput,
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
    throw new ValidationError('Book uniqueness constraint violated', 'name', error);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export class KyselyBookRepository implements BookRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<BookRecord | null> {
    const result = await this.db
      .selectFrom('books')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToBookRecord(result);
  }

  async findByName(normalizedName: string): Promise<BookRecord | null> {
    const result = await this.db
      .selectFrom('books')
      .selectAll()
      .where('normalized_name', '=', normalizedName)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToBookRecord(result);
  }

  async find(): Promise<BookRecord[]> {
    const results = await this.db
      .selectFrom('books')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToBookRecord(r));
  }

  async create(input: CreateBookInput): Promise<void> {
    try {
      await this.db
        .insertInto('books')
        .values({
          id: input.id,
          name: input.name,
          normalized_name: input.normalizedName,
          currency: input.currency,
          timezone: input.timezone,
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

  async update(input: UpdateBookInput): Promise<BookRecord> {
    try {
      const result = await this.db
        .updateTable('books')
        .set({
          name: input.name,
          normalized_name: input.normalizedName,
          currency: input.currency,
          timezone: input.timezone,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToBookRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  async archive(input: ArchiveBookInput): Promise<BookRecord> {
    try {
      const result = await this.db
        .updateTable('books')
        .set({
          active: input.active,
          archived_at: input.archivedAt,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToBookRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  private mapToBookRecord(row: DB['books']): BookRecord {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      currency: row.currency,
      timezone: row.timezone,
      active: row.active,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
