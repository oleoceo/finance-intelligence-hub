import { Type, type TSchema } from '@fastify/type-provider-typebox';
export const strict = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
export const uuid = Type.String({ format: 'uuid' });
export const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
export const text = (maxLength: number) => Type.String({ maxLength });
export const name = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: '\\S' });
export const currency = Type.String({ pattern: '^[A-Z]{3}$' });
export const accountType = Type.Union([
  Type.Literal('checking'),
  Type.Literal('savings'),
  Type.Literal('cash'),
  Type.Literal('credit_card'),
  Type.Literal('other'),
]);
export const categoryType = Type.Union([
  Type.Literal('expense'),
  Type.Literal('income'),
  Type.Literal('both'),
]);
export const matchType = Type.Union([Type.Literal('exact'), Type.Literal('contains')]);
export const priority = Type.Integer({ minimum: -2147483648, maximum: 2147483647 });
export const pathSchema = strict({ id: uuid });
export const activeQuery = Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')]));
export const patch = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Partial(Type.Object(properties), { additionalProperties: false, minProperties: 1 });
export const timestamps = {
  id: uuid,
  active: Type.Boolean(),
  created_at: Type.String({ format: 'date-time' }),
  updated_at: Type.String({ format: 'date-time' }),
};
export const archived = { archived_at: nullable(Type.String({ format: 'date-time' })) };
export const metaSchema = strict({ request_id: uuid, correlation_id: Type.String() });
export const envelope = <T extends TSchema>(data: T) => strict({ data, meta: metaSchema });
