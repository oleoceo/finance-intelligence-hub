/**
 * Immutable-field validation helpers for master-data entities.
 *
 * These are pure functions that receive dependency/usage facts
 * and validate whether a field change is permitted.
 */

import { ImmutabilityError } from './errors.js';

export interface BookDependencyCheck {
  hasAccounts: boolean;
  hasTransactions: boolean;
}

export interface AccountFinancialUsageCheck {
  hasFinancialUsage: boolean;
}

/**
 * Validates that Book currency can be changed.
 * Currency becomes immutable after Accounts or Transactions exist.
 * A no-op change (same value) is always allowed.
 */
export function validateBookCurrencyChange(
  currentCurrency: string,
  newCurrency: string,
  deps: BookDependencyCheck,
): void {
  // No-op change is always allowed
  if (currentCurrency === newCurrency) {
    return;
  }

  if (deps.hasAccounts || deps.hasTransactions) {
    throw new ImmutabilityError(
      'Book currency cannot be changed after Accounts or Transactions exist',
      'currency',
    );
  }
}

/**
 * Validates that Account book_id cannot be changed after creation.
 * This is always immutable; no exception for no-op since book_id defines ownership.
 */
export function validateAccountBookIdChange(currentBookId: string, newBookId: string): void {
  if (currentBookId !== newBookId) {
    throw new ImmutabilityError('Account book_id is immutable after creation', 'bookId');
  }
}

/**
 * Validates that Account currency/type can be changed only before financial use.
 * A no-op change is always allowed.
 */
export function validateAccountImmutableFields(
  currentCurrency: string,
  newCurrency: string,
  currentType: string,
  newType: string,
  usage: AccountFinancialUsageCheck,
): void {
  const currencyChanged = currentCurrency !== newCurrency;
  const typeChanged = currentType !== newType;

  if (!currencyChanged && !typeChanged) {
    return;
  }

  if (usage.hasFinancialUsage) {
    if (currencyChanged) {
      throw new ImmutabilityError(
        'Account currency cannot be changed after financial use',
        'currency',
      );
    }
    if (typeChanged) {
      throw new ImmutabilityError('Account type cannot be changed after financial use', 'type');
    }
  }
}
