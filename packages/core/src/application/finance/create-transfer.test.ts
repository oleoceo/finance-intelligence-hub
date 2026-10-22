/**
 * Unit tests for CreateTransfer use case (M04-T04).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransfer, type CreateTransferDependencies } from './create-transfer.js';
import type { FinancialTransactionContext } from '../ports/financial-transaction-port.js';
import type { CreateTransferInput } from '../ports/transaction-ports.js';
import { DeterministicHumanRefGenerator } from '../../domain/finance/human-ref.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';

function buildDeps(overrides?: Partial<CreateTransferDependencies>): CreateTransferDependencies {
  return {
    humanRefGenerator: new DeterministicHumanRefGenerator('TEST'),
    now: new Date('2026-10-22T12:00:00Z'),
    generateId: () => 'test-id-v7',
    ...overrides,
  };
}

function buildValidInput(overrides?: Partial<CreateTransferInput>): CreateTransferInput {
  return {
    type: 'transfer',
    bookId: 'book-1',
    amount: '100.00',
    accountId: 'account-source',
    destinationAccountId: 'account-dest',
    description: 'Test transfer',
    transactionDate: '2026-10-22',
    ...overrides,
  };
}

function buildMockCtx(
  overrides?: Partial<FinancialTransactionContext>,
): FinancialTransactionContext {
  const books = {
    findById: vi.fn().mockResolvedValue({
      id: 'book-1',
      name: 'Test Book',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
    }),
  };
  const accounts = {
    findById: vi.fn().mockImplementation((id: string) => {
      if (id === 'account-source') {
        return Promise.resolve({
          id: 'account-source',
          bookId: 'book-1',
          currency: 'BRL',
          active: true,
          name: 'Source Account',
        });
      }
      if (id === 'account-dest') {
        return Promise.resolve({
          id: 'account-dest',
          bookId: 'book-1',
          currency: 'BRL',
          active: true,
          name: 'Dest Account',
        });
      }
      return Promise.resolve(null);
    }),
  };
  const transactions = {
    create: vi.fn().mockResolvedValue({
      id: 'test-id-v7',
      humanRef: 'TEST-000001',
      bookId: 'book-1',
      type: 'transfer',
      status: 'posted',
      amount: '100.00',
      currency: 'BRL',
      accountId: 'account-source',
      destinationAccountId: 'account-dest',
      categoryId: null,
      merchantId: null,
      description: 'Test transfer',
      notes: null,
      transactionDate: '2026-10-22',
      source: 'direct_api',
      sourceReference: null,
      inboxMessageId: null,
      refundOfTransactionId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      voidedAt: null,
      voidReason: null,
    }),
  };
  const locks = {
    acquireLocks: vi.fn().mockResolvedValue(undefined),
  };

  return {
    books,
    accounts,
    categories: { findById: vi.fn() },
    merchants: { findById: vi.fn() },
    transactions,
    locks,
    ...overrides,
  } as unknown as FinancialTransactionContext;
}

describe('CreateTransfer', () => {
  let ctx: FinancialTransactionContext;
  let deps: CreateTransferDependencies;

  beforeEach(() => {
    ctx = buildMockCtx();
    deps = buildDeps();
    vi.clearAllMocks();
  });

  it('creates a successful transfer', async () => {
    const input = buildValidInput();
    const result = await createTransfer(input, ctx, deps);
    expect(result.type).toBe('transfer');
    expect(result.amount).toBe('100.00');
    expect(result.accountId).toBe('account-source');
    expect(result.destinationAccountId).toBe('account-dest');
    expect(result.categoryId).toBeNull();
    expect(result.merchantId).toBeNull();
    expect(result.refundOfTransactionId).toBeNull();
  });

  it('rejects same source and destination account', async () => {
    const input = buildValidInput({ destinationAccountId: 'account-source' });
    await expect(createTransfer(input, ctx, deps)).rejects.toThrow(FinancialError);
    await expect(createTransfer(input, ctx, deps)).rejects.toMatchObject({
      code: 'TRANSFER_SAME_ACCOUNT',
    });
  });

  it('rejects cross-book transfers', async () => {
    const mockCtx = buildMockCtx({
      accounts: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === 'account-source') {
            return Promise.resolve({
              id: 'account-source',
              bookId: 'book-1',
              currency: 'BRL',
              active: true,
              name: 'Source',
            });
          }
          // Destination account belongs to book-2, triggering cross-book check after individual validations
          return Promise.resolve({
            id: 'account-dest',
            bookId: 'book-2',
            currency: 'BRL',
            active: true,
            name: 'Dest',
          });
        }),
      },
    });
    const input = buildValidInput();
    await expect(createTransfer(input, mockCtx, deps)).rejects.toThrow(FinancialError);
    // The implementation checks individual account-book membership first, resulting in VALIDATION_ERROR
    // before reaching the explicit CROSS_BOOK_TRANSFER_NOT_SUPPORTED check.
    await expect(createTransfer(input, mockCtx, deps)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects currency mismatch on source account', async () => {
    const mockCtx = buildMockCtx({
      accounts: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === 'account-source') {
            return Promise.resolve({
              id: 'account-source',
              bookId: 'book-1',
              currency: 'USD',
              active: true,
              name: 'Source',
            });
          }
          return Promise.resolve({
            id: 'account-dest',
            bookId: 'book-1',
            currency: 'BRL',
            active: true,
            name: 'Dest',
          });
        }),
      },
    });
    const input = buildValidInput();
    await expect(createTransfer(input, mockCtx, deps)).rejects.toThrow(FinancialError);
    await expect(createTransfer(input, mockCtx, deps)).rejects.toMatchObject({
      code: 'CURRENCY_MISMATCH',
    });
  });

  it('rejects inactive source account', async () => {
    const mockCtx = buildMockCtx({
      accounts: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === 'account-source') {
            return Promise.resolve({
              id: 'account-source',
              bookId: 'book-1',
              currency: 'BRL',
              active: false,
              name: 'Source',
            });
          }
          return Promise.resolve({
            id: 'account-dest',
            bookId: 'book-1',
            currency: 'BRL',
            active: true,
            name: 'Dest',
          });
        }),
      },
    });
    const input = buildValidInput();
    await expect(createTransfer(input, mockCtx, deps)).rejects.toThrow(FinancialError);
    await expect(createTransfer(input, mockCtx, deps)).rejects.toMatchObject({
      code: 'ACCOUNT_INACTIVE',
    });
  });

  it('rejects future transaction date', async () => {
    const input = buildValidInput({ transactionDate: '2027-10-22' });
    await expect(createTransfer(input, ctx, deps)).rejects.toThrow(FinancialError);
    await expect(createTransfer(input, ctx, deps)).rejects.toMatchObject({
      code: 'TRANSACTION_DATE_IN_FUTURE',
    });
  });

  it('rejects prohibited categoryId field', async () => {
    const input = { ...buildValidInput(), categoryId: 'cat-1' } as unknown as CreateTransferInput;
    await expect(createTransfer(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
  });

  it('rejects prohibited merchantId field', async () => {
    const input = { ...buildValidInput(), merchantId: 'merch-1' } as unknown as CreateTransferInput;
    await expect(createTransfer(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
  });

  it('rejects prohibited refundOfTransactionId field', async () => {
    const input = {
      ...buildValidInput(),
      refundOfTransactionId: 'ref-1',
    } as unknown as CreateTransferInput;
    await expect(createTransfer(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
  });

  it('locks accounts in sorted UUID order', async () => {
    const input = buildValidInput({ accountId: 'z-account', destinationAccountId: 'a-account' });
    const mockCtx = buildMockCtx({
      accounts: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === 'z-account' || id === 'a-account') {
            return Promise.resolve({
              id,
              bookId: 'book-1',
              currency: 'BRL',
              active: true,
              name: 'Account',
            });
          }
          return Promise.resolve(null);
        }),
      },
    });
    await createTransfer(input, mockCtx, deps);
    expect(mockCtx.locks.acquireLocks).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: ['a-account', 'z-account'],
      }),
    );
  });
});
