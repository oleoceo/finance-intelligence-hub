/**
 * Financial transaction context and port for M04 atomic writes.
 *
 * This port enables T07 GenericCreateTransaction to orchestrate all financial
 * writes within ONE outer PostgreSQL transaction, including:
 * - Master-data readers (Books, Accounts, Categories, Merchants)
 * - Configuration locks
 * - Transaction repository
 * - Idempotency key repository
 * - Audit writer
 *
 * T01 defines the contract shape only. Database adapter implements it.
 * No Kysely, pg or infrastructure types leak into Core.
 *
 * Lock compatibility: this context is compatible with the accepted M03 total
 * lock order (Books → Accounts → Categories → Merchants → ClassificationRules
 * → AuthorizedSenders). Future M04 financial writers will acquire locks in
 * that order through ConfigurationLockPort.
 */

import type { BookRepository } from './master-data-ports.js';
import type { AccountRepository } from './master-data-ports.js';
import type { CategoryRepository } from './master-data-ports.js';
import type { MerchantRepository } from './master-data-ports.js';
import type { ConfigurationLockPort } from './master-data-ports.js';
import type { FinancialUsageReader } from './master-data-ports.js';
import type { TransactionRepository } from './transaction-ports.js';
import type { IdempotencyKeyRepository } from './idempotency-ports.js';
import type { AuditWriter } from './audit-ports.js';
import type {
  ClassificationRuleRepository,
  AuthorizedSenderRepository,
  SenderDefaultReferenceReader,
} from './master-data-ports.js';
import type { InboxRepository } from './inbox-ports.js';
import type {
  ConfirmationSessionRepository,
  ConfirmationOwner,
  ConfirmationSession,
} from './confirmation-ports.js';
import type { TransactionReadPort } from './transaction-ports.js';
import type { Interpretation } from './interpretation-ports.js';

/**
 * Extended transaction context for M04 financial writes.
 * Composes master-data context with new financial ports.
 *
 * Composes only the M03 capabilities needed for M04 financial writes.
 */
export interface FinancialTransactionContext {
  // Master-data repositories (from M03)
  books: BookRepository;
  accounts: AccountRepository;
  categories: CategoryRepository;
  merchants: MerchantRepository;

  // Configuration locking (from M03)
  locks: ConfigurationLockPort;

  // Read-only helpers (from M03)
  financialUsage: FinancialUsageReader;

  // M04 financial ports
  transactions: TransactionRepository;
  idempotencyKeys: IdempotencyKeyRepository;
  audit: AuditWriter;
}

/**
 * Financial transaction port for executing atomic financial writes.
 *
 * T07 GenericCreateTransaction owns calling runInTransaction.
 * T02/T03/T04 operate inside the caller-provided context.
 * No nested independent financial transactions.
 */
export interface FinancialTransactionPort {
  /**
   * Execute operations within a single outer PostgreSQL transaction.
   * All repositories and writers in the context share the same transaction.
   * Commit happens when the callback resolves; rollback on rejection.
   */
  runInTransaction<T>(fn: (ctx: FinancialTransactionContext) => Promise<T>): Promise<T>;
}

export interface InboxProcessingContext extends FinancialTransactionContext {
  classificationRules: ClassificationRuleRepository;
  authorizedSenders: AuthorizedSenderRepository;
  senderDefaults: SenderDefaultReferenceReader;
  inbox: InboxRepository;
  confirmations: ConfirmationSessionRepository;
  reads: TransactionReadPort;
  interpretations: {
    create(input: {
      id: string;
      inboxMessageId: string;
      attemptNumber: number;
      interpretation: Interpretation;
      now: Date;
    }): Promise<void>;
  };
  previewPending(
    owner: ConfirmationOwner,
  ): Promise<Pick<
    ConfirmationSession,
    'id' | 'inboxMessageId' | 'payload' | 'action' | 'expiresAt'
  > | null>;
}

export interface InboxProcessingPort {
  runInboxTransaction<T>(fn: (ctx: InboxProcessingContext) => Promise<T>): Promise<T>;
}
