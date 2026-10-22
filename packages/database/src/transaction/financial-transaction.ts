/**
 * Financial transaction port adapter implementing Core FinancialTransactionPort contract.
 *
 * M04-T02 scope: provides a single outer PostgreSQL transaction that includes
 * master-data repositories, configuration locks, financial usage reader,
 * transaction repository, real idempotency repository and stub audit port.
 *
 * T07 owns calling runInTransaction in production. T02 tests call it directly.
 * This adapter reuses the existing KyselyConfigurationLockPort and M03 repositories.
 */

import type { Kysely } from 'kysely';
import {
  ConfigurationLockSetChangedError,
  ConcurrencyError,
  IdempotencyInProgressRetryError,
} from '@finance-hub/core';
import type {
  FinancialTransactionPort,
  FinancialTransactionContext,
  AuditWriter,
  WriteAuditEventInput,
} from '@finance-hub/core';
import { KyselyBookRepository } from '../repositories/book-repository.js';
import { KyselyAccountRepository } from '../repositories/account-repository.js';
import { KyselyCategoryRepository } from '../repositories/category-repository.js';
import { KyselyMerchantRepository } from '../repositories/merchant-repository.js';
import { KyselyConfigurationLockPort } from './configuration-transaction.js';
import { KyselyFinancialUsageReader } from '../readers/financial-usage-reader.js';
import { KyselyTransactionRepository } from '../repositories/transaction-repository.js';
import { KyselyIdempotencyKeyRepository } from '../repositories/idempotency-key-repository.js';
import type { DB } from '../db-types.js';

/**
 * Stub audit writer for T02 context composition.
 * T07 owns the real implementation. T02 does not invoke audit writes.
 */
class StubAuditWriter implements AuditWriter {
  async write(_input: WriteAuditEventInput): Promise<void> {
    throw new Error('AuditWriter.write not implemented in M04-T02; deferred to T07');
  }
}

export class KyselyFinancialTransactionPort implements FinancialTransactionPort {
  constructor(private readonly db: Kysely<DB>) {}

  async runInTransaction<T>(fn: (ctx: FinancialTransactionContext) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction().execute(async (tx) => {
          const books = new KyselyBookRepository(tx);
          const accounts = new KyselyAccountRepository(tx);
          const categories = new KyselyCategoryRepository(tx);
          const merchants = new KyselyMerchantRepository(tx);
          const locks = new KyselyConfigurationLockPort(tx);
          const financialUsage = new KyselyFinancialUsageReader(tx);
          const transactions = new KyselyTransactionRepository(tx);
          const idempotencyKeys = new KyselyIdempotencyKeyRepository(tx);
          const audit = new StubAuditWriter();

          const ctx: FinancialTransactionContext = {
            books,
            accounts,
            categories,
            merchants,
            locks,
            financialUsage,
            transactions,
            idempotencyKeys,
            audit,
          };

          return await fn(ctx);
        });
      } catch (error) {
        const deadlock =
          typeof error === 'object' && error !== null && 'code' in error && error.code === '40P01';
        const lockTimeout =
          typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03';
        if (
          !(error instanceof ConfigurationLockSetChangedError) &&
          !(error instanceof IdempotencyInProgressRetryError) &&
          !deadlock &&
          !lockTimeout
        )
          throw error;
      }
    }
    throw new ConcurrencyError('Financial transaction could not complete after three attempts');
  }
}
