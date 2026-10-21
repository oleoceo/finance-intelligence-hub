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
      'BOOK_INACTIVE' | 'ACCOUNT_INACTIVE' | 'CATEGORY_INACTIVE' | 'MERCHANT_INACTIVE',
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
