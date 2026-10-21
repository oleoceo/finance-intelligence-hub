import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { createBook, getBook, listBooks, updateBook, type BookRecord } from '@finance-hub/core';
import { createSchema, updateSchema, resourceSchema, querySchema } from '../../schemas/books.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: BookRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    archived_at: record.archivedAt?.toISOString() ?? null,
    name: record.name,
    normalized_name: record.normalizedName,
    currency: record.currency,
    timezone: record.timezone,
  };
}
export function registerBooks(instance: FastifyInstance, options: ConfigurationOptions) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/books',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createBook(
          { name: body.name, currency: body.currency, timezone: body.timezone },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/books/:id',
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
        updateBook(
          {
            id: request.params.id,
            name: body.name,
            currency: body.currency,
            timezone: body.timezone,
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
    '/api/v1/books/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getBook(request.params.id, ctx),
      );
      return { data: serialize(requireResource(record, 'Book')), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/books',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) => listBooks(ctx));
      const filtered = records.filter(
        (record) => query.active === undefined || record.active === (query.active === 'true'),
      );
      filtered.sort((a, b) => -(compare(a.createdAt, b.createdAt) || compare(a.id, b.id)));
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
