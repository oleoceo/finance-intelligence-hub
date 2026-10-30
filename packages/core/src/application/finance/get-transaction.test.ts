import { describe, it, expect, vi } from 'vitest';
import { getTransaction } from './get-transaction.js';
import type { TransactionReadPort, TransactionReadRecord } from '../ports/transaction-ports.js';

describe('GetTransaction', () => {
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

  it('returns transaction when found', async () => {
    vi.mocked(mockReadPort.findById).mockResolvedValue(mockTransaction);

    const result = await getTransaction(mockTransaction.id, { readPort: mockReadPort });

    expect(result).toEqual(mockTransaction);
    expect(mockReadPort.findById).toHaveBeenCalledWith(mockTransaction.id);
  });

  it('returns null when transaction not found', async () => {
    vi.mocked(mockReadPort.findById).mockResolvedValue(null);

    const result = await getTransaction('non-existent-id', { readPort: mockReadPort });

    expect(result).toBeNull();
    expect(mockReadPort.findById).toHaveBeenCalledWith('non-existent-id');
  });

  it('returns the derived refund representation', async () => {
    const refund = {
      ...mockTransaction,
      type: 'income' as const,
      refundOfTransactionId: mockTransaction.id,
      isRefund: true,
    };
    vi.mocked(mockReadPort.findById).mockResolvedValue(refund);
    await expect(getTransaction(refund.id, { readPort: mockReadPort })).resolves.toMatchObject({
      isRefund: true,
      refundOfTransactionId: mockTransaction.id,
    });
  });

  it.each([null, 42, {}, ''])('rejects malformed id %s before reading', async (id) => {
    vi.mocked(mockReadPort.findById).mockClear();
    await expect(getTransaction(id as string, { readPort: mockReadPort })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(mockReadPort.findById).not.toHaveBeenCalled();
  });
});
