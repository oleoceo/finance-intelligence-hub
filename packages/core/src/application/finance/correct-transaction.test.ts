import { describe, expect, it, vi } from 'vitest';
import { CorrectTransaction, prepareCorrectionLocks } from './correct-transaction.js';
import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
import type { FinancialTransactionContext } from '../ports/financial-transaction-port.js';
import type { TransactionRecord } from '../ports/transaction-ports.js';

describe('M07-P01 correction input policy', () => {
  const runInTransaction = vi.fn(async () => {
    throw new Error('Unexpected database access');
  });
  const useCase = new CorrectTransaction(
    { runInTransaction },
    () => new Date('2026-10-29T12:00:00Z'),
  );

  it.each([
    { amount: '0' },
    { amount: '-1' },
    { amount: '1.001' },
    { amount: '10000000000000000' },
    { amount: null },
    { accountId: null },
    { description: null },
    { transactionDate: null },
    { transactionDate: '2026-02-30' },
    { categoryId: 1 },
    { merchantId: false },
    { notes: 3 },
    { version: 0, amount: '1' },
    { version: 1.2, amount: '1' },
    { version: Number.MAX_SAFE_INTEGER + 1, amount: '1' },
    { status: 'voided' },
    { bookId: 'book' },
    { currency: 'USD' },
    { type: 'income' },
    { id: 'target' },
    { source: 'whatsapp' },
    { refundOfTransactionId: 'target' },
    { destinationAccountId: 'target' },
    { createdAt: '2026-10-29' },
  ])('rejects invalid or immutable patch %j before persistence', async (patch) => {
    await expect(
      useCase.execute('target', { version: 1, ...patch } as never, 'correlation'),
    ).rejects.toThrow();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects an empty patch and a missing version', async () => {
    await expect(useCase.execute('target', { version: 1 }, 'correlation')).rejects.toThrow();
    await expect(
      useCase.execute('target', { notes: null } as never, 'correlation'),
    ).rejects.toThrow();
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['amount', '11.25'],
    ['accountId', '00000000-0000-4000-8000-000000000002'],
    ['categoryId', null],
    ['merchantId', null],
    ['description', 'changed'],
    ['notes', null],
    ['transactionDate', '2026-10-29'],
  ] as const)('preserves omitted values when correcting %s', async (field, value) => {
    const now = new Date('2026-10-29T12:00:00Z');
    const record: TransactionRecord = {
      id: '00000000-0000-4000-8000-000000000010',
      humanRef: 'P01',
      bookId: '00000000-0000-4000-8000-000000000001',
      type: 'expense',
      status: 'posted',
      amount: '10.00',
      currency: 'BRL',
      accountId: '00000000-0000-4000-8000-000000000002',
      destinationAccountId: null,
      categoryId: null,
      merchantId: null,
      description: 'original',
      notes: 'memo',
      transactionDate: '2026-10-28',
      source: 'direct_api',
      sourceReference: null,
      inboxMessageId: null,
      refundOfTransactionId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      voidedAt: null,
      voidReason: null,
    };
    const correct = vi.fn(
      async (_id: string, _version: number, fields: Record<string, unknown>) => ({
        ...record,
        ...fields,
        version: 2,
      }),
    );
    const write = vi.fn(async () => {});
    const ctx = {
      transactions: {
        findById: async () => record,
        findByIdForUpdate: async () => record,
        postedRefundLimits: async () => ({ total: '0', earliestDate: null }),
        correct,
      },
      locks: { acquireLocks: vi.fn(async () => {}) },
      books: {
        findById: async () => ({
          id: record.bookId,
          currency: 'BRL',
          timezone: 'UTC',
          active: true,
        }),
      },
      accounts: {
        findById: async () => ({ bookId: record.bookId, currency: 'BRL', active: true }),
      },
      categories: { findById: async () => ({ bookId: record.bookId, active: true }) },
      merchants: { findById: async () => ({ active: true }) },
      audit: { write },
    } as unknown as FinancialTransactionContext;
    const port = {
      runInTransaction: <T>(fn: (ctx: FinancialTransactionContext) => Promise<T>) => fn(ctx),
    };
    const result = await new CorrectTransaction(port, () => now).execute(
      record.id,
      { version: 1, [field]: value },
      record.id,
    );
    expect(result.version).toBe(2);
    expect(correct).toHaveBeenCalledTimes(1);
    const effective = correct.mock.calls[0][2];
    expect(effective).toMatchObject({
      amount: field === 'amount' ? '11.25' : '10.00',
      description: field === 'description' ? 'changed' : 'original',
      notes: field === 'notes' ? null : 'memo',
      transactionDate: field === 'transactionDate' ? '2026-10-29' : '2026-10-28',
    });
    expect(effective[field]).toBe(value);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TRANSACTION_UPDATED',
        source: 'direct_api',
        actorReference: null,
        oldData: expect.objectContaining({ version: 1 }),
        newData: expect.objectContaining({ version: 2 }),
      }),
    );
    if (field === 'description') {
      const patch = { version: 1, description: 'changed' };
      const receipt = await prepareCorrectionLocks(ctx, record.id, patch);
      const locks = vi.mocked(ctx.locks.acquireLocks);
      const count = locks.mock.calls.length;
      await new CorrectTransaction(port, () => now).executeInContext(
        record.id,
        patch,
        record.id,
        ctx,
        { senderReference: 'validated-sender' },
        receipt,
      );
      expect(locks).toHaveBeenCalledTimes(count);
      expect(write).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: 'whatsapp',
          actorReference: 'validated-sender',
          oldData: expect.objectContaining({
            source: 'direct_api',
            sourceReference: null,
            inboxMessageId: null,
          }),
          newData: expect.objectContaining({
            source: 'direct_api',
            sourceReference: null,
            inboxMessageId: null,
          }),
        }),
      );
      await expect(
        new CorrectTransaction(port, () => now).executeInContext(
          record.id,
          patch,
          record.id,
          { ...ctx },
          undefined,
          receipt,
        ),
      ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
      vi.spyOn(ctx.transactions, 'findByIdForUpdate').mockResolvedValueOnce({
        ...record,
        accountId: '00000000-0000-4000-8000-000000000099',
      });
      await expect(
        new CorrectTransaction(port, () => now).executeInContext(
          record.id,
          patch,
          record.id,
          ctx,
          undefined,
          receipt,
        ),
      ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
      expect(locks).toHaveBeenCalledTimes(count);
    }
  });
});
