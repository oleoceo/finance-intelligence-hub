import type { Kysely } from 'kysely';
import type {
  InboxClaim,
  InboxMessage,
  InboxRepository,
  InboxStatus,
  NewInboxMessage,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';

type Row = DB['inbox_messages'];

function map(row: Row): InboxMessage {
  return {
    id: row.id,
    source: row.source,
    sourceInstance: row.source_instance,
    sourceMessageId: row.source_message_id,
    senderReference: row.sender_reference,
    authorizedSenderId: row.authorized_sender_id,
    rawText: row.raw_text,
    rawPayload: row.raw_payload,
    receivedAt: row.received_at,
    status: row.processing_status as InboxStatus,
    attemptCount: row.attempt_count,
    processingStartedAt: row.processing_started_at,
    lastAttemptAt: row.last_attempt_at,
    processedAt: row.processed_at,
    correlationId: row.correlation_id,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyInboxMessageRepository implements InboxRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<InboxMessage | null> {
    const row = await this.db
      .selectFrom('inbox_messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? map(row) : null;
  }

  async claim(input: NewInboxMessage, staleBefore: Date): Promise<InboxClaim> {
    const row = await this.db
      .insertInto('inbox_messages')
      .values({
        id: input.id,
        source: input.source,
        source_instance: input.sourceInstance,
        source_message_id: input.sourceMessageId,
        sender_reference: input.senderReference,
        authorized_sender_id: input.authorizedSenderId,
        raw_text: input.rawText,
        raw_payload: input.rawPayload ?? null,
        received_at: input.receivedAt,
        processing_status: 'processing',
        attempt_count: 1,
        processing_started_at: input.now,
        last_attempt_at: input.now,
        processed_at: null,
        correlation_id: input.correlationId,
        failure_code: null,
        failure_message: null,
        created_at: input.now,
        updated_at: input.now,
      })
      .onConflict((oc) =>
        oc.columns(['source', 'source_instance', 'source_message_id']).doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
    if (row) return this.result(row, true);

    // Atomic conditional update serializes duplicate contenders on the unique row.
    // attempt_count fences an old claimant even when timestamps have equal precision.
    const reclaimed = await this.db
      .updateTable('inbox_messages')
      .set((eb) => ({
        processing_status: 'processing',
        attempt_count: eb('attempt_count', '+', 1),
        processing_started_at: input.now,
        last_attempt_at: input.now,
        processed_at: null,
        failure_code: null,
        failure_message: null,
        updated_at: input.now,
      }))
      .where('source', '=', input.source)
      .where('source_instance', '=', input.sourceInstance)
      .where('source_message_id', '=', input.sourceMessageId)
      .where((eb) =>
        eb.or([
          eb('processing_status', '=', 'failed'),
          eb('processing_status', '=', 'received'),
          eb.and([
            eb('processing_status', '=', 'processing'),
            eb('processing_started_at', '<', staleBefore),
          ]),
        ]),
      )
      .returningAll()
      .executeTakeFirst();
    if (reclaimed) return this.result(reclaimed, true);

    const existing = await this.db
      .selectFrom('inbox_messages')
      .selectAll()
      .where('source', '=', input.source)
      .where('source_instance', '=', input.sourceInstance)
      .where('source_message_id', '=', input.sourceMessageId)
      .executeTakeFirstOrThrow();
    return this.result(existing, false);
  }

  async transition(input: {
    id: string;
    attemptCount: number;
    processingStartedAt: Date;
    status: Exclude<InboxStatus, 'received' | 'processing'>;
    now: Date;
    failureCode?: string | null;
    failureMessage?: string | null;
  }): Promise<InboxMessage | null> {
    if (input.failureMessage != null) {
      throw new Error('Free-form failure messages are not accepted by Inbox persistence');
    }
    if (input.failureCode != null && !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.failureCode)) {
      throw new Error('Invalid failure code');
    }
    const row = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: input.status,
        processed_at: input.status === 'processed' || input.status === 'ignored' ? input.now : null,
        failure_code: input.status === 'failed' ? (input.failureCode ?? 'PROCESSING_FAILED') : null,
        failure_message: null,
        updated_at: input.now,
      })
      .where('id', '=', input.id)
      .where('processing_status', 'in', ['processing', 'needs_confirmation'])
      .where('attempt_count', '=', input.attemptCount)
      .where('processing_started_at', '=', input.processingStartedAt)
      .returningAll()
      .executeTakeFirst();
    return row ? map(row) : null;
  }

  private result(row: Row, claimed: boolean): InboxClaim {
    const message = map(row);
    return {
      message,
      claimed,
      attemptCount: message.attemptCount,
      processingStartedAt: message.processingStartedAt,
    };
  }
}
