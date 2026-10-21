import { describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db-types.js';
import { ConcurrencyError, ConfigurationLockSetChangedError } from '@finance-hub/core';
import { KyselyTransactionPort } from './configuration-transaction.js';

describe('configuration full transaction retries', () => {
  it.each([
    new ConfigurationLockSetChangedError(),
    Object.assign(new Error('deadlock'), { code: '40P01' }),
  ])('bounds retryable failure %j to three separate transactions', async (failure) => {
    const execute = vi.fn().mockRejectedValue(failure);
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it('retries a rolled-back deadlock then returns the successful full transaction', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce({ code: '40P01' })
      .mockResolvedValueOnce('committed');
    const transaction = vi.fn(() => ({ execute }));
    const port = new KyselyTransactionPort({ transaction } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry an unknown infrastructure failure', async () => {
    const failure = new Error('unknown');
    const execute = vi.fn().mockRejectedValue(failure);
    const port = new KyselyTransactionPort({
      transaction: () => ({ execute }),
    } as unknown as Kysely<DB>);
    await expect(port.runInTransaction(async () => null)).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
