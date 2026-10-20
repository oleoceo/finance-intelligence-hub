import { describe, it, expect } from 'vitest';
import { normalizeName, validateNonBlankName } from './normalization.js';

describe('normalizeName', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeName(' hello ')).toBe('hello');
  });

  it('lowercases deterministically', () => {
    expect(normalizeName('Hello World')).toBe('hello world');
  });

  it('collapses consecutive whitespace into one space', () => {
    expect(normalizeName('Google   Ads')).toBe('google ads');
  });

  it('is idempotent', () => {
    const input = ' Google   Ads ';
    const first = normalizeName(input);
    const second = normalizeName(first);
    expect(second).toBe(first);
  });

  it('handles the canonical example', () => {
    expect(normalizeName('  Google   Ads  ')).toBe('google ads');
  });

  it('preserves raw name separately (returns normalized only)', () => {
    const raw = '  Google   Ads  ';
    const normalized = normalizeName(raw);
    expect(normalized).toBe('google ads');
    expect(raw).toBe('  Google   Ads  '); // raw unchanged
  });

  it('handles empty string after trim', () => {
    expect(normalizeName('   ')).toBe('');
  });

  it('handles single word', () => {
    expect(normalizeName(' Amazon ')).toBe('amazon');
  });

  it('handles mixed case with multiple spaces', () => {
    expect(normalizeName('  SHELL   GAS   STATION  ')).toBe('shell gas station');
  });

  it('throws on null', () => {
    expect(() => normalizeName(null as unknown as string)).toThrow(
      'Name cannot be null or undefined',
    );
  });

  it('throws on undefined', () => {
    expect(() => normalizeName(undefined as unknown as string)).toThrow(
      'Name cannot be null or undefined',
    );
  });

  it('throws on non-string', () => {
    expect(() => normalizeName(123 as unknown as string)).toThrow('Name must be a string');
  });
});

describe('validateNonBlankName', () => {
  it('returns trimmed value for valid name', () => {
    expect(validateNonBlankName(' hello ')).toBe('hello');
  });

  it('throws on blank string', () => {
    expect(() => validateNonBlankName('   ')).toThrow('Name cannot be blank');
  });

  it('throws on empty string', () => {
    expect(() => validateNonBlankName('')).toThrow('Name cannot be blank');
  });
});
