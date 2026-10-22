import { sql, type Kysely } from 'kysely';
import type {
  IdempotencyKeyRepository,
  IdempotencyKeyRecord,
  IdempotencyScope,
  IdempotencyState,
  CreateIdempotencyKeyInput,
  CompleteIdempotencyKeyInput,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';

type Row = DB['idempotency_keys'];

function mapRow(row: Row): IdempotencyKeyRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    scope: row.scope as IdempotencyScope,
    requestHash: row.request_hash,
    status: row.status as IdempotencyState,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

/** Instantiate with the outer Kysely transaction, never the root connection. */
export class KyselyIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(
    private readonly tx: Kysely<DB>,
    private readonly lockTimeoutMs = 1000,
  ) {
    if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs <= 0) {
      throw new Error('lockTimeoutMs must be a positive finite integer');
    }
  }

  private async setFiniteLockWait(): Promise<void> {
    await sql`select set_config('lock_timeout', ${`${this.lockTimeoutMs}ms`}, true)`.execute(
      this.tx,
    );
  }

  async create(input: CreateIdempotencyKeyInput): Promise<IdempotencyKeyRecord | null> {
    await this.setFiniteLockWait();
    const row = await this.tx
      .insertInto('idempotency_keys')
      .values({
        id: input.id,
        scope: input.scope,
        idempotency_key: input.idempotencyKey,
        request_hash: input.requestHash,
        status: 'in_progress',
        resource_type: null,
        resource_id: null,
        response_status: null,
        response_body: null,
        created_at: input.createdAt,
        completed_at: null,
      })
      .onConflict((oc) => oc.columns(['scope', 'idempotency_key']).doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async complete(input: CompleteIdempotencyKeyInput): Promise<IdempotencyKeyRecord> {
    const row = await this.tx
      .updateTable('idempotency_keys')
      .set({
        status: 'completed',
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        response_status: input.responseStatus,
        response_body: input.responseBody,
        completed_at: input.completedAt,
      })
      .where('id', '=', input.id)
      .where('status', '=', 'in_progress')
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new Error('Idempotency claim is not owned or already completed');
    return mapRow(row);
  }

  async findByKeyAndScope(
    idempotencyKey: string,
    scope: IdempotencyScope,
  ): Promise<IdempotencyKeyRecord | null> {
    const row = await this.tx
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('scope', '=', scope)
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async findByKeyAndScopeForUpdate(
    idempotencyKey: string,
    scope: IdempotencyScope,
  ): Promise<IdempotencyKeyRecord | null> {
    await this.setFiniteLockWait();
    const row = await this.tx
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('scope', '=', scope)
      .where('idempotency_key', '=', idempotencyKey)
      .forUpdate()
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }
}
