import { describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db-types.js';
import {
  ConcurrencyError,
  ConfigurationLockSetChangedError,
  IdempotencyInProgressRetryError,
} from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from './financial-transaction.js';

describe('financial full transaction retries', () => {
  it.each([
    new ConfigurationLockSetChangedError(),
    Object.assign(new Error('deadlock'), { code: '40P01' }),
    Object.assign(new Error('lock timeout'), { code: '55P03' }),
    new IdempotencyInProgressRetryError(),
  ])('bounds retryable failure %j to three separate transactions', async (failure) => {
    const execute = vi.fn().mockRejectedValue(failure);
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyFinancialTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it.each([
    { code: '40P01' },
    { code: '55P03' },
    new IdempotencyInProgressRetryError(),
    new ConfigurationLockSetChangedError(),
  ])('retries the whole transaction then succeeds after %j', async (failure) => {
    const execute = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('committed');
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyFinancialTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('propagates other errors immediately', async () => {
    const failure = new Error('other');
    const execute = vi.fn().mockRejectedValue(failure);
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyFinancialTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
