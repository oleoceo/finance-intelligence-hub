import type { Kysely } from 'kysely';
import type {
  ConfirmationOwner,
  ConfirmationReply,
  ConfirmationResolution,
  ConfirmationSession,
  ConfirmationSessionRepository,
  NewConfirmationSession,
} from '@finance-hub/core';
import {
  confirmationExpiry,
  confirmationReplyOutcome,
  isConfirmationExpired,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';

type Row = DB['confirmation_sessions'];

function map(row: Row): ConfirmationSession {
  return {
    id: row.id,
    channel: row.channel,
    senderReference: row.sender_reference,
    authorizedSenderId: row.authorized_sender_id,
    inboxMessageId: row.inbox_message_id,
    resolvedByInboxMessageId: row.resolved_by_inbox_message_id,
    action: row.action,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    targetVersion: row.target_version,
    payload: row.payload,
    status: row.status as ConfirmationSession['status'],
    resolutionReason: row.resolution_reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Transaction-scoped only. Lock order: authorized sender -> pending session -> original
 * Inbox -> resolver Inbox -> conditional session update. The caller must not prelock
 * an Inbox row before invoking this adapter. P05 commits confirmation and financial
 * effect in its own outer transaction; this class never starts or commits one.
 */
export class KyselyConfirmationSessionRepository implements ConfirmationSessionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  private async lockOwner(owner: ConfirmationOwner, requireActive = true): Promise<boolean> {
    const sender = await this.db
      .selectFrom('authorized_senders')
      .select(['id', 'active', 'channel', 'sender_reference'])
      .where('id', '=', owner.authorizedSenderId)
      .forUpdate()
      .executeTakeFirst();
    return (
      (sender?.active === true || (!requireActive && sender != null)) &&
      sender.channel === owner.channel &&
      sender.sender_reference === owner.senderReference
    );
  }

  private async pending(owner: ConfirmationOwner): Promise<Row | null> {
    const row = await this.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('channel', '=', owner.channel)
      .where('sender_reference', '=', owner.senderReference)
      .where('authorized_sender_id', '=', owner.authorizedSenderId)
      .where('status', '=', 'pending')
      .forUpdate()
      .executeTakeFirst();
    return row ?? null;
  }

  private async lockInbox(id: string, owner: ConfirmationOwner) {
    const row = await this.db
      .selectFrom('inbox_messages')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (
      !row ||
      row.authorized_sender_id !== owner.authorizedSenderId ||
      row.sender_reference !== owner.senderReference
    ) {
      throw new Error('Confirmation Inbox ownership mismatch');
    }
    return row;
  }

  private async finishInbox(id: string, now: Date, status: 'processed' | 'ignored') {
    const row = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: status,
        processed_at: now,
        failure_code: null,
        failure_message: null,
        updated_at: now,
      })
      .where('id', '=', id)
      .where('processing_status', '=', 'needs_confirmation')
      .returning('id')
      .executeTakeFirst();
    if (!row) throw new Error('Confirmation original Inbox is not pending');
  }

  private async terminal(
    row: Row,
    owner: ConfirmationOwner,
    status: 'cancelled' | 'expired',
    now: Date,
    reason: string,
    resolverInboxMessageId?: string,
  ): Promise<ConfirmationResolution> {
    await this.lockInbox(row.inbox_message_id, owner);
    if (resolverInboxMessageId && resolverInboxMessageId !== row.inbox_message_id)
      await this.lockInbox(resolverInboxMessageId, owner);
    await this.finishInbox(row.inbox_message_id, now, 'ignored');
    if (resolverInboxMessageId) {
      const resolver = await this.db
        .updateTable('inbox_messages')
        .set({
          processing_status: 'processed',
          processed_at: now,
          updated_at: now,
          failure_code: null,
          failure_message: null,
        })
        .where('id', '=', resolverInboxMessageId)
        .where('processing_status', '=', 'processing')
        .returning('id')
        .executeTakeFirst();
      if (!resolver) throw new Error('Confirmation resolver Inbox is not processing');
    }
    const updated = await this.db
      .updateTable('confirmation_sessions')
      .set({
        status,
        resolution_reason: reason,
        resolved_at: now,
        resolved_by_inbox_message_id: resolverInboxMessageId ?? null,
      })
      .where('id', '=', row.id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirstOrThrow();
    return { kind: status, session: map(updated) };
  }

  async create(input: NewConfirmationSession): Promise<ConfirmationSession> {
    if (!(await this.lockOwner(input))) throw new Error('Confirmation sender unavailable');
    const existing = await this.pending(input);
    if (existing) {
      if (isConfirmationExpired(existing.expires_at, input.now))
        await this.terminal(existing, input, 'expired', input.now, 'expired');
      else throw new Error('Confirmation already pending');
    }
    const original = await this.lockInbox(input.inboxMessageId, input);
    if (original.processing_status !== 'needs_confirmation')
      throw new Error('Confirmation original Inbox is not pending');
    const row = await this.db
      .insertInto('confirmation_sessions')
      .values({
        id: input.id,
        channel: input.channel,
        sender_reference: input.senderReference,
        authorized_sender_id: input.authorizedSenderId,
        inbox_message_id: input.inboxMessageId,
        resolved_by_inbox_message_id: null,
        action: input.action,
        target_entity_type: input.targetEntityType ?? null,
        target_entity_id: input.targetEntityId ?? null,
        target_version: input.targetVersion ?? null,
        payload: input.payload,
        status: 'pending',
        resolution_reason: null,
        expires_at: confirmationExpiry(input.now, input.ttlMs),
        created_at: input.now,
        resolved_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return map(row);
  }

  async resolveReply(
    input: ConfirmationOwner & {
      reply: ConfirmationReply;
      resolverInboxMessageId: string;
      now: Date;
    },
  ): Promise<ConfirmationResolution> {
    if (!(await this.lockOwner(input))) return { kind: 'none' };
    const row = await this.pending(input);
    if (!row) {
      await this.lockInbox(input.resolverInboxMessageId, input);
      await this.db
        .updateTable('inbox_messages')
        .set({ processing_status: 'ignored', processed_at: input.now, updated_at: input.now })
        .where('id', '=', input.resolverInboxMessageId)
        .where('processing_status', '=', 'processing')
        .execute();
      return { kind: 'none' };
    }
    if (isConfirmationExpired(row.expires_at, input.now))
      return this.terminal(
        row,
        input,
        'expired',
        input.now,
        'expired',
        input.resolverInboxMessageId,
      );
    if (confirmationReplyOutcome(input.reply) === 'cancelled')
      return this.terminal(
        row,
        input,
        'cancelled',
        input.now,
        'sender_cancelled',
        input.resolverInboxMessageId,
      );
    await this.lockInbox(row.inbox_message_id, input);
    await this.lockInbox(input.resolverInboxMessageId, input);
    const updated = await this.db
      .updateTable('confirmation_sessions')
      .set({
        status: 'confirmed',
        resolution_reason: 'sender_confirmed',
        resolved_at: input.now,
        resolved_by_inbox_message_id: input.resolverInboxMessageId,
      })
      .where('id', '=', row.id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirstOrThrow();
    // Original and resolver remain pending for P05's shared financial commit.
    return { kind: 'confirmed', session: map(updated) };
  }

  async expire(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution> {
    if (!(await this.lockOwner(input, false))) return { kind: 'none' };
    const row = await this.pending(input);
    if (!row || !isConfirmationExpired(row.expires_at, input.now)) return { kind: 'none' };
    return this.terminal(row, input, 'expired', input.now, 'expired');
  }

  async supersede(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution> {
    if (!(await this.lockOwner(input, false))) return { kind: 'none' };
    const row = await this.pending(input);
    if (!row) return { kind: 'none' };
    if (isConfirmationExpired(row.expires_at, input.now))
      return this.terminal(row, input, 'expired', input.now, 'expired');
    return this.terminal(row, input, 'cancelled', input.now, 'superseded_by_new_command');
  }

  async finalizeConfirmed(input: { sessionId: string; now: Date }): Promise<void> {
    // resolveReply has already locked sender, session, original and resolver in this transaction.
    const row = await this.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', input.sessionId)
      .where('status', '=', 'confirmed')
      .forUpdate()
      .executeTakeFirst();
    if (!row?.resolved_by_inbox_message_id) throw new Error('Confirmation is not confirmed');
    await this.finishInbox(row.inbox_message_id, input.now, 'processed');
    const resolver = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: 'processed',
        processed_at: input.now,
        updated_at: input.now,
        failure_code: null,
        failure_message: null,
      })
      .where('id', '=', row.resolved_by_inbox_message_id)
      .where('processing_status', '=', 'processing')
      .returning('id')
      .executeTakeFirst();
    if (!resolver) throw new Error('Confirmation resolver Inbox is not processing');
  }
}
