import { describe, it, expect } from 'vitest';
import { FinancialError, FinancialValidationError, FinancialInvariantError } from './errors.js';
import { ValidationError } from '../master-data/errors.js';

describe('FinancialError', () => {
  it('carries stable machine-readable code', () => {
    const err = new FinancialError('test message', 'TEST_CODE');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('FinancialError');
  });

  it('is an instance of Error', () => {
    const err = new FinancialError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('FinancialValidationError', () => {
  it('inherits from ValidationError with VALIDATION_ERROR code', () => {
    const err = new FinancialValidationError('bad input', 'amount');
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.field).toBe('amount');
    expect(err.name).toBe('FinancialValidationError');
  });

  it('preserves cause chain', () => {
    const cause = new Error('root cause');
    const err = new FinancialValidationError('wrapped', 'field', cause);
    expect(err.cause).toBe(cause);
  });

  it('works without optional field', () => {
    const err = new FinancialValidationError('generic validation failure');
    expect(err.field).toBeUndefined();
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('FinancialInvariantError', () => {
  it('carries FINANCIAL_INVARIANT_ERROR code', () => {
    const err = new FinancialInvariantError('invariant violated');
    expect(err.code).toBe('FINANCIAL_INVARIANT_ERROR');
    expect(err.name).toBe('FinancialInvariantError');
  });

  it('is an instance of FinancialError', () => {
    const err = new FinancialInvariantError('msg');
    expect(err).toBeInstanceOf(FinancialError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('Error message safety', () => {
  it('does not leak credentials or infrastructure details', () => {
    const err = new FinancialValidationError('Invalid amount format');
    expect(err.message).not.toContain('password');
    expect(err.message).not.toContain('postgres://');
    expect(err.message).not.toContain('bearer');
    expect(err.message).not.toContain('secret');
  });
});
