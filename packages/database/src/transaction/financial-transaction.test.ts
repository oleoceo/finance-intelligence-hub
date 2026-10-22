import { describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db-types.js';
import { ConcurrencyError, ConfigurationLockSetChangedError } from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from './financial-transaction.js';

describe('financial full transaction retries', () => {
  it.each([
    new ConfigurationLockSetChangedError(),
    Object.assign(new Error('deadlock'), { code: '40P01' }),
  ])('bounds retryable failure %j to three separate transactions', async (failure) => {
    const execute = vi.fn().mockRejectedValue(failure);
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyFinancialTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('retries the whole transaction after a deadlock', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce({ code: '40P01' })
      .mockResolvedValueOnce('committed');
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
