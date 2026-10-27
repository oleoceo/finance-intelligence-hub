import type { AuthorizedSenderRepository, ConfigurationLockPort } from './master-data-ports.js';

export type InboxStatus =
  'received' | 'processing' | 'needs_confirmation' | 'processed' | 'failed' | 'ignored';

export interface InboxIdentity {
  source: string;
  sourceInstance: string;
  sourceMessageId: string;
}

export interface InboxMessage extends InboxIdentity {
  id: string;
  senderReference: string;
  authorizedSenderId: string;
  rawText: string;
  rawPayload: Record<string, unknown> | null;
  receivedAt: Date;
  status: InboxStatus;
  attemptCount: number;
  processingStartedAt: Date | null;
  lastAttemptAt: Date | null;
  processedAt: Date | null;
  correlationId: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewInboxMessage extends InboxIdentity {
  id: string;
  senderReference: string;
  authorizedSenderId: string;
  rawText: string;
  rawPayload?: Record<string, unknown> | null;
  receivedAt: Date;
  correlationId: string;
  now: Date;
}

export interface InboxClaim {
  message: InboxMessage;
  claimed: boolean;
  // Fencing token is the persisted attempt number plus processing timestamp.
  attemptCount: number;
  processingStartedAt: Date | null;
}

export interface InboxRepository {
  claim(input: NewInboxMessage, staleBefore: Date): Promise<InboxClaim>;
  findById(id: string): Promise<InboxMessage | null>;
  transition(input: {
    id: string;
    attemptCount: number;
    processingStartedAt: Date;
    status: Exclude<InboxStatus, 'received' | 'processing'>;
    now: Date;
    failureCode?: string | null;
    failureMessage?: string | null;
  }): Promise<InboxMessage | null>;
}

export interface InboxTransactionContext {
  senders: AuthorizedSenderRepository;
  locks: ConfigurationLockPort;
  inbox: InboxRepository;
}

export interface InboxTransactionPort {
  runInTransaction<T>(fn: (context: InboxTransactionContext) => Promise<T>): Promise<T>;
}
