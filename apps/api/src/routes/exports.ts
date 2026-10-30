import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  getFinancialSummary,
  TRANSACTION_CSV_COLUMNS,
  csvLine,
  transactionCsvLine,
  type FinancialSummaryDependencies,
  type TransactionExportReadPort,
  type TransactionReadRecord,
} from '@finance-hub/core';
import { transactionsExportQuerySchema } from '../schemas/exports.js';

const PAGE_SIZE = 256;

export function registerExports(
  instance: FastifyInstance,
  deps: FinancialSummaryDependencies & { transactionExports: TransactionExportReadPort },
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.get(
    '/api/v1/exports/transactions.csv',
    { schema: { querystring: transactionsExportQuerySchema } },
    async (request, reply) => {
      const period = await getFinancialSummary(
        {
          bookId: request.query.book_id,
          dateFrom: request.query.date_from,
          dateTo: request.query.date_to,
        },
        deps,
      );
      const filter = {
        bookId: period.bookId,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        limit: PAGE_SIZE,
      };
      // Do the first database read before sending headers so unavailable storage yields HTTP 503.
      const first = await deps.transactionExports.exportPage(filter);
      async function* chunks() {
        yield Buffer.from(csvLine(TRANSACTION_CSV_COLUMNS), 'utf8');
        let page: TransactionReadRecord[] = first;
        while (page.length > 0) {
          for (const row of page) yield Buffer.from(transactionCsvLine(row), 'utf8');
          if (page.length < PAGE_SIZE) break;
          const last = page[page.length - 1];
          page = await deps.transactionExports.exportPage({
            ...filter,
            before: { createdAt: last.createdAt, id: last.id },
          });
        }
      }
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="transactions-${period.bookId}.csv"`,
      );
      return reply.send(Readable.from(chunks(), { objectMode: false }));
    },
  );
}
