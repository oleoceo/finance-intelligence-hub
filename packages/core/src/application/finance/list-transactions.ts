/**
 * ListTransactions use case.
 *
 * Pure read: returns paginated TransactionRecords with optional filters.
 * Validates pagination inputs before delegating to the read port.
 */

import type {
  TransactionReadPort,
  ListTransactionsInput,
  ListTransactionsResult,
} from '../ports/transaction-ports.js';
import { FinancialValidationError } from '../../domain/finance/errors.js';
import {
  validateTransactionDate,
  validateTransactionStatus,
  validateTransactionType,
} from '../../domain/finance/transaction-validation.js';

export interface ListTransactionsDependencies {
  readPort: TransactionReadPort;
}

export async function listTransactions(
  input: ListTransactionsInput,
  deps: ListTransactionsDependencies,
): Promise<ListTransactionsResult> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new FinancialValidationError('List input must be an object');
  }
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;

  // Validate pagination
  if (page < 1 || !Number.isInteger(page)) {
    throw new FinancialValidationError('page must be a positive integer', 'page');
  }
  if (pageSize < 1 || !Number.isInteger(pageSize)) {
    throw new FinancialValidationError('pageSize must be a positive integer', 'pageSize');
  }
  if (pageSize > 100) {
    throw new FinancialValidationError('pageSize maximum is 100', 'pageSize');
  }

  for (const field of ['bookId', 'accountId', 'categoryId', 'merchantId', 'search'] as const) {
    if (input[field] != null && typeof input[field] !== 'string') {
      throw new FinancialValidationError(`${field} must be a string`, field);
    }
  }
  if (input.type != null) validateTransactionType(input.type);
  if (input.status != null) validateTransactionStatus(input.status);
  if (input.dateFrom != null) validateTransactionDate(input.dateFrom);
  if (input.dateTo != null) validateTransactionDate(input.dateTo);

  return deps.readPort.list({ ...input, page, pageSize });
}
