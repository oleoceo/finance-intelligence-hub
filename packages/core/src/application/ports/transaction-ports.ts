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
  description: string | null;
  notes: string | null;
  transactionDate: string; // YYYY-MM-DD
  source: TransactionCreateSource;
  refundOfTransactionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  voidedAt: Date | null;
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
  currency: string;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  description: string | null;
  notes: string | null;
  transactionDate: string;
}

export interface CreateIncomeInput {
  type: 'income';
  bookId: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string | null;
  merchantId: string | null;
  description: string | null;
  notes: string | null;
  transactionDate: string;
}

export interface CreateTransferInput {
  type: 'transfer';
  bookId: string;
  amount: string;
  currency: string;
  accountId: string;
  destinationAccountId: string;
  description: string | null;
  notes: string | null;
  transactionDate: string;
  // Transfer does NOT accept categoryId or merchantId
}

/**
 * Input for listing transactions with pagination and filtering.
 */
export interface ListTransactionsInput {
  bookId: string;
  pageSize: number;
  cursor?: string | null;
  type?: TransactionType | null;
  status?: TransactionStatus | null;
  accountId?: string | null;
  fromDate?: string | null; // YYYY-MM-DD inclusive
  toDate?: string | null; // YYYY-MM-DD inclusive
}

/**
 * Paginated result for list operations.
 */
export interface ListTransactionsResult {
  items: TransactionRecord[];
  nextCursor: string | null;
}

/**
 * Input for retrieving the last posted transaction in a Book context.
 */
export interface GetLastTransactionInput {
  bookId: string;
}

/**
 * Minimal Transaction repository contract for M04.
 * Database adapter implements this; Core consumes it.
 */
export interface TransactionRepository {
  create(
    input: CreateTransactionInput & {
      id: string;
      humanRef: string;
      source: TransactionCreateSource;
    },
  ): Promise<TransactionRecord>;
  findById(id: string): Promise<TransactionRecord | null>;
  findByHumanRef(humanRef: string): Promise<TransactionRecord | null>;
  list(input: ListTransactionsInput): Promise<ListTransactionsResult>;
  getLast(input: GetLastTransactionInput): Promise<TransactionRecord | null>;
}

/**
 * Read-only port for transaction queries.
 * Separated from write repository to enforce CQRS at the port level.
 */
export interface TransactionReadPort {
  findById(id: string): Promise<TransactionRecord | null>;
  list(input: ListTransactionsInput): Promise<ListTransactionsResult>;
  getLast(input: GetLastTransactionInput): Promise<TransactionRecord | null>;
}
