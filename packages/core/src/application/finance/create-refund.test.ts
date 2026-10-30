import { describe, expect, it } from 'vitest';
import { fingerprintTransactionRefund, validateRefundInput } from './create-refund.js';

const target = '019a0000-0000-7000-8000-000000000001';
const input = {
  version: 1,
  amount: '300.00',
  accountId: target,
  transactionDate: '2026-10-29',
  description: 'return',
};

describe('M07-P03 Refund command', () => {
  it('validates exact positive Money, calendar date, and reserved fields', () => {
    expect(() => validateRefundInput(input)).not.toThrow();
    for (const amount of ['0', '-1', '1.001', '99999999999999999', '1e2'])
      expect(() => validateRefundInput({ ...input, amount })).toThrow();
    expect(() => validateRefundInput({ ...input, amount: '0.01' })).not.toThrow();
    expect(() => validateRefundInput({ ...input, transactionDate: '2026-02-30' })).toThrow();
    expect(() => validateRefundInput({ ...input, version: 0 })).toThrow();
    expect(() => validateRefundInput({ ...input, bookId: target } as typeof input)).toThrow();
    expect(() => validateRefundInput({ ...input, source: 'whatsapp' } as typeof input)).toThrow();
  });

  it('fingerprints the target, version and all semantic fields', () => {
    const base = fingerprintTransactionRefund(target, input);
    expect(fingerprintTransactionRefund(target, { ...input })).toBe(base);
    expect(fingerprintTransactionRefund(target + 'x', input)).not.toBe(base);
    for (const changed of [
      { version: 2 },
      { amount: '300.01' },
      { accountId: '019a0000-0000-7000-8000-000000000002' },
      { transactionDate: '2026-10-28' },
      { description: 'Return' },
      { notes: 'why' },
    ])
      expect(fingerprintTransactionRefund(target, { ...input, ...changed })).not.toBe(base);
    expect(fingerprintTransactionRefund(target, { ...input, amount: '300' })).toBe(base);
  });
});
