import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db-types.js';
import { KyselyTransactionPort } from './transaction/configuration-transaction.js';
import { KyselyFinancialTransactionPort } from './transaction/financial-transaction.js';
import { KyselyTransactionReadRepository } from './repositories/transaction-read-repository.js';
import { KyselyAuditReadRepository } from './repositories/audit-read-repository.js';
import { KyselySummaryReadRepository } from './repositories/summary-read-repository.js';
import { KyselyBookRepository } from './repositories/book-repository.js';
import { KyselyInboxTransactionPort } from './transaction/inbox-transaction.js';

export function createConfigurationStore(connectionString: string) {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, connectionTimeoutMillis: 2000 }),
    }),
  });
  return {
    transactions: new KyselyTransactionPort(db),
    financialTransactions: new KyselyFinancialTransactionPort(db),
    inboxTransactions: new KyselyInboxTransactionPort(db),
    transactionReads: new KyselyTransactionReadRepository(db),
    auditReads: new KyselyAuditReadRepository(db),
    summaryReads: new KyselySummaryReadRepository(db),
    books: new KyselyBookRepository(db),
    close: () => db.destroy(),
  };
}
