/**
 * Financial transaction port adapter implementing Core FinancialTransactionPort contract.
 *
 * M04-T02 scope: provides a single outer PostgreSQL transaction that includes
 * master-data repositories, configuration locks, financial usage reader,
 * transaction repository, and stub idempotency/audit ports for context composition.
 *
 * T07 owns calling runInTransaction in production. T02 tests call it directly.
 * This adapter reuses the existing KyselyConfigurationLockPort and M03 repositories.
 */

import type { Kysely } from 'kysely';
import { ConfigurationLockSetChangedError, ConcurrencyError } from '@finance-hub/core';
import type {
  FinancialTransactionPort,
  FinancialTransactionContext,
  IdempotencyKeyRepository,
  IdempotencyKeyRecord,
  CreateIdempotencyKeyInput,
  CompleteIdempotencyKeyInput,
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
import type { DB } from '../db-types.js';

/**
 * Stub idempotency key repository for T02 context composition.
 * T06 owns the real implementation. T02 does not invoke idempotency operations.
 */
class StubIdempotencyKeyRepository implements IdempotencyKeyRepository {
  async create(_input: CreateIdempotencyKeyInput): Promise<IdempotencyKeyRecord> {
    throw new Error('IdempotencyKeyRepository.create not implemented in M04-T02; deferred to T06');
  }
  async complete(_input: CompleteIdempotencyKeyInput): Promise<IdempotencyKeyRecord> {
    throw new Error(
      'IdempotencyKeyRepository.complete not implemented in M04-T02; deferred to T06',
    );
  }
  async findByKeyAndScope(
    _idempotencyKey: string,
    _scope: 'transactions:create',
  ): Promise<IdempotencyKeyRecord | null> {
    throw new Error(
      'IdempotencyKeyRepository.findByKeyAndScope not implemented in M04-T02; deferred to T06',
    );
  }
}

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
          const idempotencyKeys = new StubIdempotencyKeyRepository();
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
        if (!(error instanceof ConfigurationLockSetChangedError) && !deadlock) throw error;
      }
    }
    throw new ConcurrencyError('Configuration references changed repeatedly; retry operation');
  }
}
