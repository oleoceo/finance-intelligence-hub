import { describe, expect, it } from 'vitest';
import { fingerprintTransactionVoid, validateVoidInput } from './void-transaction.js';

describe('M07-P02 Void command', () => {
  it('requires a positive safe version, a nonblank reason, and only known fields', () => {
    expect(() => validateVoidInput({ version: 1, reason: 'duplicate' })).not.toThrow();
    for (const input of [
      { version: 0, reason: 'duplicate' },
      { version: 1.5, reason: 'duplicate' },
      { version: Number.MAX_SAFE_INTEGER + 1, reason: 'duplicate' },
      { version: 1, reason: '  ' },
      { version: 1, reason: 'duplicate', source: 'whatsapp' },
    ])
      expect(() => validateVoidInput(input)).toThrow();
  });

  it('fingerprints target, expected version and exact reason independently', () => {
    const id = '019a0000-0000-7000-8000-000000000001';
    const base = fingerprintTransactionVoid(id, { version: 1, reason: 'duplicate' });
    expect(fingerprintTransactionVoid(id, { version: 1, reason: 'duplicate' })).toBe(base);
    expect(fingerprintTransactionVoid(id + 'x', { version: 1, reason: 'duplicate' })).not.toBe(
      base,
    );
    expect(fingerprintTransactionVoid(id, { version: 2, reason: 'duplicate' })).not.toBe(base);
    expect(fingerprintTransactionVoid(id, { version: 1, reason: 'Duplicate' })).not.toBe(base);
  });
});
