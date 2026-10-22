/**
 * CreateTransfer use case (M04-T04).
 *
 * Implements the Transfer creation path with full financial invariant enforcement.
 * This executor receives validated input and a caller-provided FinancialTransactionContext.
 * It does NOT open, commit, or create its own transaction — T07 owns the outer
 * financial transaction in production. T04 tests may wrap calls in an explicit
 * test-owned financial context.
 *
 * Locking: participates in the accepted M03 lock protocol.
 * Order: Book → Accounts (sorted ascending by UUID)
 *
 * Human-ref collision: uses ON CONFLICT DO NOTHING RETURNING with up to 3
 * generated candidates inside the same PostgreSQL transaction. Exhaustion
 * maps to INTERNAL_ERROR (no new public code).
 *
 * Transfer specific invariants:
 * - source != destination
 * - same Book for both accounts
 * - same Currency for Book and both accounts
 * - amount > 0
 * - no categoryId, merchantId, or refundOfTransactionId
 */

import { v7 as uuidv7 } from 'uuid';
import type { FinancialTransactionContext } from '../ports/financial-transaction-port.js';
import type { TransactionRecord, CreateTransferInput } from '../ports/transaction-ports.js';
import type { HumanRefGenerator } from '../../domain/finance/human-ref.js';
import {
  validateMoneyAmount,
  validateTransactionDate,
  validateTransactionDateNotFuture,
  rejectInactiveBook,
  rejectInactiveAccount,
  validateTransferAccountsDiffer,
} from '../../domain/finance/transaction-validation.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';

/**
 * Dependencies injectable for deterministic testing.
 */
export interface CreateTransferDependencies {
  humanRefGenerator: HumanRefGenerator;
  now: Date;
  generateId?: () => string;
}

/** Maximum human_ref collision retries within one financial transaction. */
const MAX_HUMAN_REF_ATTEMPTS = 3;

/**
 * Create a Transfer transaction.
 *
 * @param input - CreateTransferInput, checked again at this runtime boundary
 * @param ctx - FinancialTransactionContext provided by the outer transaction owner
 * @param deps - Injectable dependencies for testability
 * @returns The persisted TransactionRecord
 *
 * @throws FinancialError for business-rule violations (inactive entities, future date, etc.)
 * @throws FinancialValidationError for input validation failures
 * @throws Error for infrastructure failures (human_ref exhaustion after 3 attempts)
 */
