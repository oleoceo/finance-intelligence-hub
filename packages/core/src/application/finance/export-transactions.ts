import type { TransactionReadRecord } from '../ports/transaction-ports.js';

export const TRANSACTION_CSV_COLUMNS = [
  'id',
  'human_ref',
  'book_id',
  'type',
  'status',
  'is_refund',
  'refund_of_transaction_id',
  'transaction_date',
  'amount',
  'currency',
  'account_id',
  'destination_account_id',
  'category_id',
  'merchant_id',
  'description',
  'notes',
  'source',
  'source_reference',
  'inbox_message_id',
  'version',
  'created_at',
  'updated_at',
  'voided_at',
  'void_reason',
] as const;

// Spreadsheet applications may discard leading whitespace before recognizing a formula.
// Prefixing with an apostrophe keeps the cell inert while leaving the financial amount intact.
export function safeCsvCell(value: string): string {
  const exactNegativeDecimal = /^-(?:0|[1-9]\d*)\.\d{2}$/.test(value);
  const neutralized =
    !exactNegativeDecimal && (/^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r]/u.test(value))
      ? `'${value}`
      : value;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function csvLine(values: readonly (string | number | boolean | null)[]): string {
  return values.map((value) => safeCsvCell(value === null ? '' : String(value))).join(',') + '\r\n';
}

export function transactionCsvLine(row: TransactionReadRecord): string {
  return csvLine([
    row.id,
    row.humanRef,
    row.bookId,
    row.type,
    row.status,
    row.isRefund,
    row.refundOfTransactionId,
    row.transactionDate,
    row.amount,
    row.currency,
    row.accountId,
    row.destinationAccountId,
    row.categoryId,
    row.merchantId,
    row.description,
    row.notes,
    row.source,
    row.sourceReference,
    row.inboxMessageId,
    row.version,
    row.createdAt.toISOString(),
    row.updatedAt.toISOString(),
    row.voidedAt?.toISOString() ?? null,
    row.voidReason,
  ]);
}
