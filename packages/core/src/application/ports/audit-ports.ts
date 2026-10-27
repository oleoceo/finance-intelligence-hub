/**
 * Core-facing audit event ports for M04.
 *
 * T01 defines only the contract surface for basic Transaction audit.
 * No persistence implementation here — Database adapter owns that.
 *
 * M04 action: TRANSACTION_CREATED
 * Source and actor are derived from the trusted direct or Inbox context.
 */

export const AUDIT_ACTIONS = ['TRANSACTION_CREATED'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ['transaction'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_SOURCES = ['direct_api', 'whatsapp'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

/**
 * Input for writing an audit event.
 * Compatible with the accepted physical audit_events schema.
 */
export interface WriteAuditEventInput {
  id: string;
  createdAt: Date;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  source: AuditSource;
  /** Actor reference. Null for server-controlled direct API operations. Never raw credentials. */
  actorReference: string | null;
  /** Previous state snapshot (serialized JSON). Null for creation events. */
  oldData: null;
  /** New state snapshot (serialized JSON). */
  newData: Record<string, unknown>;
  /** Correlation ID linking this audit event to the originating request. */
  correlationId: string;
}

/**
 * Minimal audit writer contract for M04.
 * Database adapter implements persistence; Core calls this within the outer transaction.
 */
export interface AuditWriter {
  /**
   * Write an audit event. Must be called inside the same outer PostgreSQL
   * transaction as the financial write it documents.
   */
  write(input: WriteAuditEventInput): Promise<void>;
}
