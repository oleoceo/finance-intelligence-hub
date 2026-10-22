/**
 * CreateOrdinaryIncome use case (M04-T03).
 *
 * Implements the Income creation path with full financial invariant enforcement.
 * This executor receives validated input and a caller-provided FinancialTransactionContext.
 * It does NOT open, commit, or create its own transaction — T07 owns the outer
 * financial transaction in production. T03 tests may wrap calls in an explicit
 * test-owned financial context.
 *
 * Locking: participates in the accepted M03 lock protocol.
 * Order: Book → Account → Category? → Merchant?
 * UUIDs sorted ascending within each entity kind.
 *
 * Human-ref collision: uses ON CONFLICT DO NOTHING RETURNING with up to 3
 * generated candidates inside the same PostgreSQL transaction. Exhaustion
 * maps to INTERNAL_ERROR (no new public code).
 *
 * Refund bypass: any attempt to supply refundOfTransactionId or refund_of_transaction_id
 * is rejected as VALIDATION_ERROR. Ordinary Income always persists refund_of_transaction_id = null.
 */

import { v7 as uuidv7 } from 'uuid';
import type { FinancialTransactionContext } from '../ports/financial-transaction-port.js';
import type { TransactionRecord, CreateIncomeInput } from '../ports/transaction-ports.js';
import type { HumanRefGenerator } from '../../domain/finance/human-ref.js';
import {
  validateMoneyAmount,
  validateTransactionDate,
  validateTransactionDateNotFuture,
  rejectInactiveBook,
  rejectInactiveAccount,
  rejectInactiveCategory,
  rejectInactiveMerchant,
} from '../../domain/finance/transaction-validation.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';

/**
 * Dependencies injectable for deterministic testing.
 */
export interface CreateIncomeDependencies {
  humanRefGenerator: HumanRefGenerator;
  now: Date;
  generateId?: () => string;
}

/** Maximum human_ref collision retries within one financial transaction. */
const MAX_HUMAN_REF_ATTEMPTS = 3;

/**
 * Create an Ordinary Income transaction.
 *
 * @param input - CreateIncomeInput, checked again at this runtime boundary
 * @param ctx - FinancialTransactionContext provided by the outer transaction owner
 * @param deps - Injectable dependencies for testability
 * @returns The persisted TransactionRecord
 *
 * @throws FinancialError for business-rule violations (inactive entities, future date, etc.)
 * @throws FinancialValidationError for input validation failures
 * @throws Error for infrastructure failures (human_ref exhaustion after 3 attempts)
 */
