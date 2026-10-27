/**
 * Frozen V0.1 transaction type, status and creation source primitives.
 *
 * These are the only valid values for M04. Future milestones may extend
 * through ADR, but T01 must not anticipate them.
 */

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['posted', 'voided'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Server-controlled creation source. The direct route cannot choose WhatsApp provenance. */
export const TRANSACTION_CREATE_SOURCES = ['direct_api', 'whatsapp'] as const;
export type TransactionCreateSource = (typeof TRANSACTION_CREATE_SOURCES)[number];

export function isValidTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && TRANSACTION_TYPES.includes(value as TransactionType);
}

export function isValidTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === 'string' && TRANSACTION_STATUSES.includes(value as TransactionStatus);
}

export function isValidTransactionCreateSource(value: unknown): value is TransactionCreateSource {
  return (
    typeof value === 'string' &&
    TRANSACTION_CREATE_SOURCES.includes(value as TransactionCreateSource)
  );
}

/**
 * Assert that a value is a valid TransactionType, throwing a descriptive error otherwise.
 */
export function assertTransactionType(value: unknown): TransactionType {
  if (!isValidTransactionType(value)) {
    throw new Error(
      `Invalid transaction type: "${String(value)}". Must be one of: ${TRANSACTION_TYPES.join(', ')}`,
    );
  }
  return value;
}

/**
 * Assert that a value is a valid TransactionStatus.
 */
export function assertTransactionStatus(value: unknown): TransactionStatus {
  if (!isValidTransactionStatus(value)) {
    throw new Error(
      `Invalid transaction status: "${String(value)}". Must be one of: ${TRANSACTION_STATUSES.join(', ')}`,
    );
  }
  return value;
}
