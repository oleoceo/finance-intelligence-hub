import type { Kysely } from 'kysely';
import type { AuditWriter, WriteAuditEventInput } from '@finance-hub/core';
import type { DB } from '../db-types.js';

/** Instantiate only with the outer financial Kysely transaction. */
export class KyselyAuditWriter implements AuditWriter {
  constructor(private readonly tx: Kysely<DB>) {}

  async write(input: WriteAuditEventInput): Promise<void> {
    await this.tx
      .insertInto('audit_events')
      .values({
        id: input.id,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action: input.action,
        source: input.source,
        actor_reference: input.actorReference,
        old_data: input.oldData,
        new_data: input.newData,
        correlation_id: input.correlationId,
        created_at: input.createdAt,
      })
      .execute();
  }
}
