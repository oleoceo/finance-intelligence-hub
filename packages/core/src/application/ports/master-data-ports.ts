/**
 * Core-facing repository and read ports for master-data entities.
 *
 * These interfaces define the contracts that Database adapters must implement.
 * Core MUST NOT import Database, Kysely, pg, or Fastify.
 */

/**
 * Minimal Book lookup contract for configuration use cases.
 */
export interface BookRepository {
  findById(id: string): Promise<BookRecord | null>;
  findByName(normalizedName: string): Promise<BookRecord | null>;
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
 * Minimal Account lookup contract for configuration use cases.
 */
export interface AccountRepository {
  findById(id: string): Promise<AccountRecord | null>;
  findByBookId(bookId: string): Promise<AccountRecord[]>;
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
 * Minimal Category lookup contract for configuration use cases.
 */
export interface CategoryRepository {
  findById(id: string): Promise<CategoryRecord | null>;
  findByBookId(bookId: string): Promise<CategoryRecord[]>;
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
 * Minimal Merchant lookup contract for configuration use cases.
 * Note: normalized_name is NOT unique; lookups may return multiple rows.
 */
export interface MerchantRepository {
  findById(id: string): Promise<MerchantRecord | null>;
  findByNormalizedName(normalizedName: string): Promise<MerchantRecord[]>;
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
  runInTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface TransactionContext {
  books: BookRepository;
  accounts: AccountRepository;
  categories: CategoryRepository;
  merchants: MerchantRepository;
  locks: ConfigurationLockPort;
  financialUsage: FinancialUsageReader;
  senderDefaults: SenderDefaultReferenceReader;
}
