import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
  type CategoryRecord,
} from '@finance-hub/core';
import {
  createSchema,
  updateSchema,
  resourceSchema,
  querySchema,
} from '../../schemas/categories.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: CategoryRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    archived_at: record.archivedAt?.toISOString() ?? null,
    book_id: record.bookId,
    name: record.name,
    normalized_name: record.normalizedName,
    parent_category_id: record.parentCategoryId,
    type: record.type as 'expense' | 'income' | 'both',
  };
}
export function registerCategories(instance: FastifyInstance, options: ConfigurationOptions) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/categories',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createCategory(
          {
            bookId: body.book_id,
            name: body.name,
            parentCategoryId: body.parent_category_id,
            type: body.type,
          },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/categories/:id',
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
        updateCategory(
          {
            id: request.params.id,
            name: body.name,
            parentCategoryId: body.parent_category_id,
            type: body.type,
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
    '/api/v1/categories/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getCategory(request.params.id, ctx),
      );
      return { data: serialize(requireResource(record, 'Category')), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/categories',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) => listCategories(ctx));
      const filtered = records.filter(
        (record) =>
          (query.active === undefined || record.active === (query.active === 'true')) &&
          (query.book_id === undefined || record.bookId === query.book_id) &&
          (query.parent_category_id === undefined ||
            record.parentCategoryId === query.parent_category_id) &&
          (query.type === undefined || record.type === query.type),
      );
      filtered.sort((a, b) => compare(a.normalizedName, b.normalizedName) || compare(a.id, b.id));
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
