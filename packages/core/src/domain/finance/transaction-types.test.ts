import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_CREATE_SOURCES,
  isValidTransactionType,
  isValidTransactionStatus,
  isValidTransactionCreateSource,
  assertTransactionType,
  assertTransactionStatus,
} from './transaction-types.js';

describe('Transaction types', () => {
  describe('TRANSACTION_TYPES', () => {
    it('contains exactly expense, income, transfer', () => {
      expect(TRANSACTION_TYPES).toEqual(['expense', 'income', 'transfer']);
    });

    it('does not contain refund', () => {
      expect(TRANSACTION_TYPES).not.toContain('refund');
    });

    it('does not contain adjustment', () => {
      expect(TRANSACTION_TYPES).not.toContain('adjustment');
    });
  });

  describe('isValidTransactionType', () => {
    it('accepts expense', () => {
      expect(isValidTransactionType('expense')).toBe(true);
    });

    it('accepts income', () => {
      expect(isValidTransactionType('income')).toBe(true);
    });

    it('accepts transfer', () => {
      expect(isValidTransactionType('transfer')).toBe(true);
    });

    it('rejects refund', () => {
      expect(isValidTransactionType('refund')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidTransactionType('')).toBe(false);
    });

    it('rejects number', () => {
      expect(isValidTransactionType(123)).toBe(false);
    });

    it('rejects null', () => {
      expect(isValidTransactionType(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isValidTransactionType(undefined)).toBe(false);
    });
  });

  describe('assertTransactionType', () => {
    it('returns valid type', () => {
      expect(assertTransactionType('expense')).toBe('expense');
    });

    it('throws on invalid type', () => {
      expect(() => assertTransactionType('refund')).toThrow('Invalid transaction type');
    });
  });
});

describe('Transaction statuses', () => {
  describe('TRANSACTION_STATUSES', () => {
    it('contains exactly posted and voided', () => {
      expect(TRANSACTION_STATUSES).toEqual(['posted', 'voided']);
    });

    it('does not contain pending', () => {
      expect(TRANSACTION_STATUSES).not.toContain('pending');
    });

    it('does not contain active', () => {
      expect(TRANSACTION_STATUSES).not.toContain('active');
    });
  });

  describe('isValidTransactionStatus', () => {
    it('accepts posted', () => {
      expect(isValidTransactionStatus('posted')).toBe(true);
    });

    it('accepts voided', () => {
      expect(isValidTransactionStatus('voided')).toBe(true);
    });

    it('rejects pending', () => {
      expect(isValidTransactionStatus('pending')).toBe(false);
    });

    it('rejects active', () => {
      expect(isValidTransactionStatus('active')).toBe(false);
    });

    it('rejects non-string', () => {
      expect(isValidTransactionStatus(42)).toBe(false);
    });
  });

  describe('assertTransactionStatus', () => {
    it('returns valid status', () => {
      expect(assertTransactionStatus('posted')).toBe('posted');
    });

    it('throws on invalid status', () => {
      expect(() => assertTransactionStatus('pending')).toThrow('Invalid transaction status');
    });
  });
});

describe('Transaction create sources', () => {
  describe('TRANSACTION_CREATE_SOURCES', () => {
    it('contains the server-controlled direct and Inbox sources', () => {
      expect(TRANSACTION_CREATE_SOURCES).toEqual(['direct_api', 'whatsapp']);
    });
  });

  describe('isValidTransactionCreateSource', () => {
    it('accepts direct_api', () => {
      expect(isValidTransactionCreateSource('direct_api')).toBe(true);
    });

    it('accepts whatsapp', () => {
      expect(isValidTransactionCreateSource('whatsapp')).toBe(true);
    });

    it('rejects non-string', () => {
      expect(isValidTransactionCreateSource(null)).toBe(false);
    });
  });
});
