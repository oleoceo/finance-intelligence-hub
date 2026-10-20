/**
 * Transaction and locking adapter implementing Core TransactionPort and ConfigurationLockPort contracts.
 *
 * Uses Kysely transactions with PostgreSQL FOR UPDATE locks.
 * Implements deterministic lock ordering: Books → Accounts → Categories → Merchants → ClassificationRules → AuthorizedSenders
 * UUID ascending within each kind.
 */

import type { Kysely, Transaction } from 'kysely';
import {
  ConfigurationLockSetChangedError,
  ConcurrencyError,
  type TransactionPort,
  type MasterDataTransactionContext,
  type ConfigurationLockPort,
  type LockSpec,
} from '@finance-hub/core';
import { KyselyBookRepository } from '../repositories/book-repository.js';
import { KyselyAccountRepository } from '../repositories/account-repository.js';
import { KyselyCategoryRepository } from '../repositories/category-repository.js';
import { KyselyMerchantRepository } from '../repositories/merchant-repository.js';
import { KyselyFinancialUsageReader } from '../readers/financial-usage-reader.js';
import { KyselySenderDefaultReferenceReader } from '../readers/sender-default-reference-reader.js';
import type { DB } from '../db-types.js';

export class KyselyConfigurationLockPort implements ConfigurationLockPort {
  constructor(private readonly tx: Transaction<DB>) {}

  async acquireLocks(spec: LockSpec): Promise<void> {
    // Build ordered lock list following deterministic order
    const lockOps: Array<{ table: keyof DB; ids: string[] }> = [];

    if (spec.books && spec.books.length > 0) {
      const deduped = [...new Set(spec.books)].sort();
      lockOps.push({ table: 'books', ids: deduped });
    }
    if (spec.accounts && spec.accounts.length > 0) {
      const deduped = [...new Set(spec.accounts)].sort();
      lockOps.push({ table: 'accounts', ids: deduped });
    }
    if (spec.categories && spec.categories.length > 0) {
      const deduped = [...new Set(spec.categories)].sort();
      lockOps.push({ table: 'categories', ids: deduped });
    }
    if (spec.merchants && spec.merchants.length > 0) {
      const deduped = [...new Set(spec.merchants)].sort();
      lockOps.push({ table: 'merchants', ids: deduped });
    }
    if (spec.classificationRules && spec.classificationRules.length > 0) {
      const deduped = [...new Set(spec.classificationRules)].sort();
      lockOps.push({ table: 'classification_rules', ids: deduped });
    }
    if (spec.authorizedSenders && spec.authorizedSenders.length > 0) {
      const deduped = [...new Set(spec.authorizedSenders)].sort();
      lockOps.push({ table: 'authorized_senders', ids: deduped });
    }

    // Acquire FOR UPDATE locks in deterministic order with ORDER BY
    for (const { table, ids } of lockOps) {
      if (ids.length === 0) continue;

      await this.tx
        .selectFrom(table)
        .select('id')
        .where('id', 'in', ids)
        .orderBy('id', 'asc')
        .forUpdate()
        .execute();
    }
  }
}

export class KyselyTransactionPort implements TransactionPort {
  constructor(private readonly db: Kysely<DB>) {}

  async runInTransaction<T>(fn: (ctx: MasterDataTransactionContext) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction().execute(async (tx) => {
          const books = new KyselyBookRepository(tx);
          const accounts = new KyselyAccountRepository(tx);
          const categories = new KyselyCategoryRepository(tx);
          const merchants = new KyselyMerchantRepository(tx);
          const locks = new KyselyConfigurationLockPort(tx);
          const financialUsage = new KyselyFinancialUsageReader(tx);
          const senderDefaults = new KyselySenderDefaultReferenceReader(tx);

          const ctx: MasterDataTransactionContext = {
            books,
            accounts,
            categories,
            merchants,
            locks,
            financialUsage,
            senderDefaults,
          };

          return await fn(ctx);
        });
      } catch (error) {
        if (!(error instanceof ConfigurationLockSetChangedError)) throw error;
      }
    }
    throw new ConcurrencyError('Configuration references changed repeatedly; retry operation');
  }
}
