import { describe, it, expect } from 'vitest';
import {
  validateTransactionDate,
  validateTransactionDateNotFuture,
  validateMoneyAmount,
  validateTransactionType,
  validateTransactionStatus,
  validateTransactionCreateSource,
  validateHumanRefField,
  validateTransferAccountsDiffer,
} from './transaction-validation.js';
import { FinancialValidationError } from './errors.js';

describe('validateTransactionDate', () => {
  it('accepts valid date', () => {
    expect(validateTransactionDate('2026-02-28')).toBe('2026-02-28');
  });

  it('accepts leap year Feb 29', () => {
    expect(validateTransactionDate('2024-02-29')).toBe('2024-02-29');
  });

  it('rejects non-leap year Feb 29', () => {
    expect(() => validateTransactionDate('2026-02-29')).toThrow('Invalid transaction date day');
  });

  it('rejects impossible day like Feb 30', () => {
    expect(() => validateTransactionDate('2026-02-30')).toThrow('Invalid transaction date day');
  });

  it('rejects invalid month', () => {
    expect(() => validateTransactionDate('2026-13-01')).toThrow('Invalid transaction date month');
  });

  it('rejects month zero', () => {
    expect(() => validateTransactionDate('2026-00-15')).toThrow('Invalid transaction date month');
  });

  it('rejects day zero', () => {
    expect(() => validateTransactionDate('2026-01-00')).toThrow('Invalid transaction date day');
  });

  it('rejects wrong format', () => {
    expect(() => validateTransactionDate('2026/01/15')).toThrow('Must be YYYY-MM-DD');
  });

  it('rejects non-string', () => {
    expect(() => validateTransactionDate(20260115 as unknown as string)).toThrow(
      'must be a string',
    );
  });

  it('accepts year boundary Dec 31', () => {
    expect(validateTransactionDate('2026-12-31')).toBe('2026-12-31');
  });

  it('accepts Jan 01', () => {
    expect(validateTransactionDate('2026-01-01')).toBe('2026-01-01');
  });

  it('rejects April 31', () => {
    expect(() => validateTransactionDate('2026-04-31')).toThrow('Invalid transaction date day');
  });

  it('accepts century leap year 2000-02-29', () => {
    expect(validateTransactionDate('2000-02-29')).toBe('2000-02-29');
  });

  it('rejects non-century leap year 1900-02-29', () => {
    expect(() => validateTransactionDate('1900-02-29')).toThrow('Invalid transaction date day');
  });
});

describe('validateTransactionDateNotFuture', () => {
  it('allows today in book timezone', () => {
    // Use a fixed "now" and UTC timezone for determinism
    const now = new Date('2026-06-15T12:00:00Z');
    expect(() => validateTransactionDateNotFuture('2026-06-15', now, 'UTC')).not.toThrow();
  });

  it('allows past date', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(() => validateTransactionDateNotFuture('2026-06-14', now, 'UTC')).not.toThrow();
  });

  it('rejects future date', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(() => validateTransactionDateNotFuture('2026-06-16', now, 'UTC')).toThrow(
      'is in the future',
    );
  });

  it('respects Book timezone boundary', () => {
    // When it is still June 14 in America/Sao_Paulo but already June 15 in UTC
    const now = new Date('2026-06-15T02:00:00Z'); // 23:00 June 14 in Sao Paulo
    expect(() =>
      validateTransactionDateNotFuture('2026-06-14', now, 'America/Sao_Paulo'),
    ).not.toThrow();
  });

  it('rejects tomorrow in Book timezone even if today in UTC', () => {
    const now = new Date('2026-06-15T23:00:00Z'); // still June 15 in Sao Paulo (20:00)
    expect(() => validateTransactionDateNotFuture('2026-06-16', now, 'America/Sao_Paulo')).toThrow(
      'is in the future',
    );
  });
});

describe('validateMoneyAmount', () => {
  it('returns Money for valid amount', () => {
    const m = validateMoneyAmount('10.50', 'BRL');
    expect(m.amount).toBe('10.50');
  });

  it('throws FinancialValidationError for invalid amount', () => {
    expect(() => validateMoneyAmount('0', 'BRL')).toThrow(FinancialValidationError);
  });

  it('throws FinancialValidationError for non-string', () => {
    expect(() => validateMoneyAmount(10 as unknown as string, 'BRL')).toThrow(
      FinancialValidationError,
    );
  });
});

describe('validateTransactionType', () => {
  it('returns valid type', () => {
    expect(validateTransactionType('expense')).toBe('expense');
  });

  it('throws FinancialValidationError for invalid type', () => {
    expect(() => validateTransactionType('refund')).toThrow(FinancialValidationError);
  });
});

describe('validateTransactionStatus', () => {
  it('returns valid status', () => {
    expect(validateTransactionStatus('posted')).toBe('posted');
  });

  it('throws FinancialValidationError for invalid status', () => {
    expect(() => validateTransactionStatus('pending')).toThrow(FinancialValidationError);
  });
});

describe('validateTransactionCreateSource', () => {
  it('returns valid source', () => {
    expect(validateTransactionCreateSource('direct_api')).toBe('direct_api');
  });

  it('throws FinancialValidationError for invalid source', () => {
    expect(() => validateTransactionCreateSource('whatsapp')).toThrow(FinancialValidationError);
  });
});

describe('validateHumanRefField', () => {
  it('returns valid human_ref', () => {
    expect(validateHumanRefField('ABC123')).toBe('ABC123');
  });

  it('throws FinancialValidationError for lowercase', () => {
    expect(() => validateHumanRefField('abc123')).toThrow(FinancialValidationError);
  });

  it('throws FinancialValidationError for too long', () => {
    expect(() => validateHumanRefField('ABCDEFGHIJKLMNOPQ')).toThrow(FinancialValidationError);
  });
});

describe('validateTransferAccountsDiffer', () => {
  it('passes when accounts differ', () => {
    expect(() => validateTransferAccountsDiffer('uuid-1', 'uuid-2')).not.toThrow();
  });

  it('throws when accounts are the same', () => {
    expect(() => validateTransferAccountsDiffer('uuid-1', 'uuid-1')).toThrow(
      'source and destination accounts must differ',
    );
  });
});
