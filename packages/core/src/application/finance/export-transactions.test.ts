import { describe, expect, it } from 'vitest';
import {
  csvLine,
  safeCsvCell,
  transactionCsvLine,
  TRANSACTION_CSV_COLUMNS,
} from './export-transactions.js';
import type { TransactionReadRecord } from '../ports/transaction-ports.js';

describe('M08-P04 CSV encoding', () => {
  it.each(['=SUM(1,1)', '+cmd', '-2+3', '@cmd', '\t=1', '\r=1', '  =1', '\n\t@x', '\uFEFF+1'])(
    'neutralizes a dangerous spreadsheet cell %j',
    (value) => {
      expect(safeCsvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );
  it('quotes commas, double quotes, CRLF, Unicode and preserves decimal amount text', () => {
    expect(csvLine(['ação, "nova"\r\nlinha', '100.00'])).toBe(
      '"ação, ""nova""\r\nlinha","100.00"\r\n',
    );
    expect(csvLine(TRANSACTION_CSV_COLUMNS).split(',')).toHaveLength(24);
    expect(safeCsvCell('-197.30')).toBe('"-197.30"');
    expect(safeCsvCell('-197.30+1')).toBe('"\'-197.30+1"');
  });
  it('emits persisted refund identity, status and exact amounts', () => {
    const at = new Date('2024-02-29T00:00:00.000Z');
    const row: TransactionReadRecord = {
      id: 'one',
      humanRef: 'H1',
      bookId: 'book',
      type: 'income',
      status: 'voided',
      amount: '200.00',
      currency: 'BRL',
      accountId: 'account',
      destinationAccountId: null,
      categoryId: null,
      merchantId: null,
      description: '=bad',
      notes: 'á,\r\n"b"',
      transactionDate: '2024-02-29',
      source: 'direct_api',
      sourceReference: null,
      inboxMessageId: null,
      refundOfTransactionId: 'original',
      version: 1,
      createdAt: at,
      updatedAt: at,
      voidedAt: at,
      voidReason: null,
      isRefund: true,
    };
    const encoded = transactionCsvLine(row);
    expect(encoded).toContain('"voided","true","original","2024-02-29","200.00"');
    expect(encoded).toContain('"\'=bad"');
    expect(encoded).toContain('"á,\r\n""b"""');
    expect(encoded.endsWith('\r\n')).toBe(true);
  });
});
