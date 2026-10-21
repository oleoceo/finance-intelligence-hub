/**
 * Authorized Sender repository adapter implementing Core AuthorizedSenderRepository contract.
 *
 * Uses Kysely to interact with PostgreSQL authorized_senders table.
 * Translates known M03 configuration failures (uniqueness/conflict) into Core errors.
 */
import type { Kysely } from 'kysely';
import type {
  AuthorizedSenderRepository,
  AuthorizedSenderRecord,
  UpdateAuthorizedSenderRepoInput,
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
    throw new ValidationError('Authorized Sender uniqueness constraint violated', field, error);
  }
  if (isPgForeignKeyViolation(error)) {
    throw new ValidationError('Authorized Sender reference constraint violated', field, error);
  }
  if (isPgCheckViolation(error)) {
    throw new ValidationError('Authorized Sender check constraint violated', field, error);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export class KyselyAuthorizedSenderRepository implements AuthorizedSenderRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<AuthorizedSenderRecord | null> {
    const result = await this.db
      .selectFrom('authorized_senders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToAuthorizedSenderRecord(result);
  }

  async findByChannelAndReference(
    channel: string,
    senderReference: string,
  ): Promise<AuthorizedSenderRecord | null> {
    const result = await this.db
      .selectFrom('authorized_senders')
      .selectAll()
      .where('channel', '=', channel)
      .where('sender_reference', '=', senderReference)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToAuthorizedSenderRecord(result);
  }

  async find(): Promise<AuthorizedSenderRecord[]> {
    const results = await this.db
      .selectFrom('authorized_senders')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return results.map((r) => this.mapToAuthorizedSenderRecord(r));
  }

  async create(input: AuthorizedSenderRecord): Promise<void> {
    try {
      await this.db
        .insertInto('authorized_senders')
        .values({
          id: input.id,
          channel: input.channel,
          sender_reference: input.senderReference,
          name: input.name,
          default_book_id: input.defaultBookId,
          default_account_id: input.defaultAccountId,
          active: input.active,
          created_at: input.createdAt,
          updated_at: input.updatedAt,
        })
        .execute();
    } catch (error) {
      translatePgError(error);
    }
  }

  async update(input: UpdateAuthorizedSenderRepoInput): Promise<AuthorizedSenderRecord> {
    try {
      const result = await this.db
        .updateTable('authorized_senders')
        .set({
          name: input.name,
          default_book_id: input.defaultBookId,
          default_account_id: input.defaultAccountId,
          active: input.active,
          updated_at: input.updatedAt,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.mapToAuthorizedSenderRecord(result);
    } catch (error) {
      translatePgError(error);
    }
  }

  private mapToAuthorizedSenderRecord(row: DB['authorized_senders']): AuthorizedSenderRecord {
    return {
      id: row.id,
      channel: row.channel,
      senderReference: row.sender_reference,
      name: row.name,
      defaultBookId: row.default_book_id,
      defaultAccountId: row.default_account_id,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
