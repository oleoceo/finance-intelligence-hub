import { describe, it, expect } from 'vitest';
import {
  validateBookCurrencyChange,
  validateAccountBookIdChange,
  validateAccountImmutableFields,
} from './immutability.js';
import type { BookDependencyCheck, AccountFinancialUsageCheck } from './immutability.js';

describe('validateBookCurrencyChange', () => {
  it('allows no-op change regardless of dependencies', () => {
    const deps: BookDependencyCheck = { hasAccounts: true, hasTransactions: true };
    expect(() => validateBookCurrencyChange('BRL', 'BRL', deps)).not.toThrow();
  });

  it('allows change when no Accounts or Transactions exist', () => {
    const deps: BookDependencyCheck = { hasAccounts: false, hasTransactions: false };
    expect(() => validateBookCurrencyChange('BRL', 'USD', deps)).not.toThrow();
  });

  it('rejects change when Accounts exist', () => {
    const deps: BookDependencyCheck = { hasAccounts: true, hasTransactions: false };
    expect(() => validateBookCurrencyChange('BRL', 'USD', deps)).toThrow(
      'Book currency cannot be changed after Accounts or Transactions exist',
    );
  });

  it('rejects change when Transactions exist', () => {
    const deps: BookDependencyCheck = { hasAccounts: false, hasTransactions: true };
    expect(() => validateBookCurrencyChange('BRL', 'USD', deps)).toThrow(
      'Book currency cannot be changed after Accounts or Transactions exist',
    );
  });
});

describe('validateAccountBookIdChange', () => {
  it('allows no-op change', () => {
    expect(() => validateAccountBookIdChange('book-1', 'book-1')).not.toThrow();
  });

  it('rejects any actual change', () => {
    expect(() => validateAccountBookIdChange('book-1', 'book-2')).toThrow(
      'Account book_id is immutable after creation',
    );
  });
});

describe('validateAccountImmutableFields', () => {
  it('allows no-op changes regardless of usage', () => {
    const usage: AccountFinancialUsageCheck = { hasFinancialUsage: true };
    expect(() =>
      validateAccountImmutableFields('BRL', 'BRL', 'checking', 'checking', usage),
    ).not.toThrow();
  });

  it('allows changes before financial usage', () => {
    const usage: AccountFinancialUsageCheck = { hasFinancialUsage: false };
    expect(() =>
      validateAccountImmutableFields('BRL', 'USD', 'checking', 'savings', usage),
    ).not.toThrow();
  });

  it('rejects currency change after financial usage', () => {
    const usage: AccountFinancialUsageCheck = { hasFinancialUsage: true };
    expect(() =>
      validateAccountImmutableFields('BRL', 'USD', 'checking', 'checking', usage),
    ).toThrow('Account currency cannot be changed after financial use');
  });

  it('rejects type change after financial usage', () => {
    const usage: AccountFinancialUsageCheck = { hasFinancialUsage: true };
    expect(() =>
      validateAccountImmutableFields('BRL', 'BRL', 'checking', 'savings', usage),
    ).toThrow('Account type cannot be changed after financial use');
  });
});
