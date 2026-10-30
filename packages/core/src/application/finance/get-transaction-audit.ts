import type { TransactionReadPort } from '../ports/transaction-ports.js';
import type { AuditReadPort, AuditReadRecord } from '../ports/audit-ports.js';

export async function getTransactionAudit(
  transactionId: string,
  transactions: TransactionReadPort,
  audit: AuditReadPort,
): Promise<AuditReadRecord[] | null> {
  if (!(await transactions.findById(transactionId))) return null;
  return audit.listByTransactionId(transactionId);
}