export async function createTransfer(
  input: CreateTransferInput,
  ctx: FinancialTransactionContext,
  deps: CreateTransferDependencies,
): Promise<TransactionRecord> {
  if (input === null || typeof input !== 'object') {
    throw new FinancialValidationError('Transfer input must be an object');
  }
  if (input.type !== 'transfer') {
    throw new FinancialValidationError('Transaction type must be transfer', 'type');
  }
  for (const field of [
    'bookId',
    'accountId',
    'destinationAccountId',
    'amount',
    'description',
    'transactionDate',
  ] as const) {
    if (typeof input[field] !== 'string') {
      throw new FinancialValidationError(`Invalid or missing ${field}`, field);
    }
  }
  // Prohibited fields rejection — critical invariant
  if ('categoryId' in input || 'category_id' in input) {
    throw new FinancialValidationError('Category is not accepted for Transfer');
  }
  if ('merchantId' in input || 'merchant_id' in input) {
    throw new FinancialValidationError('Merchant is not accepted for Transfer');
  }
  if ('refundOfTransactionId' in input || 'refund_of_transaction_id' in input) {
    throw new FinancialValidationError('Refund relation is not accepted for Transfer');
  }

  validateTransactionDate(input.transactionDate);
  validateMoneyAmount(input.amount, 'BRL');
  const generateId = deps.generateId ?? uuidv7;
  const now = deps.now;

  // ── 1. Preliminary reads to discover reference IDs ──────────────────
  const bookId = input.bookId;
  const sourceAccountId = input.accountId;
  const destinationAccountId = input.destinationAccountId;

  // ── 2. Build lock set: Book → Accounts (sorted ascending) ───────────
  const lockBooks = [bookId];
  const accountIds = [sourceAccountId, destinationAccountId].sort();
  const lockAccounts = accountIds;

  // ── 3. Acquire locks in deterministic order ─────────────────────────
  await ctx.locks.acquireLocks({
    books: lockBooks,
    accounts: lockAccounts,
  });

  // ── 4. Re-read authoritative state under locks ──────────────────────
  const book = await ctx.books.findById(bookId);
  if (!book) {
    throw new FinancialError(`Book not found: ${bookId}`, 'BOOK_NOT_FOUND');
  }
  rejectInactiveBook(book);

  const sourceAccount = await ctx.accounts.findById(sourceAccountId);
  if (!sourceAccount) {
    throw new FinancialError(`Account not found: ${sourceAccountId}`, 'ACCOUNT_NOT_FOUND');
  }
  rejectInactiveAccount(sourceAccount);

  const destinationAccount = await ctx.accounts.findById(destinationAccountId);
  if (!destinationAccount) {
    throw new FinancialError(`Account not found: ${destinationAccountId}`, 'ACCOUNT_NOT_FOUND');
  }
  rejectInactiveAccount(destinationAccount);

  // Validate source != destination
  validateTransferAccountsDiffer(sourceAccountId, destinationAccountId);

  // Both accounts must belong to the same Book
  if (sourceAccount.bookId !== bookId) {
    throw new FinancialError(
      `Source Account ${sourceAccountId} does not belong to Book ${bookId}`,
      'VALIDATION_ERROR',
    );
  }
  if (destinationAccount.bookId !== bookId) {
    throw new FinancialError(
      `Destination Account ${destinationAccountId} does not belong to Book ${bookId}`,
      'VALIDATION_ERROR',
    );
  }

  // Cross-Book transfer check (redundant given above, but explicit per frozen docs)
  if (sourceAccount.bookId !== destinationAccount.bookId) {
    throw new FinancialError(
      'Cross-Book transfers are not supported',
      'CROSS_BOOK_TRANSFER_NOT_SUPPORTED',
    );
  }

  // Currency must match between Book and both Accounts
  if (sourceAccount.currency !== book.currency) {
    throw new FinancialError(
      `Source Account currency (${sourceAccount.currency}) does not match Book currency (${book.currency})`,
      'CURRENCY_MISMATCH',
    );
  }
  if (destinationAccount.currency !== book.currency) {
    throw new FinancialError(
      `Destination Account currency (${destinationAccount.currency}) does not match Book currency (${book.currency})`,
      'CURRENCY_MISMATCH',
    );
  }

  // Validate Money against Book currency
  const money = validateMoneyAmount(input.amount, book.currency);

  // Validate transaction date format and calendar correctness
  validateTransactionDate(input.transactionDate);

  // Validate date is not in the future relative to Book timezone
  validateTransactionDateNotFuture(input.transactionDate, now, book.timezone);

  // ── 5. Generate server-controlled fields ────────────────────────────
  const id = generateId();

  // ── 6. Persist with human_ref collision-safe protocol ───────────────
  let record: TransactionRecord | null = null;

  for (let attempt = 0; attempt < MAX_HUMAN_REF_ATTEMPTS; attempt++) {
    const humanRef = deps.humanRefGenerator.generate();

    record = await ctx.transactions.create({
      type: 'transfer',
      id,
      humanRef,
      bookId,
      amount: money.amount,
      currency: book.currency,
      accountId: sourceAccountId,
      destinationAccountId: destinationAccountId,
      categoryId: null,
      merchantId: null,
      description: input.description,
      notes: input.notes ?? null,
      transactionDate: input.transactionDate,
      sourceReference: input.sourceReference ?? null,
      source: 'direct_api',
    });

    if (record) {
      break;
    }
  }

  if (!record) {
    throw new Error(`Failed to generate unique human_ref after ${MAX_HUMAN_REF_ATTEMPTS} attempts`);
  }

  return record;
}