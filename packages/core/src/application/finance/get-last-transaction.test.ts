import { describe, it, expect, vi } from 'vitest';
import { getLastTransaction } from './get-last-transaction.js';
import type { TransactionReadPort, TransactionReadRecord } from '../ports/transaction-ports.js';

describe('GetLastTransaction', () => {
  const mockReadPort: TransactionReadPort = {
    findById: vi.fn(),
    listRefunds: vi.fn(),
    list: vi.fn(),
    getLast: vi.fn(),
  };

  const mockTransaction: TransactionReadRecord = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    humanRef: 'TXN-0001',
    bookId: 'book-123',
    type: 'expense',
    status: 'posted',
    amount: '100.00',
    currency: 'BRL',
    accountId: 'account-456',
    destinationAccountId: null,
    categoryId: null,
    merchantId: null,
    description: 'Test expense',
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
    isRefund: false,
  };

  it('returns last posted transaction when found', async () => {
    vi.mocked(mockReadPort.getLast).mockResolvedValue(mockTransaction);

    const result = await getLastTransaction({ bookId: 'book-123' }, { readPort: mockReadPort });

    expect(result).toEqual(mockTransaction);
    expect(mockReadPort.getLast).toHaveBeenCalledWith({ bookId: 'book-123' });
  });

  it('returns null when no posted transaction exists', async () => {
    vi.mocked(mockReadPort.getLast).mockResolvedValue(null);

    const result = await getLastTransaction({ bookId: 'empty-book' }, { readPort: mockReadPort });

    expect(result).toBeNull();
  });

  it.each([null, { bookId: 1 }, { bookId: {} }, { bookId: '' }])(
    'rejects invalid input %s before reading',
    async (input) => {
      vi.mocked(mockReadPort.getLast).mockClear();
      await expect(
        getLastTransaction(input as { bookId: string }, { readPort: mockReadPort }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(mockReadPort.getLast).not.toHaveBeenCalled();
    },
  );

  it('preserves the read-model refund flag', async () => {
    vi.mocked(mockReadPort.getLast).mockResolvedValue({
      ...mockTransaction,
      isRefund: true,
      refundOfTransactionId: 'original',
    });
    await expect(
      getLastTransaction({ bookId: mockTransaction.bookId }, { readPort: mockReadPort }),
    ).resolves.toMatchObject({ isRefund: true });
  });
});
