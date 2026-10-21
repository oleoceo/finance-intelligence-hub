/**
 * Core-facing repository and read ports for master-data entities.
 *
 * These interfaces define the contracts that Database adapters must implement.
 * Core MUST NOT import Database, Kysely, pg, or Fastify.
 */

import type {
  ClassificationRuleRecord,
  UpdateClassificationRuleRepoInput,
} from '../../domain/master-data/classification-rule.js';
import type {
  AuthorizedSenderRecord,
  UpdateAuthorizedSenderRepoInput,
} from '../../domain/master-data/authorized-sender.js';

/**
 * Input for creating a Book record.
 */
export interface CreateBookInput {
  id: string;
  name: string;
  normalizedName: string;
  currency: string;
  timezone: string;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating a Book record.
 */
export interface UpdateBookInput {
  id: string;
  name: string;
  normalizedName: string;
  currency: string;
  timezone: string;
  updatedAt: Date;
}

/**
 * Input for archiving a Book record.
 */
export interface ArchiveBookInput {
  id: string;
  active: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

/**
 * Minimal Book repository contract for configuration use cases.
 */
export interface BookRepository {
  findById(id: string): Promise<BookRecord | null>;
  findByName(normalizedName: string): Promise<BookRecord | null>;
  find(): Promise<BookRecord[]>;
  create(input: CreateBookInput): Promise<void>;
  update(input: UpdateBookInput): Promise<BookRecord>;
  archive(input: ArchiveBookInput): Promise<BookRecord>;
}

export interface BookRecord {
  id: string;
  name: string;
  normalizedName: string;
  currency: string;
  timezone: string;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating an Account record.
 */
export interface CreateAccountInput {
  id: string;
  bookId: string;
  name: string;
  normalizedName: string;
  type: string;
  currency: string;
  institutionName: string | null;
  notes: string | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating an Account record.
 */
export interface UpdateAccountInput {
  id: string;
  name: string;
  normalizedName: string;
  type: string;
  currency: string;
  institutionName: string | null;
  notes: string | null;
  updatedAt: Date;
}

/**
 * Input for archiving an Account record.
 */
export interface ArchiveAccountInput {
  id: string;
  active: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

/**
 * Minimal Account repository contract for configuration use cases.
 */
export interface AccountRepository {
  findById(id: string): Promise<AccountRecord | null>;
  findByBookId(bookId: string): Promise<AccountRecord[]>;
  find(): Promise<AccountRecord[]>;
  create(input: CreateAccountInput): Promise<void>;
  update(input: UpdateAccountInput): Promise<AccountRecord>;
  archive(input: ArchiveAccountInput): Promise<AccountRecord>;
}

export interface AccountRecord {
  id: string;
  bookId: string;
  name: string;
  normalizedName: string;
  type: string;
  currency: string;
  institutionName: string | null;
  notes: string | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a Category record.
 */
export interface CreateCategoryInput {
  id: string;
  bookId: string;
  name: string;
  normalizedName: string;
  parentCategoryId: string | null;
  type: string;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating a Category record (supports reparenting).
 */
export interface UpdateCategoryInput {
  id: string;
  name?: string;
  normalizedName?: string;
  parentCategoryId?: string | null; // null means detach to root
  type?: string;
  updatedAt: Date;
  active?: boolean;
  archivedAt?: Date | null;
}

/**
 * Input for archiving a Category record.
 */
export interface ArchiveCategoryInput {
  id: string;
  active: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

/**
 * Category repository contract for configuration use cases.
 * Includes hierarchy-aware operations.
 */
export interface CategoryRepository {
  findById(id: string): Promise<CategoryRecord | null>;
  findByBookId(bookId: string): Promise<CategoryRecord[]>;
  find(): Promise<CategoryRecord[]>;
  create(input: CreateCategoryInput): Promise<void>;
  update(input: UpdateCategoryInput): Promise<CategoryRecord>;
  archive(input: ArchiveCategoryInput): Promise<CategoryRecord>;
  /**
   * Find categories by IDs in deterministic order (for locking).
   */
  findByIds(ids: string[]): Promise<CategoryRecord[]>;
}

export interface CategoryRecord {
  id: string;
  bookId: string;
  name: string;
  normalizedName: string;
  parentCategoryId: string | null;
  type: string;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a Merchant record.
 */
export interface CreateMerchantInput {
  id: string;
  name: string;
  normalizedName: string;
  type: string | null;
  taxIdentifier: string | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating a Merchant record.
 */
export interface UpdateMerchantInput {
  id: string;
  name?: string;
  normalizedName?: string;
  type?: string | null;
  taxIdentifier?: string | null;
  updatedAt: Date;
  active?: boolean;
  archivedAt?: Date | null;
}

/**
 * Input for archiving a Merchant record.
 */
export interface ArchiveMerchantInput {
  id: string;
  active: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

/**
 * Merchant repository contract for configuration use cases.
 * Note: normalized_name is NOT unique; lookups may return multiple rows.
 */
export interface MerchantRepository {
  findById(id: string): Promise<MerchantRecord | null>;
  findByNormalizedName(normalizedName: string): Promise<MerchantRecord[]>;
  find(): Promise<MerchantRecord[]>;
  create(input: CreateMerchantInput): Promise<void>;
  update(input: UpdateMerchantInput): Promise<MerchantRecord>;
  archive(input: ArchiveMerchantInput): Promise<MerchantRecord>;
  /**
   * Find merchants by IDs in deterministic order (for locking).
   */
  findByIds(ids: string[]): Promise<MerchantRecord[]>;
}

export interface MerchantRecord {
  id: string;
  name: string;
  normalizedName: string;
  type: string | null;
  taxIdentifier: string | null;
  active: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Read-only port to determine whether a Book or Account has historical financial usage.
 * Used by immutability guards and archive validation.
 * Counts all historical rows including voided transactions.
 */
export interface FinancialUsageReader {
  hasBookUsage(bookId: string): Promise<boolean>;
  hasAccountUsage(accountId: string): Promise<boolean>;
}

/**
 * Read-only port to determine whether a Book or Account is referenced
 * as an Authorized Sender default (including inactive senders).
 * Used by archive validation.
 */
export interface SenderDefaultReferenceReader {
  hasBookDefault(bookId: string): Promise<boolean>;
  hasAccountDefault(accountId: string): Promise<boolean>;
}

/**
 * Transaction-scoped ordered configuration lock contract.
 * Database owns commit/rollback/connection mechanics.
 * Core owns use-case policy and lock ordering.
 *
 * Lock order: Books → Accounts → Categories → Merchants → ClassificationRules → AuthorizedSenders
 * UUID ascending within each kind.
 */
export interface ConfigurationLockPort {
  /**
   * Acquire shared FOR UPDATE locks on the specified entity IDs in deterministic order.
   * Must be called within an active transaction context.
   */
  acquireLocks(spec: LockSpec): Promise<void>;
}

export interface LockSpec {
  books?: string[];
  accounts?: string[];
  categories?: string[];
  merchants?: string[];
  classificationRules?: string[];
  authorizedSenders?: string[];
}

/**
 * Transaction capability port.
 * Provides a way to execute operations within a database transaction.
 * Does not expose Kysely, pg, or any database-specific types to Core.
 */
export interface TransactionPort {
  /**
   * Execute operations within a transaction.
   * The callback receives transaction-scoped repository instances.
   */
  runInTransaction<T>(fn: (ctx: MasterDataTransactionContext) => Promise<T>): Promise<T>;
}

/**
 * T03 transaction context containing capabilities for Books, Accounts, Categories, and Merchants.
 */
export interface MasterDataTransactionContext {
  books: BookRepository;
  accounts: AccountRepository;
  categories: CategoryRepository;
  merchants: MerchantRepository;
  locks: ConfigurationLockPort;
  financialUsage: FinancialUsageReader;
  senderDefaults: SenderDefaultReferenceReader;
}

/**
 * Legacy alias for backwards compatibility during T02 review.
 * Use MasterDataTransactionContext for new code.
 */
export type TransactionContext = MasterDataTransactionContext;

/**
 * Classification Rule repository port (forward declaration to avoid circular imports).
 * Full contract lives in rule-sender-ports.ts.
 */
export interface ClassificationRuleRepository {
  findById(id: string): Promise<ClassificationRuleRecord | null>;
  find(): Promise<ClassificationRuleRecord[]>;
  create(input: ClassificationRuleRecord): Promise<void>;
  update(input: UpdateClassificationRuleRepoInput): Promise<ClassificationRuleRecord>;
}

/**
 * Authorized Sender repository port (forward declaration to avoid circular imports).
 * Full contract lives in rule-sender-ports.ts.
 */
export interface AuthorizedSenderRepository {
  findById(id: string): Promise<AuthorizedSenderRecord | null>;
  findByChannelAndReference(
    channel: string,
    senderReference: string,
  ): Promise<AuthorizedSenderRecord | null>;
  find(): Promise<AuthorizedSenderRecord[]>;
  create(input: AuthorizedSenderRecord): Promise<void>;
  update(input: UpdateAuthorizedSenderRepoInput): Promise<AuthorizedSenderRecord>;
}

/**
 * T04 transaction context extension with Classification Rules and Authorized Senders.
 */
export interface MasterDataTransactionContextT04 extends MasterDataTransactionContext {
  classificationRules: ClassificationRuleRepository;
  authorizedSenders: AuthorizedSenderRepository;
}

/** Restart discovery in a fresh transaction; never acquire earlier-ranked locks late. */
export class ConfigurationLockSetChangedError extends Error {}
