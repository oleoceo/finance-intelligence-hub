import type { TransactionReadPort, TransactionReadRecord } from '../ports/transaction-ports.js';

export async function getTransactionRefunds(
  transactionId: string,
  readPort: TransactionReadPort,
): Promise<TransactionReadRecord[] | null> {
  const target = await readPort.findById(transactionId);
  if (!target || target.type !== 'expense') return null;
  return readPort.listRefunds(transactionId);
}
