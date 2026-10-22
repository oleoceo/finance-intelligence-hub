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

export interface ListTransactionsDependencies {
  readPort: TransactionReadPort;
}

export async function listTransactions(
  input: ListTransactionsInput,
  deps: ListTransactionsDependencies,
): Promise<ListTransactionsResult> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;

  // Validate pagination
  if (page < 1 || !Number.isInteger(page)) {
    throw new Error('VALIDATION_ERROR: page must be a positive integer');
  }
  if (pageSize < 1 || !Number.isInteger(pageSize)) {
    throw new Error('VALIDATION_ERROR: pageSize must be a positive integer');
  }
  if (pageSize > 100) {
    throw new Error('VALIDATION_ERROR: pageSize maximum is 100');
  }

  return deps.readPort.list({ ...input, page, pageSize });
}
