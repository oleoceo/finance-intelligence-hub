/**
 * Read-only Transaction repository adapter implementing Core TransactionReadPort contract.
 *
 * Uses Kysely to interact with PostgreSQL transactions table.
 * Never acquires write locks (no FOR UPDATE).
 */

import type { Kysely } from 'kysely';
import type {
  TransactionReadPort,
  TransactionExportReadPort,
  TransactionRecord,
  TransactionReadRecord,
  ListTransactionsInput,
  ListTransactionsResult,
  GetLastTransactionInput,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';
import { sql } from 'kysely';

export class KyselyTransactionReadRepository
  implements TransactionReadPort, TransactionExportReadPort
{
  constructor(private readonly db: Kysely<DB>) {}

  async findById(id: string): Promise<TransactionReadRecord | null> {
    const result = await this.db
      .selectFrom('transactions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) return null;
    return mapToTransactionReadRecord(result);
  }

  async listRefunds(originalId: string): Promise<TransactionReadRecord[]> {
    const rows = await this.db
      .selectFrom('transactions')
      .selectAll()
      .where('refund_of_transaction_id', '=', originalId)
      .where('type', '=', 'income')
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(mapToTransactionReadRecord);
  }

  async list(input: ListTransactionsInput): Promise<ListTransactionsResult> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;

    if (page < 1 || !Number.isInteger(page)) {
      throw new Error('Invalid page: must be a positive integer');
    }
    if (pageSize < 1 || pageSize > 100 || !Number.isInteger(pageSize)) {
      throw new Error('Invalid pageSize: must be a positive integer (max 100)');
    }

    let query = this.db.selectFrom('transactions').selectAll();

    if (input.bookId !== undefined && input.bookId !== null) {
      query = query.where('book_id', '=', input.bookId);
    }
    if (input.type !== undefined && input.type !== null) {
      query = query.where('type', '=', input.type);
    }
    if (input.status !== undefined && input.status !== null) {
      query = query.where('status', '=', input.status);
    }
    if (input.accountId !== undefined && input.accountId !== null) {
      query = query.where('account_id', '=', input.accountId);
    }
    if (input.categoryId !== undefined && input.categoryId !== null) {
      query = query.where('category_id', '=', input.categoryId);
    }
    if (input.merchantId !== undefined && input.merchantId !== null) {
      query = query.where('merchant_id', '=', input.merchantId);
    }
    if (input.dateFrom !== undefined && input.dateFrom !== null) {
      query = query.where('transaction_date', '>=', input.dateFrom);
    }
    if (input.dateTo !== undefined && input.dateTo !== null) {
      query = query.where('transaction_date', '<=', input.dateTo);
    }
    if (input.search !== undefined && input.search !== null && input.search.trim() !== '') {
      const searchPattern = `%${input.search.toLowerCase()}%`;
      query = query.where((eb) =>
        eb.or([
          eb('description', 'ilike', searchPattern),
          sql<boolean>`coalesce(notes, '') ilike ${searchPattern}`,
          sql<boolean>`coalesce(source_reference, '') ilike ${searchPattern}`,
        ]),
      );
    }

    // Count query with same filters
    let countQuery = this.db
      .selectFrom('transactions')
      .select((eb) => eb.fn.countAll().as('count'));

    if (input.bookId !== undefined && input.bookId !== null) {
      countQuery = countQuery.where('book_id', '=', input.bookId);
    }
    if (input.type !== undefined && input.type !== null) {
      countQuery = countQuery.where('type', '=', input.type);
    }
    if (input.status !== undefined && input.status !== null) {
      countQuery = countQuery.where('status', '=', input.status);
    }
    if (input.accountId !== undefined && input.accountId !== null) {
      countQuery = countQuery.where('account_id', '=', input.accountId);
    }
    if (input.categoryId !== undefined && input.categoryId !== null) {
      countQuery = countQuery.where('category_id', '=', input.categoryId);
    }
    if (input.merchantId !== undefined && input.merchantId !== null) {
      countQuery = countQuery.where('merchant_id', '=', input.merchantId);
    }
    if (input.dateFrom !== undefined && input.dateFrom !== null) {
      countQuery = countQuery.where('transaction_date', '>=', input.dateFrom);
    }
    if (input.dateTo !== undefined && input.dateTo !== null) {
      countQuery = countQuery.where('transaction_date', '<=', input.dateTo);
    }
    if (input.search !== undefined && input.search !== null && input.search.trim() !== '') {
      const searchPattern = `%${input.search.toLowerCase()}%`;
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb('description', 'ilike', searchPattern),
          sql<boolean>`coalesce(notes, '') ilike ${searchPattern}`,
          sql<boolean>`coalesce(source_reference, '') ilike ${searchPattern}`,
        ]),
      );
    }

    const countResult = await countQuery.executeTakeFirst();
    const total = Number(countResult?.count ?? 0);

    const offset = (page - 1) * pageSize;

    const items = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(pageSize)
      .offset(offset)
      .execute();

    return {
      items: items.map(mapToTransactionReadRecord),
      total,
      page,
      pageSize,
    };
  }

  async getLast(input: GetLastTransactionInput): Promise<TransactionReadRecord | null> {
    const result = await this.db
      .selectFrom('transactions')
      .selectAll()
      .where('book_id', '=', input.bookId)
      .where('status', '=', 'posted')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!result) return null;
    return mapToTransactionReadRecord(result);
  }

  async exportPage(input: {
    bookId: string;
    dateFrom?: string;
    dateTo?: string;
    before?: { createdAt: Date; id: string };
    limit: number;
  }): Promise<TransactionReadRecord[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 256) {
      throw new Error('Invalid export page size');
    }
    let query = this.db.selectFrom('transactions').selectAll().where('book_id', '=', input.bookId);
    if (input.dateFrom) query = query.where('transaction_date', '>=', input.dateFrom);
    if (input.dateTo) query = query.where('transaction_date', '<=', input.dateTo);
    if (input.before) {
      const { createdAt, id } = input.before;
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', createdAt),
          eb.and([eb('created_at', '=', createdAt), eb('id', '<', id)]),
        ]),
      );
    }
    return (
      await query.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(input.limit).execute()
    ).map(mapToTransactionReadRecord);
  }
}

function mapToTransactionReadRecord(row: DB['transactions']): TransactionReadRecord {
  return {
    id: row.id,
    humanRef: row.human_ref,
    bookId: row.book_id,
    type: row.type as TransactionRecord['type'],
    status: row.status as TransactionRecord['status'],
    amount: String(row.amount),
    currency: row.currency,
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id,
    categoryId: row.category_id,
    merchantId: row.merchant_id,
    description: row.description,
    notes: row.notes,
    transactionDate:
      typeof row.transaction_date === 'object' &&
      row.transaction_date !== null &&
      'toISOString' in row.transaction_date
        ? (row.transaction_date as Date).toISOString().slice(0, 10)
        : String(row.transaction_date),
    source: row.source as TransactionRecord['source'],
    sourceReference: row.source_reference,
    inboxMessageId: row.inbox_message_id,
    refundOfTransactionId: row.refund_of_transaction_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    isRefund: row.refund_of_transaction_id !== null,
  };
}
