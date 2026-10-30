import { Type } from '@fastify/type-provider-typebox';
import { envelope, nullable, strict, uuid } from './configuration.js';

const money = Type.String({ pattern: '^[0-9]+(?:\\.[0-9]+)?$' });
const date = Type.String({ format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const optionalNullableUuid = Type.Optional(nullable(uuid));
const optionalNullableText = Type.Optional(nullable(Type.String()));
const common = {
  book_id: uuid,
  amount: money,
  account_id: uuid,
  description: Type.String(),
  notes: optionalNullableText,
  transaction_date: date,
  source_reference: optionalNullableText,
};

export const createTransactionSchema = Type.Union([
  strict({
    ...common,
    type: Type.Literal('expense'),
    category_id: optionalNullableUuid,
    merchant_id: optionalNullableUuid,
  }),
  strict({
    ...common,
    type: Type.Literal('income'),
    category_id: optionalNullableUuid,
    merchant_id: optionalNullableUuid,
  }),
  strict({
    ...common,
    type: Type.Literal('transfer'),
    destination_account_id: uuid,
  }),
]);

const positiveDecimal = Type.String({ pattern: '^[1-9][0-9]*$' });
export const listTransactionQuerySchema = strict({
  book_id: Type.Optional(uuid),
  type: Type.Optional(
    Type.Union([Type.Literal('expense'), Type.Literal('income'), Type.Literal('transfer')]),
  ),
  status: Type.Optional(Type.Union([Type.Literal('posted'), Type.Literal('voided')])),
  account_id: Type.Optional(uuid),
  category_id: Type.Optional(uuid),
  merchant_id: Type.Optional(uuid),
  date_from: Type.Optional(date),
  date_to: Type.Optional(date),
  search: Type.Optional(Type.String()),
  page: Type.Optional(positiveDecimal),
  page_size: Type.Optional(positiveDecimal),
});
export const lastTransactionQuerySchema = strict({ book_id: uuid });
export const transactionPathSchema = strict({ id: uuid });
export const emptyTransactionQuerySchema = strict({});
export const transactionResponseSchema = strict({
  id: uuid,
  human_ref: Type.String(),
  book_id: uuid,
  type: Type.Union([Type.Literal('expense'), Type.Literal('income'), Type.Literal('transfer')]),
  status: Type.Union([Type.Literal('posted'), Type.Literal('voided')]),
  amount: money,
  currency: Type.String(),
  account_id: uuid,
  destination_account_id: nullable(uuid),
  category_id: nullable(uuid),
  merchant_id: nullable(uuid),
  description: Type.String(),
  transaction_date: date,
  source: Type.String(),
  source_reference: nullable(Type.String()),
  refund_of_transaction_id: nullable(uuid),
  is_refund: Type.Boolean(),
  version: Type.Integer(),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
  voided_at: nullable(Type.String({ format: 'date-time' })),
});
export const refundsResponseSchema = envelope(
  strict({ items: Type.Array(transactionResponseSchema) }),
);
export const auditResponseSchema = envelope(
  strict({
    items: Type.Array(
      strict({
        id: uuid,
        entity_id: uuid,
        action: Type.String(),
        source: Type.String(),
        actor_reference: nullable(Type.String()),
        old_data: nullable(Type.Record(Type.String(), Type.Unknown())),
        new_data: Type.Record(Type.String(), Type.Unknown()),
        correlation_id: Type.String(),
        created_at: Type.String({ format: 'date-time' }),
      }),
    ),
  }),
);
export const correctTransactionSchema = strict({
  version: Type.Integer({ minimum: 1 }),
  amount: Type.Optional(money),
  account_id: Type.Optional(uuid),
  category_id: optionalNullableUuid,
  merchant_id: optionalNullableUuid,
  description: Type.Optional(Type.String()),
  notes: optionalNullableText,
  transaction_date: Type.Optional(date),
});
export const voidTransactionSchema = strict({
  version: Type.Integer({ minimum: 1 }),
  reason: Type.String({ minLength: 1, pattern: '\\S' }),
});
export const refundTransactionSchema = strict({
  version: Type.Integer({ minimum: 1 }),
  amount: money,
  account_id: uuid,
  transaction_date: date,
  description: Type.String(),
  notes: optionalNullableText,
});
