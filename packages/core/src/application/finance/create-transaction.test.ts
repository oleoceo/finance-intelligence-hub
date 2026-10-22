import { describe, expect, it, vi } from 'vitest';
import {
  GenericCreateTransaction,
  transactionSnapshot,
  type GenericCreateDependencies,
} from './create-transaction.js';
import { fingerprintTransactionCreate, IdempotencyInProgressRetryError } from './idempotency.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from '../ports/financial-transaction-port.js';
import type { CreateTransactionInput, TransactionRecord } from '../ports/transaction-ports.js';
import type { IdempotencyKeyRecord } from '../ports/idempotency-ports.js';

const now = new Date('2026-10-21T12:00:00.000Z');
const input: CreateTransactionInput = {
  type: 'expense',
  bookId: 'book',
  accountId: 'account',
  amount: '12.00',
  description: 'Lunch',
  transactionDate: '2026-10-21',
};
const record: TransactionRecord = {
  id: 'transaction',
  humanRef: 'ABC123',
  bookId: 'book',
  type: 'expense',
  status: 'posted',
  amount: '12.00',
  currency: 'BRL',
  accountId: 'account',
  destinationAccountId: null,
  categoryId: null,
  merchantId: null,
  description: 'Lunch',
  notes: null,
  transactionDate: '2026-10-21',
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
const keyRecord: IdempotencyKeyRecord = {
  id: 'claim',
  idempotencyKey: 'key',
  scope: 'transactions:create',
  status: 'in_progress',
  requestHash: fingerprintTransactionCreate(input),
  resourceType: null,
  resourceId: null,
  responseStatus: null,
  responseBody: null,
  createdAt: now,
  completedAt: null,
};
const context = { correlationId: 'correlation' };
function setup() {
  const create = vi.fn(async () => keyRecord as IdempotencyKeyRecord | null);
  const findByKeyAndScopeForUpdate = vi.fn(async () => null as IdempotencyKeyRecord | null);
  const complete = vi.fn(async () => ({ ...keyRecord, status: 'completed' as const }));
  const write = vi.fn(async () => {});
  const ctx = {
    idempotencyKeys: { create, findByKeyAndScopeForUpdate, complete },
    audit: { write },
  } as unknown as FinancialTransactionContext;
  const runInTransaction = vi.fn(async <T>(fn: (ctx: FinancialTransactionContext) => Promise<T>) =>
    fn(ctx),
  );
  const port = { runInTransaction } as FinancialTransactionPort;
  const executeExpense = vi.fn(async () => record);
  const executeIncome = vi.fn(async () => ({ ...record, type: 'income' as const }));
  const executeTransfer = vi.fn(async () => ({
    ...record,
    type: 'transfer' as const,
    destinationAccountId: 'destination',
  }));
  const deps: GenericCreateDependencies = {
    humanRefGenerator: { generate: () => 'ABC123' },
    now: () => now,
    generateIdempotencyId: () => 'claim',
    generateTransactionId: () => 'transaction',
    generateAuditId: () => 'audit',
    executeExpense,
    executeIncome,
    executeTransfer,
  };
  return {
    useCase: new GenericCreateTransaction(port, deps),
    runInTransaction,
    create,
    findByKeyAndScopeForUpdate,
    complete,
    write,
    executeExpense,
    executeIncome,
    executeTransfer,
  };
}

describe('M04-T07 GenericCreateTransaction', () => {
  it.each([
    ['expense', input, 'executeExpense'],
    ['income', { ...input, type: 'income' }, 'executeIncome'],
    [
      'transfer',
      { ...input, type: 'transfer', destinationAccountId: 'destination' },
      'executeTransfer',
    ],
  ] as const)('routes %s and writes the persisted snapshot', async (_, command, selected) => {
    const setupResult = setup();
    const result = await setupResult.useCase.execute(
      command as CreateTransactionInput,
      'key',
      context,
    );
    expect(result.type).toBe(command.type);
    for (const name of ['executeExpense', 'executeIncome', 'executeTransfer'] as const) {
      expect(setupResult[name]).toHaveBeenCalledTimes(name === selected ? 1 : 0);
    }
    expect(setupResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHash: fingerprintTransactionCreate(command as CreateTransactionInput),
        scope: 'transactions:create',
      }),
    );
    expect(setupResult.write).toHaveBeenCalledWith({
      id: 'audit',
      createdAt: now,
      entityType: 'transaction',
      entityId: result.id,
      action: 'TRANSACTION_CREATED',
      source: 'direct_api',
      actorReference: null,
      oldData: null,
      newData: transactionSnapshot(result),
      correlationId: 'correlation',
    });
    expect(setupResult.complete).toHaveBeenCalledWith({
      id: 'claim',
      resourceType: 'transaction',
      resourceId: result.id,
      responseStatus: 201,
      responseBody: transactionSnapshot(result),
      completedAt: now,
    });
    expect(setupResult.write.mock.invocationCallOrder[0]).toBeLessThan(
      setupResult.complete.mock.invocationCallOrder[0]!,
    );
  });

  it('replays the same logical record without business, Audit or completion', async () => {
    const s = setup();
    s.create.mockResolvedValue(null);
    s.findByKeyAndScopeForUpdate.mockResolvedValue({
      ...keyRecord,
      status: 'completed',
      resourceType: 'transaction',
      resourceId: record.id,
      responseStatus: 201,
      responseBody: transactionSnapshot(record),
      completedAt: now,
    });
    const result = await s.useCase.execute(input, 'key', { correlationId: 'second' });
    expect(result).toEqual(record);
    expect(s.executeExpense).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('conflicts before business work for another fingerprint', async () => {
    const s = setup();
    s.create.mockResolvedValue(null);
    s.findByKeyAndScopeForUpdate.mockResolvedValue({
      ...keyRecord,
      requestHash: 'b'.repeat(64),
      status: 'completed',
    });
    await expect(s.useCase.execute(input, 'key', context)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(s.executeExpense).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('retries an in-progress or missing locked row through the outer port', async () => {
    const s = setup();
    s.create.mockResolvedValue(null);
    s.findByKeyAndScopeForUpdate.mockResolvedValueOnce(keyRecord).mockResolvedValueOnce(null);
    await expect(s.useCase.execute(input, 'key', context)).rejects.toBeInstanceOf(
      IdempotencyInProgressRetryError,
    );
    await expect(s.useCase.execute(input, 'key', context)).rejects.toBeInstanceOf(
      IdempotencyInProgressRetryError,
    );
  });

  it('rejects invalid key and type before opening a transaction', async () => {
    const s = setup();
    await expect(s.useCase.execute(input, ' ', context)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      s.useCase.execute(
        { ...input, type: 'refund' } as unknown as CreateTransactionInput,
        'key',
        context,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(s.runInTransaction).not.toHaveBeenCalled();
  });

  it('preserves business failure and skips Audit and completion', async () => {
    const s = setup();
    const error = new Error('inactive account');
    s.executeExpense.mockRejectedValueOnce(error);
    await expect(s.useCase.execute(input, 'key', context)).rejects.toBe(error);
    expect(s.write).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('propagates Audit failure without completing idempotency', async () => {
    const s = setup();
    const error = new Error('audit insert failed');
    s.write.mockRejectedValueOnce(error);
    await expect(s.useCase.execute(input, 'key', context)).rejects.toBe(error);
    expect(s.complete).not.toHaveBeenCalled();
  });

  it('propagates completion failure after Audit', async () => {
    const s = setup();
    const error = new Error('completion failed');
    s.complete.mockRejectedValueOnce(error);
    await expect(s.useCase.execute(input, 'key', context)).rejects.toBe(error);
    expect(s.write).toHaveBeenCalledOnce();
  });
});
