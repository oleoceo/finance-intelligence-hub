/**
 * Immutable-field validation helpers for master-data entities.
 *
 * These are pure functions that receive dependency/usage facts
 * and validate whether a field change is permitted.
 */

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
    throw new Error('Book currency cannot be changed after Accounts or Transactions exist');
  }
}

/**
 * Validates that Account book_id cannot be changed after creation.
 * This is always immutable; no exception for no-op since book_id defines ownership.
 */
export function validateAccountBookIdChange(currentBookId: string, newBookId: string): void {
  if (currentBookId !== newBookId) {
    throw new Error('Account book_id is immutable after creation');
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
      throw new Error('Account currency cannot be changed after financial use');
    }
    if (typeChanged) {
      throw new Error('Account type cannot be changed after financial use');
    }
  }
}
