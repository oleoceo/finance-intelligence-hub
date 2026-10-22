/**
 * Core financial domain errors for M04.
 *
 * These errors are transport-agnostic. API layer maps them to HTTP responses.
 * Reuses existing master-data error vocabulary where appropriate.
 * Malformed inputs map to VALIDATION_ERROR per frozen API contracts §10.
 */

import { ValidationError } from '../master-data/errors.js';

/**
 * Base class for financial domain errors.
 * Carries a stable machine-readable code for downstream mapping.
 */
export class FinancialError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'BOOK_NOT_FOUND'
      | 'BOOK_INACTIVE'
      | 'ACCOUNT_NOT_FOUND'
      | 'ACCOUNT_INACTIVE'
      | 'CATEGORY_NOT_FOUND'
      | 'CATEGORY_INACTIVE'
      | 'MERCHANT_NOT_FOUND'
      | 'MERCHANT_INACTIVE'
      | 'CURRENCY_MISMATCH'
      | 'VALIDATION_ERROR'
      | 'TRANSACTION_DATE_IN_FUTURE'
      | 'TRANSFER_SAME_ACCOUNT'
      | 'CROSS_BOOK_TRANSFER_NOT_SUPPORTED',
  ) {
    super(message);
    this.name = 'FinancialError';
  }
}

/**
 * Validation failure for financial inputs (amount, date, type, status, etc.).
 * Maps to 422 VALIDATION_ERROR at the API boundary.
 */
export class FinancialValidationError extends ValidationError {
  constructor(message: string, field?: string, cause?: unknown) {
    super(message, field, cause);
    this.name = 'FinancialValidationError';
  }
}
