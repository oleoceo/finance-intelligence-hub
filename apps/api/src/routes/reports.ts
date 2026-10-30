import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { getFinancialSummary, type FinancialSummaryDependencies } from '@finance-hub/core';
import { meta } from './admin/shared.js';
import { summaryQuerySchema, summaryResponseSchema } from '../schemas/reports.js';

export function registerReports(instance: FastifyInstance, deps: FinancialSummaryDependencies) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.get(
    '/api/v1/reports/summary',
    { schema: { querystring: summaryQuerySchema, response: { 200: summaryResponseSchema } } },
    async (request) => {
      const result = await getFinancialSummary(
        {
          bookId: request.query.book_id,
          dateFrom: request.query.date_from,
          dateTo: request.query.date_to,
        },
        deps,
      );
      return {
        data: {
          book_id: result.bookId,
          currency: result.currency,
          ordinary_income: result.ordinaryIncome,
          gross_expenses: result.grossExpenses,
          refunds: result.refunds,
          net_expenses: result.netExpenses,
          net: result.net,
        },
        meta: meta(request),
      };
    },
  );
}
