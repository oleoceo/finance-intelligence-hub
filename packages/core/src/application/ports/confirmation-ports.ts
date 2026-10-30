import type {
  ConfirmationReply,
  ConfirmationStatus,
} from '../../domain/inbox/confirmation-session.js';

export interface ConfirmationSession {
  id: string;
  channel: string;
  senderReference: string;
  authorizedSenderId: string;
  inboxMessageId: string;
  resolvedByInboxMessageId: string | null;
  action: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  targetVersion: number | null;
  payload: Record<string, unknown>;
  status: ConfirmationStatus;
  resolutionReason: string | null;
  expiresAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ConfirmationOwner {
  channel: string;
  senderReference: string;
  authorizedSenderId: string;
}

export interface NewConfirmationSession extends ConfirmationOwner {
  id: string;
  inboxMessageId: string;
  action: string;
  payload: Record<string, unknown>;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  targetVersion?: number | null;
  now: Date;
  ttlMs?: number;
}

export type ConfirmationResolution =
  | { kind: 'none' }
  | { kind: 'stale_claim' }
  | { kind: 'expired' | 'cancelled'; session: ConfirmationSession }
  | { kind: 'ready'; session: ConfirmationSession }
  | { kind: 'choice'; session: ConfirmationSession; selection: '1' | '2' };

export interface ConfirmationResolverClaim {
  resolverInboxMessageId: string;
  attemptCount: number;
  processingStartedAt: Date;
}

/**
 * Every method runs on the caller's PostgreSQL transaction. Before confirmed
 * financial execution, P05 must acquire the complete M03 configuration lock set
 * in rank order: Book, Account, Category, Merchant, Rule, Authorized Sender;
 * UUIDs ascend within each rank. Then resolve, write the financial effect,
 * Audit and idempotency, and finalize in that same transaction.
 */
export interface ConfirmationSessionRepository {
  create(input: NewConfirmationSession): Promise<ConfirmationSession>;
  advanceChoice(
    input: ConfirmationOwner &
      ConfirmationResolverClaim & {
        sessionId: string;
        action: string;
        payload: Record<string, unknown>;
        targetEntityId?: string;
        targetVersion?: number;
        now: Date;
      },
  ): Promise<ConfirmationSession>;
  resolveReply(
    input: ConfirmationOwner &
      ConfirmationResolverClaim & {
        reply: ConfirmationReply;
        now: Date;
      },
  ): Promise<ConfirmationResolution>;
  expire(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution>;
  supersede(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution>;
  /** After the financial effect and Audit/idempotency writes, in the same caller-owned transaction. */
  finalizeConfirmed(
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
  ): Promise<void>;
}
