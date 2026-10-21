import { describe, it, expect } from 'vitest';
import { FinancialError, FinancialValidationError } from './errors.js';
import { ValidationError } from '../master-data/errors.js';

describe('FinancialError', () => {
  it('carries stable machine-readable code', () => {
    const err = new FinancialError('Book is inactive', 'BOOK_INACTIVE');
    expect(err.code).toBe('BOOK_INACTIVE');
    expect(err.message).toBe('Book is inactive');
    expect(err.name).toBe('FinancialError');
  });

  it('is an instance of Error', () => {
    const err = new FinancialError('msg', 'ACCOUNT_INACTIVE');
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

describe('Error message safety', () => {
  it('does not leak credentials or infrastructure details', () => {
    const err = new FinancialValidationError('Invalid amount format');
    expect(err.message).not.toContain('password');
    expect(err.message).not.toContain('postgres://');
    expect(err.message).not.toContain('bearer');
    expect(err.message).not.toContain('secret');
  });
});
