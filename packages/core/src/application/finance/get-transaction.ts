/**
 * GetTransaction use case.
 *
 * Pure read: returns a TransactionRecord by UUID or null.
 * No authorization beyond scope enforcement at API layer.
 */

import type { TransactionReadPort, TransactionRecord } from '../ports/transaction-ports.js';

export interface GetTransactionDependencies {
  readPort: TransactionReadPort;
}

export async function getTransaction(
  id: string,
  deps: GetTransactionDependencies,
): Promise<TransactionRecord | null> {
  return deps.readPort.findById(id);
}
