/**
 * FinancialUsageReader adapter implementing Core FinancialUsageReader contract.
 *
 * Queries the transactions table to determine if a Book or Account has historical usage.
 */
import type { Kysely } from 'kysely';
import type { FinancialUsageReader } from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselyFinancialUsageReader implements FinancialUsageReader {
  constructor(private readonly db: Kysely<DB>) {}

  async hasBookUsage(bookId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('transactions')
      .select('id')
      .where('book_id', '=', bookId)
      .limit(1)
      .executeTakeFirst();

    return result !== undefined;
  }

  async hasAccountUsage(accountId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('transactions')
      .select('id')
      .where((eb) =>
        eb.or([eb('account_id', '=', accountId), eb('destination_account_id', '=', accountId)]),
      )
      .limit(1)
      .executeTakeFirst();

    return result !== undefined;
  }
}
