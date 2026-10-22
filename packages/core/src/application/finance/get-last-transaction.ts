/**
 * GetLastTransaction use case.
 *
 * Pure read: returns the most recently created posted Transaction for a Book.
 * Requires bookId; orders by created_at DESC, id DESC; ignores voided.
 */

import type {
  TransactionReadPort,
  TransactionReadRecord,
  GetLastTransactionInput,
} from '../ports/transaction-ports.js';
import { FinancialValidationError } from '../../domain/finance/errors.js';

export interface GetLastTransactionDependencies {
  readPort: TransactionReadPort;
}

export async function getLastTransaction(
  input: GetLastTransactionInput,
  deps: GetLastTransactionDependencies,
): Promise<TransactionReadRecord | null> {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.bookId !== 'string' ||
    input.bookId.length === 0
  ) {
    throw new FinancialValidationError('bookId must be a non-empty string', 'bookId');
  }

  return deps.readPort.getLast(input);
}
