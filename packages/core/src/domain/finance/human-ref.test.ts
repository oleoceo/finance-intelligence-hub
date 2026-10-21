import { describe, it, expect } from 'vitest';
import { isValidHumanRef, assertHumanRef, DeterministicHumanRefGenerator } from './human-ref.js';

describe('isValidHumanRef', () => {
  it('accepts uppercase alphanumeric within length', () => {
    expect(isValidHumanRef('ABC123')).toBe(true);
  });

  it('accepts single character', () => {
    expect(isValidHumanRef('A')).toBe(true);
  });

  it('accepts exactly 16 characters', () => {
    expect(isValidHumanRef('ABCDEFGHIJKLMNOP')).toBe(true);
  });

  it('rejects lowercase letters', () => {
    expect(isValidHumanRef('abc123')).toBe(false);
  });

  it('rejects mixed case', () => {
    expect(isValidHumanRef('AbC123')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidHumanRef('ABC-123')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidHumanRef('ABC 123')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidHumanRef('')).toBe(false);
  });

  it('rejects 17 characters', () => {
    expect(isValidHumanRef('ABCDEFGHIJKLMNOPQ')).toBe(false);
  });

  it('rejects non-string', () => {
    expect(isValidHumanRef(123)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidHumanRef(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidHumanRef(undefined)).toBe(false);
  });
});

describe('assertHumanRef', () => {
  it('returns valid human_ref', () => {
    expect(assertHumanRef('REF001')).toBe('REF001');
  });

  it('throws on invalid human_ref', () => {
    expect(() => assertHumanRef('ref001')).toThrow('Invalid human_ref');
  });

  it('throws on too-long human_ref', () => {
    expect(() => assertHumanRef('ABCDEFGHIJKLMNOPQ')).toThrow('Invalid human_ref');
  });
});

describe('DeterministicHumanRefGenerator', () => {
  it('generates sequential references with default prefix', () => {
    const gen = new DeterministicHumanRefGenerator();
    expect(gen.generate()).toBe('REF0000000000001');
    expect(gen.generate()).toBe('REF0000000000002');
    expect(gen.generate()).toBe('REF0000000000003');
  });

  it('generates references within 16-character limit', () => {
    const gen = new DeterministicHumanRefGenerator();
    for (let i = 0; i < 100; i++) {
      const ref = gen.generate();
      expect(ref.length).toBeLessThanOrEqual(16);
      expect(isValidHumanRef(ref)).toBe(true);
    }
  });

  it('supports custom prefix', () => {
    const gen = new DeterministicHumanRefGenerator('TX');
    expect(gen.generate()).toBe('TX00000000000001');
    expect(gen.generate()).toBe('TX00000000000002');
  });

  it.each(['lower', 'A-B', 'ABCDEFGHIJKLMNOP', ''])('rejects invalid prefix %s', (prefix) => {
    expect(() => new DeterministicHumanRefGenerator(prefix)).toThrow();
  });

  it('reset restarts counter', () => {
    const gen = new DeterministicHumanRefGenerator();
    gen.generate();
    gen.generate();
    gen.reset();
    expect(gen.generate()).toBe('REF0000000000001');
  });

  it('produces unique values across calls', () => {
    const gen = new DeterministicHumanRefGenerator();
    const refs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      refs.add(gen.generate());
    }
    expect(refs.size).toBe(50);
  });

  it('all generated values pass isValidHumanRef', () => {
    const gen = new DeterministicHumanRefGenerator();
    for (let i = 0; i < 20; i++) {
      expect(isValidHumanRef(gen.generate())).toBe(true);
    }
  });
});
