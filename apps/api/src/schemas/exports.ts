import { Type } from '@fastify/type-provider-typebox';
import { strict, uuid } from './configuration.js';

const date = Type.String({ format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' });

export const transactionsExportQuerySchema = strict({
  book_id: uuid,
  date_from: Type.Optional(date),
  date_to: Type.Optional(date),
});
