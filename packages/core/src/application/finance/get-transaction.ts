/**
 * GetTransaction use case.
 *
 * Pure read: returns a TransactionRecord by UUID or null.
 * No authorization beyond scope enforcement at API layer.
 */

import type { TransactionReadPort, TransactionReadRecord } from '../ports/transaction-ports.js';
import { FinancialValidationError } from '../../domain/finance/errors.js';

export interface GetTransactionDependencies {
  readPort: TransactionReadPort;
}

export async function getTransaction(
  id: string,
  deps: GetTransactionDependencies,
): Promise<TransactionReadRecord | null> {
  if (typeof id !== 'string' || id.length === 0) {
    throw new FinancialValidationError('Transaction id must be a non-empty string', 'id');
  }
  return deps.readPort.findById(id);
}
