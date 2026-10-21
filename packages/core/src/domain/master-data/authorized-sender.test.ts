/**
 * Core unit tests for Authorized Sender domain validation (M03-T04).
 */
import { describe, it, expect } from 'vitest';
import {
  validateChannel,
  validateSenderReference,
  validateDefaultConsistency,
} from '../../domain/master-data/authorized-sender.js';

describe('Authorized Sender Domain Validation', () => {
  describe('validateChannel', () => {
    it('accepts valid channel', () => {
      expect(() => validateChannel('whatsapp')).not.toThrow();
    });

    it('accepts valid unchanged channel with surrounding whitespace within 32 raw characters', () => {
      // '  whatsapp  ' is 12 raw chars; trim is non-empty; raw length <= 32 → must accept, stored unchanged
      expect(() => validateChannel('  whatsapp  ')).not.toThrow();
    });

    it('rejects raw channel >32 even when trimmed length would be <=32', () => {
      // raw = 17 spaces + 'x' + 17 spaces = 35 raw chars; trimmed is 'x' (1 char) but raw exceeds 32
      const raw = `${' '.repeat(17)}x${' '.repeat(17)}`;
      expect(raw.length).toBe(35);
      expect(() => validateChannel(raw)).toThrow('Channel must not exceed 32 characters');
    });

    it('rejects whitespace-only channel', () => {
      expect(() => validateChannel('   ')).toThrow('Channel must be a non-empty string');
    });

    it('accepts normal 32-char channel', () => {
      expect(() => validateChannel('a'.repeat(32))).not.toThrow();
    });

    it('rejects empty channel', () => {
      expect(() => validateChannel('')).toThrow('Channel must be a non-empty string');
    });

    it('rejects channel exceeding 32 characters', () => {
      expect(() => validateChannel('a'.repeat(33))).toThrow(
        'Channel must not exceed 32 characters',
      );
    });
  });

  describe('validateSenderReference', () => {
    it('accepts valid sender reference', () => {
      expect(() => validateSenderReference('5511999999999')).not.toThrow();
    });

    it('accepts sender reference with max length (255 chars)', () => {
      expect(() => validateSenderReference('a'.repeat(255))).not.toThrow();
    });

    it('trims whitespace', () => {
      expect(() => validateSenderReference('  5511999999999  ')).not.toThrow();
    });

    it('rejects empty sender reference', () => {
      expect(() => validateSenderReference('')).toThrow(
        'Sender reference must be a non-empty string',
      );
    });

    it('rejects whitespace-only sender reference', () => {
      expect(() => validateSenderReference('   ')).toThrow(
        'Sender reference must be a non-empty string',
      );
    });

    it('rejects sender reference exceeding 255 characters', () => {
      expect(() => validateSenderReference('a'.repeat(256))).toThrow(
        'Sender reference must not exceed 255 characters',
      );
    });
  });

  describe('validateDefaultConsistency', () => {
    it('accepts both defaults null', () => {
      expect(() =>
        validateDefaultConsistency({ defaultBookId: null, defaultAccountId: null }),
      ).not.toThrow();
    });

    it('accepts defaultBookId only', () => {
      expect(() =>
        validateDefaultConsistency({ defaultBookId: 'uuid', defaultAccountId: null }),
      ).not.toThrow();
    });

    it('accepts both defaults provided', () => {
      expect(() =>
        validateDefaultConsistency({ defaultBookId: 'uuid', defaultAccountId: 'uuid' }),
      ).not.toThrow();
    });

    it('rejects defaultAccountId without defaultBookId', () => {
      expect(() =>
        validateDefaultConsistency({ defaultBookId: null, defaultAccountId: 'uuid' }),
      ).toThrow('default_account_id requires default_book_id');
    });
  });
});
