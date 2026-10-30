import { sql, type Kysely } from 'kysely';
import type { SummaryReadPort } from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselySummaryReadRepository implements SummaryReadPort {
  constructor(private readonly db: Kysely<DB>) {}

  async getSummary(input: { bookId: string; dateFrom?: string; dateTo?: string }) {
    let query = this.db
      .selectFrom('transactions')
      .select([
        sql<string>`coalesce(sum(amount) filter (where type = 'income' and refund_of_transaction_id is null), 0.00::numeric)::text`.as(
          'ordinaryIncome',
        ),
        sql<string>`coalesce(sum(amount) filter (where type = 'expense'), 0.00::numeric)::text`.as(
          'grossExpenses',
        ),
        sql<string>`coalesce(sum(amount) filter (where type = 'income' and refund_of_transaction_id is not null), 0.00::numeric)::text`.as(
          'refunds',
        ),
      ])
      .where('book_id', '=', input.bookId)
      .where('status', '=', 'posted');
    if (input.dateFrom !== undefined) query = query.where('transaction_date', '>=', input.dateFrom);
    if (input.dateTo !== undefined) query = query.where('transaction_date', '<=', input.dateTo);
    const row = await query.executeTakeFirstOrThrow();
    return {
      ordinaryIncome: row.ordinaryIncome,
      grossExpenses: row.grossExpenses,
      refunds: row.refunds,
    };
  }
}
