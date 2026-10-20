/**
 * Transaction and locking adapter implementing Core TransactionPort and ConfigurationLockPort contracts.
 *
 * Uses Kysely transactions with PostgreSQL FOR UPDATE locks.
 * Implements deterministic lock ordering: Books → Accounts → Categories → Merchants → ClassificationRules → AuthorizedSenders
 * UUID ascending within each kind.
 */

import type { Kysely, Transaction } from 'kysely';
import {
  type TransactionPort,
  type TransactionContext,
  type ConfigurationLockPort,
  type LockSpec,
} from '@finance-hub/core';
import { KyselyBookRepository } from '../repositories/book-repository.js';
import { KyselyAccountRepository } from '../repositories/account-repository.js';
import { KyselyFinancialUsageReader } from '../readers/financial-usage-reader.js';
import { KyselySenderDefaultReferenceReader } from '../readers/sender-default-reference-reader.js';
import type { DB } from '../db-types.js';

export class KyselyConfigurationLockPort implements ConfigurationLockPort {
  constructor(private readonly tx: Transaction<DB>) {}

  async acquireLocks(spec: LockSpec): Promise<void> {
    // Build ordered lock list following deterministic order (T02 entities only)
    const lockOps: Array<{ table: keyof DB; ids: string[] }> = [];

    if (spec.books && spec.books.length > 0) {
      const deduped = [...new Set(spec.books)].sort();
      lockOps.push({ table: 'books', ids: deduped });
    }
    if (spec.accounts && spec.accounts.length > 0) {
      const deduped = [...new Set(spec.accounts)].sort();
      lockOps.push({ table: 'accounts', ids: deduped });
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

  async runInTransaction<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (tx) => {
      // Create transaction-scoped repository instances for T02 entities only
      const books = new KyselyBookRepository(tx);
      const accounts = new KyselyAccountRepository(tx);
      const locks = new KyselyConfigurationLockPort(tx);
      const financialUsage = new KyselyFinancialUsageReader(tx);
      const senderDefaults = new KyselySenderDefaultReferenceReader(tx);

      const ctx: TransactionContext = {
        books,
        accounts,
        locks,
        financialUsage,
        senderDefaults,
      };

      return await fn(ctx);
    });
  }
}
