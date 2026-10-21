import { describe, it, expect } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  describe('canonicalization', () => {
    it('canonicalizes integer to two decimal places', () => {
      const m = Money.create('35', 'BRL');
      expect(m.amount).toBe('35.00');
    });

    it('canonicalizes one decimal digit to two', () => {
      const m = Money.create('35.5', 'BRL');
      expect(m.amount).toBe('35.50');
    });

    it('preserves two decimal digits as-is', () => {
      const m = Money.create('35.50', 'BRL');
      expect(m.amount).toBe('35.50');
    });

    it('preserves non-zero cents', () => {
      const m = Money.create('99.99', 'USD');
      expect(m.amount).toBe('99.99');
    });

    it('uppercases currency code', () => {
      const m = Money.create('10.00', 'brl');
      expect(m.currency).toBe('BRL');
    });
  });

  describe('accepted forms', () => {
    it('accepts single digit', () => {
      expect(Money.create('1', 'BRL').amount).toBe('1.00');
    });

    it('accepts max integral part without decimals', () => {
      const m = Money.create('9999999999999999', 'BRL');
      expect(m.amount).toBe('9999999999999999.00');
    });

    it('accepts max boundary value', () => {
      const m = Money.create('9999999999999999.99', 'BRL');
      expect(m.amount).toBe('9999999999999999.99');
    });

    it('accepts smallest positive value', () => {
      const m = Money.create('0.01', 'BRL');
      expect(m.amount).toBe('0.01');
    });

    it('accepts zero integral with fractional', () => {
      const m = Money.create('0.50', 'BRL');
      expect(m.amount).toBe('0.50');
    });
  });

  describe('zero rejection', () => {
    it('rejects "0"', () => {
      expect(() => Money.create('0', 'BRL')).toThrow('strictly greater than zero');
    });

    it('rejects "0.00"', () => {
      expect(() => Money.create('0.00', 'BRL')).toThrow('strictly greater than zero');
    });

    it('rejects "0.0"', () => {
      expect(() => Money.create('0.0', 'BRL')).toThrow('strictly greater than zero');
    });
  });

  describe('negative and sign rejection', () => {
    it('rejects negative amount', () => {
      expect(() => Money.create('-10.00', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects explicit positive sign', () => {
      expect(() => Money.create('+10.00', 'BRL')).toThrow('Invalid money amount format');
    });
  });

  describe('leading-zero rejection', () => {
    it('rejects leading-zero format like 035.00', () => {
      expect(() => Money.create('035.00', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects leading-zero format like 00.50', () => {
      expect(() => Money.create('00.50', 'BRL')).toThrow('Invalid money amount format');
    });

    it('allows single zero before decimal (0.50)', () => {
      expect(Money.create('0.50', 'BRL').amount).toBe('0.50');
    });
  });

  describe('separator/whitespace/exponent rejection', () => {
    it('rejects whitespace', () => {
      expect(() => Money.create(' 10.00', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects trailing whitespace', () => {
      expect(() => Money.create('10.00 ', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects comma separator', () => {
      expect(() => Money.create('1,000.00', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects exponent notation', () => {
      expect(() => Money.create('1e2', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects NaN', () => {
      expect(() => Money.create('NaN', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects Infinity', () => {
      expect(() => Money.create('Infinity', 'BRL')).toThrow('Invalid money amount format');
    });
  });

  describe('excess decimal places', () => {
    it('rejects three decimal places', () => {
      expect(() => Money.create('35.001', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects three decimal places even if third is zero', () => {
      expect(() => Money.create('35.500', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects four decimal places', () => {
      expect(() => Money.create('1.1234', 'BRL')).toThrow('Invalid money amount format');
    });
  });

  describe('overflow', () => {
    it('rejects integral part exceeding 16 digits', () => {
      expect(() => Money.create('10000000000000000', 'BRL')).toThrow('Invalid money amount format');
    });

    it('rejects amount exceeding NUMERIC(18,2) max', () => {
      expect(() => Money.create('9999999999999999.99' + '1', 'BRL')).toThrow();
    });
  });

  describe('value equality', () => {
    it('two Money instances with same amount and currency are equal', () => {
      const a = Money.create('35.50', 'BRL');
      const b = Money.create('35.5', 'BRL');
      expect(a.equals(b)).toBe(true);
    });

    it('different amounts are not equal', () => {
      const a = Money.create('35.50', 'BRL');
      const b = Money.create('35.51', 'BRL');
      expect(a.equals(b)).toBe(false);
    });

    it('different currencies are not equal', () => {
      const a = Money.create('35.50', 'BRL');
      const b = Money.create('35.50', 'USD');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('no Number-based precision dependence', () => {
    it('handles large values without floating-point loss', () => {
      const m = Money.create('9999999999999999.99', 'BRL');
      expect(m.amount).toBe('9999999999999999.99');
    });

    it('does not use Number for comparison', () => {
      // This value would lose precision as a JS Number
      const m = Money.create('9007199254740993.01', 'BRL');
      expect(m.amount).toBe('9007199254740993.01');
    });
  });

  describe('type errors', () => {
    it('rejects non-string amount', () => {
      expect(() => Money.create(35 as unknown as string, 'BRL')).toThrow('must be a string');
    });

    it('rejects empty currency', () => {
      expect(() => Money.create('10.00', '')).toThrow('non-empty string');
    });
  });

  describe('toString', () => {
    it('formats as CURRENCY AMOUNT', () => {
      const m = Money.create('35.50', 'BRL');
      expect(m.toString()).toBe('BRL 35.50');
    });
  });
});
