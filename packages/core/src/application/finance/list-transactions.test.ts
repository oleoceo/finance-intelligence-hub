import { describe, it, expect, vi } from 'vitest';
import { listTransactions } from './list-transactions.js';
import type { TransactionReadPort, ListTransactionsInput } from '../ports/transaction-ports.js';

describe('ListTransactions', () => {
  const mockReadPort: TransactionReadPort = {
    findById: vi.fn(),
    list: vi.fn(),
    getLast: vi.fn(),
  };

  it('delegates to read port with default pagination', async () => {
    const input: ListTransactionsInput = {};
    vi.mocked(mockReadPort.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await listTransactions(input, { readPort: mockReadPort });

    expect(mockReadPort.list).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it('validates page < 1', async () => {
    const input: ListTransactionsInput = { page: 0 };

    await expect(listTransactions(input, { readPort: mockReadPort })).rejects.toThrow(
      'VALIDATION_ERROR: page must be a positive integer',
    );
  });

  it('validates non-integer page', async () => {
    const input: ListTransactionsInput = { page: 1.5 };

    await expect(listTransactions(input, { readPort: mockReadPort })).rejects.toThrow(
      'VALIDATION_ERROR: page must be a positive integer',
    );
  });

  it('validates pageSize < 1', async () => {
    const input: ListTransactionsInput = { pageSize: 0 };

    await expect(listTransactions(input, { readPort: mockReadPort })).rejects.toThrow(
      'VALIDATION_ERROR: pageSize must be a positive integer',
    );
  });

  it('validates pageSize > 100', async () => {
    const input: ListTransactionsInput = { pageSize: 101 };

    await expect(listTransactions(input, { readPort: mockReadPort })).rejects.toThrow(
      'VALIDATION_ERROR: pageSize maximum is 100',
    );
  });

  it('validates non-integer pageSize', async () => {
    const input: ListTransactionsInput = { pageSize: 1.5 };

    await expect(listTransactions(input, { readPort: mockReadPort })).rejects.toThrow(
      'VALIDATION_ERROR: pageSize must be a positive integer',
    );
  });

  it('passes filters to read port', async () => {
    const input: ListTransactionsInput = {
      bookId: 'book-123',
      type: 'expense',
      status: 'posted',
      accountId: 'account-456',
      categoryId: 'cat-789',
      merchantId: 'merch-000',
      dateFrom: '2026-01-01',
      dateTo: '2026-10-22',
      search: 'test',
      page: 2,
      pageSize: 25,
    };
    vi.mocked(mockReadPort.list).mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 25 });

    await listTransactions(input, { readPort: mockReadPort });

    expect(mockReadPort.list).toHaveBeenCalledWith(input);
  });
});
