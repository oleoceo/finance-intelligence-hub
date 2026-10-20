/**
 * Category repository adapter implementing Core CategoryRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL categories table.
 * Translates known M03 configuration failures (uniqueness/conflict) into Core errors.
 */
import type { Kysely } from 'kysely';
import type {
  CategoryRepository,
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryRepoInput,
  ArchiveCategoryInput,
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

function isPgForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23503'
  );
}

function isPgCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23514'
  );
}

function translatePgError(error: unknown, field?: string): never {
  if (isPgUniqueViolation(error)) {
    throw new ValidationError('Category uniqueness constraint violated', field);
  }
  if (isPgForeignKeyViolation(error)) {
    throw new ValidationError('Category reference constraint violated', field);
  }
  if (isPgCheckViolation(error)) {
    throw new ValidationError('Category check constraint violated', field);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export class KyselyCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<CategoryRecord | null> {
    const result = await this.db
      .selectFrom('categories')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToCategoryRecord(result);
  }

  async findByBookId(bookId: string): Promise<CategoryRecord[]> {
    const results = await this.db
      .selectFrom('categories')
      .selectAll()
      .where('book_id', '=', bookId)
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToCategoryRecord(r));
  }

  async find(): Promise<CategoryRecord[]> {
    const results = await this.db
      .selectFrom('categories')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToCategoryRecord(r));
  }

  async findByIds(ids: string[]): Promise<CategoryRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const results = await this.db
      .selectFrom('categories')
      .selectAll()
      .where('id', 'in', ids)
      .orderBy('id', 'asc')
      .execute();

    return results.map((r) => this.mapToCategoryRecord(r));
  }

  async create(input: CreateCategoryInput): Promise<void> {
    try {
      await this.db
        .insertInto('categories')
        .values({
          id: input.id,
          book_id: input.bookId,
          name: input.name,
          normalized_name: input.normalizedName,
          parent_category_id: input.parentCategoryId,
          type: input.type,
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

  async update(input: UpdateCategoryRepoInput): Promise<CategoryRecord> {
    try {
      const result = await this.db
        .updateTable('categories')
        .set({
          name: input.name,
          normalized_name: input.normalizedName,
          parent_category_id: input.parentCategoryId,
          type: input.type,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToCategoryRecord(result);
    } catch (error) {
      translatePgError(error, 'parentCategoryId');
    }
  }

  async archive(input: ArchiveCategoryInput): Promise<CategoryRecord> {
    try {
      const result = await this.db
        .updateTable('categories')
        .set({
          active: input.active,
          archived_at: input.archivedAt,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToCategoryRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  private mapToCategoryRecord(row: DB['categories']): CategoryRecord {
    return {
      id: row.id,
      bookId: row.book_id,
      name: row.name,
      normalizedName: row.normalized_name,
      parentCategoryId: row.parent_category_id,
      type: row.type,
      active: row.active,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
