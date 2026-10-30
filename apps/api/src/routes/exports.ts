import { PassThrough } from 'node:stream';
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
      const stream = new PassThrough();
      let started = false;
      let firstResolve!: () => void;
      let firstReject!: (error: unknown) => void;
      const firstRead = new Promise<void>((resolve, reject) => {
        firstResolve = resolve;
        firstReject = reject;
      });
      const write = async (chunk: string) => {
        if (stream.destroyed) throw new Error('CSV client disconnected');
        if (!stream.write(Buffer.from(chunk, 'utf8'))) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              stream.off('drain', drained);
              stream.off('close', closed);
            };
            const drained = () => {
              cleanup();
              resolve();
            };
            const closed = () => {
              cleanup();
              reject(new Error('CSV client disconnected'));
            };
            stream.once('drain', drained);
            stream.once('close', closed);
          });
        }
      };
      const task = deps.transactionExports.exportSnapshot(
        filter,
        async () => {
          await write(csvLine(TRANSACTION_CSV_COLUMNS));
          started = true;
          firstResolve();
        },
        async (page: TransactionReadRecord[]) => {
          if (stream.destroyed) throw new Error('CSV client disconnected');
          for (const row of page) await write(transactionCsvLine(row));
        },
      );
      void task.then(
        () => stream.end(),
        (error: unknown) => {
          if (!started) firstReject(error);
          else stream.destroy(error instanceof Error ? error : new Error(String(error)));
        },
      );
      try {
        await firstRead;
      } catch (error) {
        stream.destroy();
        throw error;
      }
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="transactions-${period.bookId}.csv"`,
      );
      return reply.send(stream);
    },
  );
}
