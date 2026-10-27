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
  | { kind: 'expired' | 'cancelled'; session: ConfirmationSession }
  | { kind: 'confirmed'; session: ConfirmationSession };

/** Every method runs on the caller's PostgreSQL transaction. */
export interface ConfirmationSessionRepository {
  create(input: NewConfirmationSession): Promise<ConfirmationSession>;
  resolveReply(
    input: ConfirmationOwner & {
      reply: ConfirmationReply;
      resolverInboxMessageId: string;
      now: Date;
    },
  ): Promise<ConfirmationResolution>;
  expire(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution>;
  supersede(input: ConfirmationOwner & { now: Date }): Promise<ConfirmationResolution>;
  /** Call only after financial create succeeds in the same outer transaction as resolveReply. */
  finalizeConfirmed(input: { sessionId: string; now: Date }): Promise<void>;
}
