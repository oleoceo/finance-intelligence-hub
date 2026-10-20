/**
* Core unit tests for Classification Rule domain validation (M03-T04).
*/
import { describe, it, expect } from 'vitest';
import {
  validateMatchType,
  validateAtLeastOneTarget,
  normalizePattern,
  validatePriority,
} from '../../domain/master-data/classification-rule.js';

describe('Classification Rule Domain Validation', () => {
  describe('validateMatchType', () => {
    it('accepts exact match type', () => {
      expect(() => validateMatchType('exact')).not.toThrow();
    });

    it('accepts contains match type', () => {
      expect(() => validateMatchType('contains')).not.toThrow();
    });

    it('rejects invalid match type', () => {
      expect(() => validateMatchType('regex')).toThrow('Match type must be one of');
    });

    it('rejects empty match type', () => {
      expect(() => validateMatchType('')).toThrow('Match type must be one of');
    });
  });

  describe('validateAtLeastOneTarget', () => {
    it('accepts rule with targetBookId', () => {
      expect(() =>
        validateAtLeastOneTarget({ priority: 10, matchType: 'exact', pattern: 'test', targetBookId: 'uuid' }),
      ).not.toThrow();
    });

    it('accepts rule with targetAccountId', () => {
      expect(() =>
        validateAtLeastOneTarget({ priority: 10, matchType: 'exact', pattern: 'test', targetAccountId: 'uuid' }),
      ).not.toThrow();
    });

    it('accepts rule with targetCategoryId', () => {
      expect(() =>
        validateAtLeastOneTarget({ priority: 10, matchType: 'exact', pattern: 'test', targetCategoryId: 'uuid' }),
      ).not.toThrow();
    });

    it('accepts rule with targetMerchantId', () => {
      expect(() =>
        validateAtLeastOneTarget({ priority: 10, matchType: 'exact', pattern: 'test', targetMerchantId: 'uuid' }),
      ).not.toThrow();
    });

    it('accepts rule with multiple targets', () => {
      expect(() =>
        validateAtLeastOneTarget({
          priority: 10,
          matchType: 'exact',
          pattern: 'test',
          targetBookId: 'uuid',
          targetAccountId: 'uuid',
        }),
      ).not.toThrow();
    });

    it('rejects rule with no targets', () => {
      expect(() =>
        validateAtLeastOneTarget({ priority: 10, matchType: 'exact', pattern: 'test' }),
      ).toThrow('Classification rule must have at least one target');
    });

    it('rejects rule with all null targets', () => {
      expect(() =>
        validateAtLeastOneTarget({
          priority: 10,
          matchType: 'exact',
          pattern: 'test',
          targetBookId: null,
          targetAccountId: null,
          targetCategoryId: null,
          targetMerchantId: null,
        }),
      ).toThrow('Classification rule must have at least one target');
    });
  });

  describe('normalizePattern', () => {
    it('trims whitespace and lowercases', () => {
      expect(normalizePattern('  Google ADS  ')).toBe('google ads');
    });

    it('handles already normalized pattern', () => {
      expect(normalizePattern('google ads')).toBe('google ads');
    });

    it('handles empty string', () => {
      expect(normalizePattern('')).toBe('');
    });
  });

  describe('validatePriority', () => {
    it('accepts zero priority', () => {
      expect(() => validatePriority(0)).not.toThrow();
    });

    it('accepts positive integer priority', () => {
      expect(() => validatePriority(100)).not.toThrow();
    });

    it('rejects negative priority', () => {
      expect(() => validatePriority(-1)).toThrow('Priority must be a non-negative integer');
    });

    it('rejects fractional priority', () => {
      expect(() => validatePriority(10.5)).toThrow('Priority must be a non-negative integer');
    });

    it('rejects non-integer priority', () => {
      expect(() => validatePriority(NaN)).toThrow('Priority must be a non-negative integer');
    });
  });
});