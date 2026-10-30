import { Type } from '@fastify/type-provider-typebox';
import { envelope, strict, uuid } from './configuration.js';

const date = Type.String({ format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const amount = Type.String({ pattern: '^-?(?:0|[1-9]\\d*)\\.\\d{2}$' });

export const summaryQuerySchema = strict({
  book_id: uuid,
  date_from: Type.Optional(date),
  date_to: Type.Optional(date),
});

export const summaryResponseSchema = envelope(
  strict({
    book_id: uuid,
    currency: Type.String({ pattern: '^[A-Z]{3}$' }),
    ordinary_income: amount,
    gross_expenses: amount,
    refunds: amount,
    net_expenses: amount,
    net: amount,
  }),
);
