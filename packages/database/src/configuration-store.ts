import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db-types.js';
import { KyselyTransactionPort } from './transaction/configuration-transaction.js';

export function createConfigurationStore(connectionString: string) {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString, connectionTimeoutMillis: 2000 }),
    }),
  });
  return { transactions: new KyselyTransactionPort(db), close: () => db.destroy() };
}
