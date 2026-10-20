/**
 * Merchant repository adapter implementing Core MerchantRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL merchants table.
 * Normalized name is NOT unique; duplicates are permitted.
 */
import type { Kysely } from 'kysely';
import type {
  MerchantRepository,
  MerchantRecord,
  CreateMerchantInput,
  UpdateMerchantRepoInput,
  ArchiveMerchantInput,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselyMerchantRepository implements MerchantRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<MerchantRecord | null> {
    const result = await this.db
      .selectFrom('merchants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToMerchantRecord(result);
  }

  async findByNormalizedName(normalizedName: string): Promise<MerchantRecord[]> {
    const results = await this.db
      .selectFrom('merchants')
      .selectAll()
      .where('normalized_name', '=', normalizedName)
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToMerchantRecord(r));
  }

  async find(): Promise<MerchantRecord[]> {
    const results = await this.db
      .selectFrom('merchants')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToMerchantRecord(r));
  }

  async findByIds(ids: string[]): Promise<MerchantRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const results = await this.db
      .selectFrom('merchants')
      .selectAll()
      .where('id', 'in', ids)
      .orderBy('id', 'asc')
      .execute();

    return results.map((r) => this.mapToMerchantRecord(r));
  }

  async create(input: CreateMerchantInput): Promise<void> {
    await this.db
      .insertInto('merchants')
      .values({
        id: input.id,
        name: input.name,
        normalized_name: input.normalizedName,
        type: input.type,
        tax_identifier: input.taxIdentifier,
        active: input.active,
        archived_at: input.archivedAt,
        created_at: input.createdAt,
        updated_at: input.updatedAt,
      })
      .execute();
  }

  async update(input: UpdateMerchantRepoInput): Promise<MerchantRecord> {
    const result = await this.db
      .updateTable('merchants')
      .set({
        name: input.name,
        normalized_name: input.normalizedName,
        type: input.type,
        tax_identifier: input.taxIdentifier,
        active: input.active,
        archived_at: input.archivedAt,
        updated_at: input.updatedAt,
      })
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToMerchantRecord(result);
  }

  async archive(input: ArchiveMerchantInput): Promise<MerchantRecord> {
    const result = await this.db
      .updateTable('merchants')
      .set({
        active: input.active,
        archived_at: input.archivedAt,
        updated_at: input.updatedAt,
      })
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToMerchantRecord(result);
  }

  private mapToMerchantRecord(row: DB['merchants']): MerchantRecord {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      type: row.type,
      taxIdentifier: row.tax_identifier,
      active: row.active,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
