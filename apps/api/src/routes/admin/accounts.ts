import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  type AccountRecord,
} from '@finance-hub/core';
import { createSchema, updateSchema, resourceSchema, querySchema } from '../../schemas/accounts.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: AccountRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    archived_at: record.archivedAt?.toISOString() ?? null,
    book_id: record.bookId,
    name: record.name,
    normalized_name: record.normalizedName,
    type: record.type as 'checking' | 'savings' | 'cash' | 'credit_card' | 'other',
    currency: record.currency,
    institution_name: record.institutionName,
    notes: record.notes,
  };
}
export function registerAccounts(instance: FastifyInstance, options: ConfigurationOptions) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/accounts',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createAccount(
          {
            bookId: body.book_id,
            name: body.name,
            type: body.type,
            institutionName: body.institution_name,
            notes: body.notes,
          },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/accounts/:id',
    {
      schema: {
        params: pathSchema,
        body: updateSchema,
        response: { 200: envelope(resourceSchema) },
      },
    },
    async (request) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        updateAccount(
          {
            id: request.params.id,
            name: body.name,
            type: body.type,
            currency: body.currency,
            institutionName: body.institution_name,
            notes: body.notes,
            active: body.active,
          },
          ctx,
          options.now(),
        ),
      );
      return { data: serialize(record), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/accounts/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getAccount(request.params.id, ctx),
      );
      return { data: serialize(requireResource(record, 'Account')), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/accounts',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) => listAccounts(ctx));
      const filtered = records.filter(
        (record) =>
          (query.active === undefined || record.active === (query.active === 'true')) &&
          (query.book_id === undefined || record.bookId === query.book_id),
      );
      filtered.sort((a, b) => -(compare(a.createdAt, b.createdAt) || compare(a.id, b.id)));
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
