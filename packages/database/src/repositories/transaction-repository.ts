/**
 * Transaction repository adapter implementing Core TransactionRepository contract.
 *
 * M04-T02 scope: Expense creation only. Income/Transfer/query methods are deferred
 * to later tasks but the interface is satisfied with not-implemented stubs so that
 * FinancialTransactionContext composition remains valid.
 *
 * Uses Kysely to interact with PostgreSQL transactions table.
 * Human-ref collision is handled via ON CONFLICT DO NOTHING RETURNING — the caller
 * retries with a new candidate inside the same financial transaction.
 */

import type { Kysely } from 'kysely';
import type {
  TransactionRepository,
  TransactionRecord,
  CreateTransactionInput,
  ListTransactionsInput,
  ListTransactionsResult,
  GetLastTransactionInput,
  TransactionCreateSource,
} from '@finance-hub/core';
import type { DB } from '../db-types.js';

export class KyselyTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insert a Transaction row using ON CONFLICT DO NOTHING RETURNING.
   * Returns null when human_ref collides (caller retries with next candidate).
   * Never throws on unique violation — the PostgreSQL transaction stays usable.
   */
  async create(
    input: CreateTransactionInput & {
      id: string;
      humanRef: string;
      source: TransactionCreateSource;
      currency: string;
    },
  ): Promise<TransactionRecord | null> {
    const result = await this.db
      .insertInto('transactions')
      .values({
        id: input.id,
        human_ref: input.humanRef,
        book_id: input.bookId,
        type: input.type,
        status: 'posted',
        amount: input.amount,
        currency: input.currency,
        account_id: input.accountId,
        destination_account_id:
          input.type === 'transfer' && 'destinationAccountId' in input
            ? (input as Extract<typeof input, { type: 'transfer' }>).destinationAccountId
            : null,
        category_id:
          'categoryId' in input
            ? ((input as Extract<typeof input, { categoryId?: string | null }>).categoryId ?? null)
            : null,
        merchant_id:
          'merchantId' in input
            ? ((input as Extract<typeof input, { merchantId?: string | null }>).merchantId ?? null)
            : null,
        description: input.description,
        notes: input.notes ?? null,
        transaction_date: input.transactionDate,
        source: input.source,
        source_reference: input.sourceReference ?? null,
        inbox_message_id: null,
        refund_of_transaction_id: null,
        version: 1,
        voided_at: null,
        void_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict((oc) => oc.column('human_ref').doNothing())
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return this.mapToTransactionRecord(result);
  }

  async findById(id: string): Promise<TransactionRecord | null> {
    const result = await this.db
      .selectFrom('transactions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!result) return null;
    return this.mapToTransactionRecord(result);
  }

  async findByHumanRef(humanRef: string): Promise<TransactionRecord | null> {
    const result = await this.db
      .selectFrom('transactions')
      .selectAll()
      .where('human_ref', '=', humanRef)
      .executeTakeFirst();

    if (!result) return null;
    return this.mapToTransactionRecord(result);
  }

  async list(_input: ListTransactionsInput): Promise<ListTransactionsResult> {
    // Deferred to T05 query task
    throw new Error('TransactionRepository.list not implemented in M04-T02');
  }

  async getLast(_input: GetLastTransactionInput): Promise<TransactionRecord | null> {
    // Deferred to T05 query task
    throw new Error('TransactionRepository.getLast not implemented in M04-T02');
  }

  private mapToTransactionRecord(row: DB['transactions']): TransactionRecord {
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
    };
  }
}