export async function createOrdinaryIncome(
  input: CreateIncomeInput,
  ctx: FinancialTransactionContext,
  deps: CreateIncomeDependencies,
): Promise<TransactionRecord> {
  if (input === null || typeof input !== 'object') {
    throw new FinancialValidationError('Income input must be an object');
  }
  if (input.type !== 'income') {
    throw new FinancialValidationError('Transaction type must be income', 'type');
  }
  for (const field of [
    'bookId',
    'accountId',
    'amount',
    'description',
    'transactionDate',
  ] as const) {
    if (typeof input[field] !== 'string') {
      throw new FinancialValidationError(`Invalid or missing ${field}`, field);
    }
  }
  // Refund bypass rejection — critical invariant
  if ('refundOfTransactionId' in input || 'refund_of_transaction_id' in input) {
    throw new FinancialValidationError('Refund relation is not accepted for ordinary Income');
  }
  validateTransactionDate(input.transactionDate);
  validateMoneyAmount(input.amount, 'BRL');
  const generateId = deps.generateId ?? uuidv7;
  const now = deps.now;

  // ── 1. Preliminary reads to discover reference IDs ──────────────────
  // These reads are NOT authoritative — they only discover which entities
  // need locking. Authoritative state is re-read after locks are acquired.

  const bookId = input.bookId;
  const accountId = input.accountId;
  const categoryId = input.categoryId ?? null;
  const merchantId = input.merchantId ?? null;

  // ── 2. Build lock set in accepted order: Book → Account → Category? → Merchant? ──
  const lockBooks = [bookId];
  const lockAccounts = [accountId];
  const lockCategories = categoryId ? [categoryId] : [];
  const lockMerchants = merchantId ? [merchantId] : [];

  // ── 3. Acquire locks in deterministic order ─────────────────────────
  await ctx.locks.acquireLocks({
    books: lockBooks,
    accounts: lockAccounts,
    categories: lockCategories,
    merchants: lockMerchants,
  });

  // ── 4. Re-read authoritative state under locks ──────────────────────
  const book = await ctx.books.findById(bookId);
  if (!book) {
    throw new FinancialError(`Book not found: ${bookId}`, 'BOOK_NOT_FOUND');
  }
  rejectInactiveBook(book);

  const account = await ctx.accounts.findById(accountId);
  if (!account) {
    throw new FinancialError(`Account not found: ${accountId}`, 'ACCOUNT_NOT_FOUND');
  }
  rejectInactiveAccount(account);

  // Account must belong to the same Book
  if (account.bookId !== bookId) {
    throw new FinancialError(
      `Account ${accountId} does not belong to Book ${bookId}`,
      'VALIDATION_ERROR',
    );
  }

  // Currency must match between Book and Account
  if (account.currency !== book.currency) {
    throw new FinancialError(
      `Account currency (${account.currency}) does not match Book currency (${book.currency})`,
      'CURRENCY_MISMATCH',
    );
  }

  // Validate Money against Book currency
  const money = validateMoneyAmount(input.amount, book.currency);

  // Validate transaction date format and calendar correctness
  validateTransactionDate(input.transactionDate);

  // Validate date is not in the future relative to Book timezone
  validateTransactionDateNotFuture(input.transactionDate, now, book.timezone);

  // Validate optional Category
  if (categoryId) {
    const category = await ctx.categories.findById(categoryId);
    if (!category) {
      throw new FinancialError(`Category not found: ${categoryId}`, 'CATEGORY_NOT_FOUND');
    }
    rejectInactiveCategory(category);
    if (category.bookId !== bookId) {
      throw new FinancialError(
        `Category ${categoryId} does not belong to Book ${bookId}`,
        'VALIDATION_ERROR',
      );
    }
  }

  // Validate optional Merchant (global — no Book ownership check)
  if (merchantId) {
    const merchant = await ctx.merchants.findById(merchantId);
    if (!merchant) {
      throw new FinancialError(`Merchant not found: ${merchantId}`, 'MERCHANT_NOT_FOUND');
    }
    rejectInactiveMerchant(merchant);
  }

  // ── 5. Generate server-controlled fields ────────────────────────────
  const id = generateId();

  // ── 6. Persist with human_ref collision-safe protocol ───────────────
  // Try up to MAX_HUMAN_REF_ATTEMPTS candidates using ON CONFLICT DO NOTHING RETURNING.
  // All attempts happen within the SAME financial transaction (caller-owned).
  let record: TransactionRecord | null = null;

  for (let attempt = 0; attempt < MAX_HUMAN_REF_ATTEMPTS; attempt++) {
    const humanRef = deps.humanRefGenerator.generate();

    record = await ctx.transactions.create({
      type: 'income',
      id,
      humanRef,
      bookId,
      amount: money.amount,
      currency: book.currency,
      accountId,
      categoryId: categoryId ?? null,
      merchantId: merchantId ?? null,
      description: input.description,
      notes: input.notes ?? null,
      transactionDate: input.transactionDate,
      sourceReference: input.sourceReference ?? null,
      source: 'direct_api',
    });

    if (record) {
      break;
    }
    // record is null means ON CONFLICT DO NOTHING returned no row — collision.
    // Generate next candidate and retry within the same transaction.
  }

  if (!record) {
    // Exhaustion after MAX_HUMAN_REF_ATTEMPTS — internal/infrastructure failure.
    // Maps to INTERNAL_ERROR at the API boundary. No new public financial code.
    throw new Error(`Failed to generate unique human_ref after ${MAX_HUMAN_REF_ATTEMPTS} attempts`);
  }

  return record;
}
