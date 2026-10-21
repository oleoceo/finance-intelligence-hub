/**
 * Pure validation functions for M04 financial primitives.
 *
 * All validators are side-effect-free and receive external context (now, timezone)
 * as explicit parameters — no global clock or environment access.
 */

import { Money } from './money.js';
import { FinancialError, FinancialValidationError } from './errors.js';
import type {
  TransactionType,
  TransactionStatus,
  TransactionCreateSource,
} from './transaction-types.js';
import {
  isValidTransactionType,
  isValidTransactionStatus,
  isValidTransactionCreateSource,
} from './transaction-types.js';
import { isValidHumanRef } from './human-ref.js';

/**
 * Strict YYYY-MM-DD calendar-date regex (format only; semantic validation below).
 */
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Days in each month for non-leap and leap years.
 */
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate that a string is a real calendar date in YYYY-MM-DD format.
 * Rejects impossible dates like 2026-02-30 or 2026-02-29 (non-leap).
 * Uses platform Date only for parsing assistance; all logic is pure.
 */
export function validateTransactionDate(value: unknown): string {
  if (typeof value !== 'string') {
    throw new FinancialValidationError('Transaction date must be a string', 'transaction_date');
  }

  const match = DATE_REGEX.exec(value);
  if (!match) {
    throw new FinancialValidationError(
      `Invalid transaction date format: "${value}". Must be YYYY-MM-DD.`,
      'transaction_date',
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    throw new FinancialValidationError(
      `Invalid transaction date month: ${month}. Must be 01–12.`,
      'transaction_date',
    );
  }

  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month];
  if (day < 1 || day > maxDay) {
    throw new FinancialValidationError(
      `Invalid transaction date day: ${day} for ${year}-${String(month).padStart(2, '0')}. Max is ${maxDay}.`,
      'transaction_date',
    );
  }

  return value;
}

/**
 * Validate that a transaction date is not in the future relative to the provided `now`
 * in the Book's IANA timezone.
 *
 * @param dateStr - Validated YYYY-MM-DD string
 * @param now - Current instant (Date) injected by the caller
 * @param bookTimezone - IANA timezone identifier for the Book
 */
export function validateTransactionDateNotFuture(
  dateStr: string,
  now: Date,
  bookTimezone: string,
): void {
  // Compute "today" in the Book's timezone using Intl API
  let todayInBookTz: string;
  try {
    todayInBookTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: bookTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch (cause) {
    throw new FinancialValidationError(
      'Invalid Book timezone or current instant',
      'timezone',
      cause,
    );
  }

  if (dateStr > todayInBookTz) {
    throw new FinancialValidationError(
      `Transaction date ${dateStr} is in the future for timezone ${bookTimezone}. Today is ${todayInBookTz}.`,
      'transaction_date',
    );
  }
}

/**
 * Validate a Money amount for financial transactions.
 * Re-validates through Money.create to ensure canonical form.
 */
export function validateMoneyAmount(amount: unknown, currency: string): Money {
  if (typeof amount !== 'string') {
    throw new FinancialValidationError('Amount must be a decimal string', 'amount');
  }

  try {
    return Money.create(amount, currency);
  } catch (err) {
    throw new FinancialValidationError(
      err instanceof Error ? err.message : String(err),
      'amount',
      err,
    );
  }
}

export function validateTransactionCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new FinancialValidationError('Currency must match [A-Z]{3}', 'currency');
  }
  return value;
}

export function rejectInactiveBook(entity: { active: boolean }): void {
  if (!entity.active) throw new FinancialError('Book is inactive', 'BOOK_INACTIVE');
}
export function rejectInactiveAccount(entity: { active: boolean }): void {
  if (!entity.active) throw new FinancialError('Account is inactive', 'ACCOUNT_INACTIVE');
}
export function rejectInactiveCategory(entity: { active: boolean }): void {
  if (!entity.active) throw new FinancialError('Category is inactive', 'CATEGORY_INACTIVE');
}
export function rejectInactiveMerchant(entity: { active: boolean }): void {
  if (!entity.active) throw new FinancialError('Merchant is inactive', 'MERCHANT_INACTIVE');
}

/**
 * Validate transaction type guard with field context.
 */
export function validateTransactionType(value: unknown): TransactionType {
  if (!isValidTransactionType(value)) {
    throw new FinancialValidationError(
      `Invalid transaction type: "${String(value)}". Must be one of: expense, income, transfer.`,
      'type',
    );
  }
  return value;
}

/**
 * Validate transaction status guard with field context.
 */
export function validateTransactionStatus(value: unknown): TransactionStatus {
  if (!isValidTransactionStatus(value)) {
    throw new FinancialValidationError(
      `Invalid transaction status: "${String(value)}". Must be one of: posted, voided.`,
      'status',
    );
  }
  return value;
}

/**
 * Validate creation source guard with field context.
 */
export function validateTransactionCreateSource(value: unknown): TransactionCreateSource {
  if (!isValidTransactionCreateSource(value)) {
    throw new FinancialValidationError(
      `Invalid transaction create source: "${String(value)}". Must be: direct_api.`,
      'source',
    );
  }
  return value;
}

/**
 * Validate human_ref format with field context.
 */
export function validateHumanRefField(value: unknown): string {
  if (!isValidHumanRef(value)) {
    throw new FinancialValidationError(
      `Invalid human_ref: "${String(value)}". Must be uppercase ASCII alphanumeric, 1–16 characters.`,
      'human_ref',
    );
  }
  return value;
}

/**
 * Validate that source and destination accounts differ for transfers.
 */
export function validateTransferAccountsDiffer(
  accountId: string,
  destinationAccountId: string,
): void {
  if (accountId === destinationAccountId) {
    throw new FinancialValidationError(
      'Transfer source and destination accounts must differ.',
      'destination_account_id',
    );
  }
}
