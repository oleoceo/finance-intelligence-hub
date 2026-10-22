/**
 * GetLastTransaction use case.
 *
 * Pure read: returns the most recently created posted Transaction for a Book.
 * Requires bookId; orders by created_at DESC, id DESC; ignores voided.
 */

import type {
  TransactionReadPort,
  TransactionRecord,
  GetLastTransactionInput,
} from '../ports/transaction-ports.js';

export interface GetLastTransactionDependencies {
  readPort: TransactionReadPort;
}

export async function getLastTransaction(
  input: GetLastTransactionInput,
  deps: GetLastTransactionDependencies,
): Promise<TransactionRecord | null> {
  if (!input.bookId) {
    throw new Error('VALIDATION_ERROR: bookId is required');
  }

  return deps.readPort.getLast(input);
}
