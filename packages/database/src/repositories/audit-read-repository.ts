import type { Kysely } from 'kysely';
import type { AuditReadPort, AuditReadRecord } from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselyAuditReadRepository implements AuditReadPort {
  constructor(private readonly db: Kysely<DB>) {}

  async listByTransactionId(transactionId: string): Promise<AuditReadRecord[]> {
    const rows = await this.db
      .selectFrom('audit_events')
      .selectAll()
      .where('entity_type', '=', 'transaction')
      .where('entity_id', '=', transactionId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      entityType: 'transaction',
      entityId: row.entity_id,
      action: row.action as AuditReadRecord['action'],
      source: row.source as AuditReadRecord['source'],
      actorReference: row.actor_reference,
      oldData: row.old_data,
      newData: row.new_data ?? {},
      correlationId: row.correlation_id ?? '',
    }));
  }
}
