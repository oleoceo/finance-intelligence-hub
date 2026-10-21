/**
 * Classification Rule repository adapter implementing Core ClassificationRuleRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL classification_rules table.
 * Translates known M03 configuration failures (uniqueness/conflict) into Core errors.
 */
import type { Kysely } from 'kysely';
import type {
  ClassificationRuleRepository,
  ClassificationRuleRecord,
  UpdateClassificationRuleRepoInput,
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
    throw new ValidationError('Classification Rule uniqueness constraint violated', field);
  }
  if (isPgForeignKeyViolation(error)) {
    throw new ValidationError('Classification Rule reference constraint violated', field);
  }
  if (isPgCheckViolation(error)) {
    throw new ValidationError('Classification Rule check constraint violated', field);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export class KyselyClassificationRuleRepository implements ClassificationRuleRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<ClassificationRuleRecord | null> {
    const result = await this.db
      .selectFrom('classification_rules')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToClassificationRuleRecord(result);
  }

  async find(): Promise<ClassificationRuleRecord[]> {
    const results = await this.db
      .selectFrom('classification_rules')
      .selectAll()
      .orderBy('priority', 'asc')
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToClassificationRuleRecord(r));
  }

  async create(input: ClassificationRuleRecord): Promise<void> {
    try {
      await this.db
        .insertInto('classification_rules')
        .values({
          id: input.id,
          priority: input.priority,
          active: input.active,
          match_type: input.matchType,
          pattern: input.pattern,
          normalized_pattern: input.normalizedPattern,
          target_book_id: input.targetBookId,
          target_account_id: input.targetAccountId,
          target_category_id: input.targetCategoryId,
          target_merchant_id: input.targetMerchantId,
          source: input.source,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
        })
        .execute();
    } catch (error) {
      translatePgError(error);
    }
  }

  async update(input: UpdateClassificationRuleRepoInput): Promise<ClassificationRuleRecord> {
    try {
      const result = await this.db
        .updateTable('classification_rules')
        .set({
          priority: input.priority,
          match_type: input.matchType,
          pattern: input.pattern,
          normalized_pattern: input.normalizedPattern,
          target_book_id: input.targetBookId,
          target_account_id: input.targetAccountId,
          target_category_id: input.targetCategoryId,
          target_merchant_id: input.targetMerchantId,
          active: input.active,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToClassificationRuleRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  private mapToClassificationRuleRecord(row: DB['classification_rules']): ClassificationRuleRecord {
    return {
      id: row.id,
      priority: row.priority,
      active: row.active,
      matchType: row.match_type as 'exact' | 'contains',
      pattern: row.pattern,
      normalizedPattern: row.normalized_pattern,
      targetBookId: row.target_book_id,
      targetAccountId: row.target_account_id,
      targetCategoryId: row.target_category_id,
      targetMerchantId: row.target_merchant_id,
      source: row.source as 'manual' | 'system',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
