import type { Kysely } from 'kysely';
import type {
  ConfirmationOwner,
  ConfirmationReply,
  ConfirmationResolverClaim,
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
 * Inbox -> resolver Inbox -> conditional session update. P05 must acquire the entire
 * M03 configuration lock set (Book, Account, Category, Merchant, Rule, Sender; UUIDs
 * ascending within each kind) before calling this adapter or its financial writer.
 * No Inbox row may be prelocked. The caller owns one PostgreSQL transaction containing
 * prepare, financial effect, Audit, idempotency and finalizeConfirmed.
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

  private async finishInbox(row: DB['inbox_messages'], now: Date, status: 'processed' | 'ignored') {
    const updated = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: status,
        processed_at: now,
        failure_code: null,
        failure_message: null,
        updated_at: now,
      })
      .where('id', '=', row.id)
      .where('processing_status', '=', 'needs_confirmation')
      .where('attempt_count', '=', row.attempt_count)
      .where('processing_started_at', '=', row.processing_started_at!)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw new Error('Confirmation original Inbox is not pending');
  }

  private async terminal(
    row: Row,
    owner: ConfirmationOwner,
    status: 'cancelled' | 'expired',
    now: Date,
    reason: string,
    resolverClaim?: ConfirmationResolverClaim,
  ): Promise<ConfirmationResolution> {
    const original = await this.lockInbox(row.inbox_message_id, owner);
    if (resolverClaim) {
      const resolverRow = await this.lockInbox(resolverClaim.resolverInboxMessageId, owner);
      if (!this.matchesClaim(resolverRow, resolverClaim)) return { kind: 'stale_claim' };
    }
    await this.finishInbox(original, now, 'ignored');
    if (resolverClaim) {
      const resolver = await this.db
        .updateTable('inbox_messages')
        .set({
          processing_status: 'processed',
          processed_at: now,
          updated_at: now,
          failure_code: null,
          failure_message: null,
        })
        .where('id', '=', resolverClaim.resolverInboxMessageId)
        .where('processing_status', '=', 'processing')
        .where('attempt_count', '=', resolverClaim.attemptCount)
        .where('processing_started_at', '=', resolverClaim.processingStartedAt)
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
        resolved_by_inbox_message_id: resolverClaim?.resolverInboxMessageId ?? null,
      })
      .where('id', '=', row.id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirstOrThrow();
    return { kind: status, session: map(updated) };
  }

  private matchesClaim(row: DB['inbox_messages'], claim: ConfirmationResolverClaim): boolean {
    return (
      row.processing_status === 'processing' &&
      row.attempt_count === claim.attemptCount &&
      row.processing_started_at?.getTime() === claim.processingStartedAt.getTime()
    );
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

  async advanceChoice(
    input: ConfirmationOwner &
      ConfirmationResolverClaim & {
        sessionId: string;
        action: string;
        payload: Record<string, unknown>;
        targetEntityId?: string;
        targetVersion?: number;
        now: Date;
      },
  ): Promise<ConfirmationSession> {
    if (
      input.targetEntityId &&
      (!Number.isSafeInteger(input.targetVersion) || input.targetVersion! < 1)
    )
      throw new Error('Confirmation target version is required');
    if (!(await this.lockOwner(input))) throw new Error('Confirmation sender unavailable');
    const row = await this.pending(input);
    if (!row || row.id !== input.sessionId || isConfirmationExpired(row.expires_at, input.now))
      throw new Error('Confirmation is not pending');
    const original = await this.lockInbox(row.inbox_message_id, input);
    if (original.processing_status !== 'needs_confirmation')
      throw new Error('Confirmation original Inbox is not pending');
    const resolver = await this.lockInbox(input.resolverInboxMessageId, input);
    if (!this.matchesClaim(resolver, input))
      throw new Error('Confirmation resolver claim is stale');
    const updated = await this.db
      .updateTable('confirmation_sessions')
      .set({
        action: input.action,
        payload: input.payload,
        ...(input.targetEntityId
          ? {
              target_entity_type: 'transaction',
              target_entity_id: input.targetEntityId,
              target_version: input.targetVersion,
            }
          : {}),
      })
      .where('id', '=', row.id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirstOrThrow();
    const finished = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: 'processed',
        processed_at: input.now,
        updated_at: input.now,
        failure_code: null,
        failure_message: null,
      })
      .where('id', '=', resolver.id)
      .where('processing_status', '=', 'processing')
      .where('attempt_count', '=', input.attemptCount)
      .where('processing_started_at', '=', input.processingStartedAt)
      .returning('id')
      .executeTakeFirst();
    if (!finished) throw new Error('Confirmation resolver Inbox is not processing');
    return map(updated);
  }

  async resolveReply(
    input: ConfirmationOwner & {
      reply: ConfirmationReply;
      resolverInboxMessageId: string;
      attemptCount: number;
      processingStartedAt: Date;
      now: Date;
    },
  ): Promise<ConfirmationResolution> {
    if (!(await this.lockOwner(input))) return { kind: 'none' };
    const row = await this.pending(input);
    if (!row) {
      const resolverRow = await this.lockInbox(input.resolverInboxMessageId, input);
      if (!this.matchesClaim(resolverRow, input)) return { kind: 'stale_claim' };
      const ignored = await this.db
        .updateTable('inbox_messages')
        .set({ processing_status: 'ignored', processed_at: input.now, updated_at: input.now })
        .where('id', '=', input.resolverInboxMessageId)
        .where('processing_status', '=', 'processing')
        .where('attempt_count', '=', input.attemptCount)
        .where('processing_started_at', '=', input.processingStartedAt)
        .returning('id')
        .executeTakeFirst();
      if (!ignored) return { kind: 'stale_claim' };
      return { kind: 'none' };
    }
    if (isConfirmationExpired(row.expires_at, input.now))
      return this.terminal(row, input, 'expired', input.now, 'expired', input);
    const outcome = confirmationReplyOutcome(input.reply);
    if (outcome === 'cancelled')
      return this.terminal(row, input, 'cancelled', input.now, 'sender_cancelled', input);
    await this.lockInbox(row.inbox_message_id, input);
    const resolver = await this.lockInbox(input.resolverInboxMessageId, input);
    if (!this.matchesClaim(resolver, input)) return { kind: 'stale_claim' };
    if (outcome === 'choice')
      return { kind: 'choice', session: map(row), selection: input.reply as '1' | '2' };
    // Preparation is read-only. The caller must write the financial effect before
    // finalizeConfirmed in this same transaction; a bare reply cannot durably confirm.
    return { kind: 'ready', session: map(row) };
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

  async finalizeConfirmed(
    input: ConfirmationOwner &
      ConfirmationResolverClaim & {
        sessionId: string;
        now: Date;
        proof?: {
          resultId: string;
          action: 'TRANSACTION_UPDATED' | 'TRANSACTION_VOIDED' | 'TRANSACTION_REFUND_CREATED';
          resultVersion: number;
          correlationId: string;
        };
      },
  ): Promise<void> {
    if (!(await this.lockOwner(input))) throw new Error('Confirmation sender unavailable');
    const row = await this.pending(input);
    if (!row || row.id !== input.sessionId || isConfirmationExpired(row.expires_at, input.now))
      throw new Error('Confirmation is not pending');
    const original = await this.lockInbox(row.inbox_message_id, input);
    const resolverRow = await this.lockInbox(input.resolverInboxMessageId, input);
    if (!this.matchesClaim(resolverRow, input))
      throw new Error('Confirmation resolver claim is stale');
    const payload = row.payload as { interpretation?: { kind?: string } } | null;
    if (row.target_entity_type === 'transaction') {
      const proof = input.proof;
      if (
        !proof ||
        !row.target_entity_id ||
        !row.target_version ||
        !Number.isSafeInteger(proof.resultVersion)
      )
        throw new Error('Confirmation mutation proof is missing');
      const expectedAction =
        row.action === 'confirm_correction'
          ? 'TRANSACTION_UPDATED'
          : row.action === 'confirm_void'
            ? 'TRANSACTION_VOIDED'
            : row.action === 'confirm_refund'
              ? 'TRANSACTION_REFUND_CREATED'
              : null;
      if (proof.action !== expectedAction) throw new Error('Confirmation mutation action mismatch');
      const effect = await this.db
        .selectFrom('transactions')
        .select(['id', 'version', 'refund_of_transaction_id', 'inbox_message_id'])
        .where('id', '=', proof.resultId)
        .executeTakeFirst();
      if (
        !effect ||
        effect.version !== proof.resultVersion ||
        (proof.action === 'TRANSACTION_REFUND_CREATED'
          ? effect.refund_of_transaction_id !== row.target_entity_id ||
            effect.inbox_message_id !== row.inbox_message_id
          : effect.id !== row.target_entity_id)
      )
        throw new Error('Confirmation mutation effect is missing');
      if (
        proof.action !== 'TRANSACTION_REFUND_CREATED' &&
        proof.resultVersion !== row.target_version + 1
      )
        throw new Error('Confirmation mutation version did not advance');
      const audit = await this.db
        .selectFrom('audit_events')
        .select(['id', 'new_data', 'created_at'])
        .where('entity_type', '=', 'transaction')
        .where('entity_id', '=', proof.resultId)
        .where('action', '=', proof.action)
        .where('correlation_id', '=', proof.correlationId)
        .where('source', '=', 'whatsapp')
        .where('actor_reference', '=', input.senderReference)
        .executeTakeFirst();
      if (
        !audit ||
        audit.new_data?.id !== proof.resultId ||
        audit.new_data.version !== proof.resultVersion ||
        audit.created_at < resolverRow.created_at
      )
        throw new Error('Confirmation mutation audit is missing');
    }
    if (
      row.action === 'create_transaction' ||
      payload?.interpretation?.kind === 'create_transaction'
    ) {
      const effect = await this.db
        .selectFrom('transactions')
        .select('id')
        .where('inbox_message_id', '=', row.inbox_message_id)
        .where('status', '=', 'posted')
        .executeTakeFirst();
      if (!effect) throw new Error('Confirmation financial effect is missing');
    }
    await this.finishInbox(original, input.now, 'processed');
    const resolver = await this.db
      .updateTable('inbox_messages')
      .set({
        processing_status: 'processed',
        processed_at: input.now,
        updated_at: input.now,
        failure_code: null,
        failure_message: null,
      })
      .where('id', '=', input.resolverInboxMessageId)
      .where('processing_status', '=', 'processing')
      .where('attempt_count', '=', input.attemptCount)
      .where('processing_started_at', '=', input.processingStartedAt)
      .returning('id')
      .executeTakeFirst();
    if (!resolver) throw new Error('Confirmation resolver Inbox is not processing');
    const confirmed = await this.db
      .updateTable('confirmation_sessions')
      .set({
        status: 'confirmed',
        resolution_reason: 'sender_confirmed',
        resolved_at: input.now,
        resolved_by_inbox_message_id: input.resolverInboxMessageId,
      })
      .where('id', '=', row.id)
      .where('status', '=', 'pending')
      .returning('id')
      .executeTakeFirst();
    if (!confirmed) throw new Error('Confirmation is not pending');
  }
}
