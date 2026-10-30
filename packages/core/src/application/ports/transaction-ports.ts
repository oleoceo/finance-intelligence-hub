/**
 * Core-facing repository and read ports for Transaction entities.
 *
 * These interfaces define the contracts that Database adapters must implement.
 * Core MUST NOT import Database, Kysely, pg, or Fastify.
 *
 * T01 defines the contract surface only. No persistence implementation here.
 */

import type {
  TransactionType,
  TransactionStatus,
  TransactionCreateSource,
} from '../../domain/finance/transaction-types.js';

/**
 * Canonical Transaction record as stored and returned by the repository.
 * Compatible with the accepted physical schema (transactions table).
 */
export interface TransactionRecord {
  id: string;
  humanRef: string;
  bookId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string; // canonical decimal string with exactly 2 fractional digits
  currency: string;
  accountId: string;
  destinationAccountId: string | null; // non-null only for transfers
  categoryId: string | null;
  merchantId: string | null;
  description: string;
  notes: string | null;
  transactionDate: string; // YYYY-MM-DD
  source: TransactionCreateSource;
  sourceReference: string | null;
  inboxMessageId: string | null;
  refundOfTransactionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}

/** Read representation; the refund flag is derived from the persisted relation. */
export interface TransactionReadRecord extends TransactionRecord {
  isRefund: boolean;
}

/**
 * Discriminated union input for creating a Transaction.
 * Generic create accepts only expense, income, transfer.
 * Refund creation is NOT exposed here — it uses a dedicated endpoint in future tasks.
 */
export type CreateTransactionInput = CreateExpenseInput | CreateIncomeInput | CreateTransferInput;

export interface CreateExpenseInput {
  type: 'expense';
  bookId: string;
  amount: string;
  accountId: string;
  categoryId?: string | null;
  merchantId?: string | null;
  description: string;
  notes?: string | null;
  transactionDate: string;
  sourceReference?: string | null;
}

export interface CreateIncomeInput {
  type: 'income';
  bookId: string;
  amount: string;
  accountId: string;
  categoryId?: string | null;
  merchantId?: string | null;
  description: string;
  notes?: string | null;
  transactionDate: string;
  sourceReference?: string | null;
}

export interface CreateTransferInput {
  type: 'transfer';
  bookId: string;
  amount: string;
  accountId: string;
  destinationAccountId: string;
  description: string;
  notes?: string | null;
  transactionDate: string;
  sourceReference?: string | null;
  // Transfer does NOT accept categoryId or merchantId
}

/**
 * Input for listing transactions with pagination and filtering.
 */
export interface ListTransactionsInput {
  bookId?: string;
  page?: number; // default 1
  pageSize?: number; // default 50; maximum 100
  type?: TransactionType | null;
  status?: TransactionStatus | null;
  accountId?: string | null;
  categoryId?: string | null;
  merchantId?: string | null;
  dateFrom?: string | null; // YYYY-MM-DD inclusive
  dateTo?: string | null; // YYYY-MM-DD inclusive
  search?: string | null;
}

/**
 * Paginated result for list operations.
 */
export interface ListTransactionsResult {
  items: TransactionReadRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Input for retrieving the last posted transaction in a Book context.
 */
export interface GetLastTransactionInput {
  bookId: string;
}

export interface CorrectionFields {
  amount?: string;
  accountId?: string;
  categoryId?: string | null;
  merchantId?: string | null;
  description?: string;
  notes?: string | null;
  transactionDate?: string;
}

export interface PostedRefundLimits {
  total: string;
  earliestDate: string | null;
}

/**
 * Minimal Transaction repository contract for M04.
 * Database adapter implements this; Core consumes it.
 */
export interface TransactionRepository {
  /**
   * Insert a Transaction row. Returns null when human_ref collides
   * (ON CONFLICT DO NOTHING). Caller retries with next candidate inside
   * the same financial transaction. Never throws on unique violation.
   */
  create(
    input: CreateTransactionInput & {
      id: string;
      humanRef: string;
      source: TransactionCreateSource;
      inboxMessageId?: string | null;
      currency: string; // derived from the locked Book, not client input
    },
  ): Promise<TransactionRecord | null>;
  findById(id: string): Promise<TransactionRecord | null>;
  findByHumanRef(humanRef: string): Promise<TransactionRecord | null>;
  findByIdForUpdate(id: string): Promise<TransactionRecord | null>;
  postedRefundLimits(originalId: string): Promise<PostedRefundLimits>;
  correct(
    id: string,
    expectedVersion: number,
    fields: Required<CorrectionFields>,
    now: Date,
  ): Promise<TransactionRecord | null>;
  void(
    id: string,
    expectedVersion: number,
    reason: string,
    now: Date,
  ): Promise<TransactionRecord | null>;
}

/**
 * Read-only port for transaction queries.
 * Separated from write repository to enforce CQRS at the port level.
 */
export interface TransactionReadPort {
  findById(id: string): Promise<TransactionReadRecord | null>;
  list(input: ListTransactionsInput): Promise<ListTransactionsResult>;
  getLast(input: GetLastTransactionInput): Promise<TransactionReadRecord | null>;
}
