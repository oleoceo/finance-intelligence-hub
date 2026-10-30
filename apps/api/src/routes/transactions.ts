import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ConcurrencyError,
  type CorrectTransaction,
  getLastTransaction,
  getTransaction,
  listTransactions,
  type CreateTransactionInput,
  type GenericCreateTransaction,
  type TransactionReadPort,
  type TransactionRecord,
} from '@finance-hub/core';
import { ApiError } from '../middleware/errors.js';
import { meta } from './admin/shared.js';
import {
  createTransactionSchema,
  correctTransactionSchema,
  lastTransactionQuerySchema,
  listTransactionQuerySchema,
  transactionPathSchema,
} from '../schemas/transactions.js';

export interface TransactionRouteOptions {
  genericCreate: Pick<GenericCreateTransaction, 'execute'>;
  correction: Pick<CorrectTransaction, 'execute'>;
  transactionReads: TransactionReadPort;
}

export function serializeTransaction(record: TransactionRecord) {
  return {
    id: record.id,
    human_ref: record.humanRef,
    book_id: record.bookId,
    type: record.type,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    account_id: record.accountId,
    destination_account_id: record.destinationAccountId,
    category_id: record.categoryId,
    merchant_id: record.merchantId,
    description: record.description,
    transaction_date: record.transactionDate,
    source: record.source,
    source_reference: record.sourceReference,
    refund_of_transaction_id: record.refundOfTransactionId,
    is_refund: record.refundOfTransactionId !== null,
    version: record.version,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    voided_at: record.voidedAt?.toISOString() ?? null,
  };
}

function mapCreate(body: {
  book_id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: string;
  account_id: string;
  description: string;
  notes?: string | null;
  transaction_date: string;
  source_reference?: string | null;
  category_id?: string | null;
  merchant_id?: string | null;
  destination_account_id?: string;
}): CreateTransactionInput {
  const common = {
    bookId: body.book_id,
    amount: body.amount,
    accountId: body.account_id,
    description: body.description,
    notes: body.notes,
    transactionDate: body.transaction_date,
    sourceReference: body.source_reference,
  };
  if (body.type === 'transfer') {
    return { ...common, type: 'transfer', destinationAccountId: body.destination_account_id! };
  }
  return {
    ...common,
    type: body.type,
    categoryId: body.category_id,
    merchantId: body.merchant_id,
  };
}

export function registerTransactions(instance: FastifyInstance, options: TransactionRouteOptions) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.patch(
    '/api/v1/transactions/:id',
    { schema: { params: transactionPathSchema, body: correctTransactionSchema } },
    async (request) => {
      const body = request.body;
      const record = await options.correction.execute(
        request.params.id,
        {
          version: body.version,
          ...('amount' in body ? { amount: body.amount } : {}),
          ...('account_id' in body ? { accountId: body.account_id } : {}),
          ...('category_id' in body ? { categoryId: body.category_id } : {}),
          ...('merchant_id' in body ? { merchantId: body.merchant_id } : {}),
          ...('description' in body ? { description: body.description } : {}),
          ...('notes' in body ? { notes: body.notes } : {}),
          ...('transaction_date' in body ? { transactionDate: body.transaction_date } : {}),
        },
        meta(request).correlation_id,
      );
      return { data: serializeTransaction(record), meta: meta(request) };
    },
  );
  app.post(
    '/api/v1/transactions',
    { schema: { body: createTransactionSchema } },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.trim().length === 0 || [...key].length > 255)
        throw new ApiError(422, 'VALIDATION_ERROR', 'invalid_request');
      let record: TransactionRecord;
      try {
        record = await options.genericCreate.execute(mapCreate(request.body), key, {
          correlationId: meta(request).correlation_id,
        });
      } catch (error) {
        if (error instanceof ConcurrencyError) throw new ApiError(503, 'DATABASE_UNAVAILABLE');
        throw error;
      }
      return reply.code(201).send({ data: serializeTransaction(record), meta: meta(request) });
    },
  );
  app.get(
    '/api/v1/transactions',
    { schema: { querystring: listTransactionQuerySchema } },
    async (request) => {
      const q = request.query;
      const result = await listTransactions(
        {
          bookId: q.book_id,
          type: q.type,
          status: q.status,
          accountId: q.account_id,
          categoryId: q.category_id,
          merchantId: q.merchant_id,
          dateFrom: q.date_from,
          dateTo: q.date_to,
          search: q.search,
          page: q.page === undefined ? 1 : Number(q.page),
          pageSize: q.page_size === undefined ? 50 : Number(q.page_size),
        },
        { readPort: options.transactionReads },
      );
      return {
        data: {
          items: result.items.map(serializeTransaction),
          total: result.total,
          page: result.page,
          page_size: result.pageSize,
        },
        meta: meta(request),
      };
    },
  );
  app.get(
    '/api/v1/transactions/last',
    { schema: { querystring: lastTransactionQuerySchema } },
    async (request) => {
      const record = await getLastTransaction(
        { bookId: request.query.book_id },
        { readPort: options.transactionReads },
      );
      if (!record) throw new ApiError(404, 'TRANSACTION_NOT_FOUND');
      return { data: serializeTransaction(record), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/transactions/:id',
    { schema: { params: transactionPathSchema } },
    async (request) => {
      const record = await getTransaction(request.params.id, {
        readPort: options.transactionReads,
      });
      if (!record) throw new ApiError(404, 'TRANSACTION_NOT_FOUND');
      return { data: serializeTransaction(record), meta: meta(request) };
    },
  );
}
