import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  createClassificationRule,
  getClassificationRule,
  listClassificationRules,
  updateClassificationRule,
  type ClassificationRuleRecord,
} from '@finance-hub/core';
import {
  createSchema,
  updateSchema,
  resourceSchema,
  querySchema,
} from '../../schemas/classification-rules.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: ClassificationRuleRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    priority: record.priority,
    match_type: record.matchType,
    pattern: record.pattern,
    normalized_pattern: record.normalizedPattern,
    target_book_id: record.targetBookId,
    target_account_id: record.targetAccountId,
    target_category_id: record.targetCategoryId,
    target_merchant_id: record.targetMerchantId,
    source: record.source,
  };
}
export function registerClassificationRules(
  instance: FastifyInstance,
  options: ConfigurationOptions,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/admin/classification-rules',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createClassificationRule(
          {
            priority: body.priority ?? 100,
            matchType: body.match_type,
            pattern: body.pattern,
            targetBookId: body.target_book_id,
            targetAccountId: body.target_account_id,
            targetCategoryId: body.target_category_id,
            targetMerchantId: body.target_merchant_id,
          },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/admin/classification-rules/:id',
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
        updateClassificationRule(
          {
            id: request.params.id,
            priority: body.priority,
            matchType: body.match_type,
            pattern: body.pattern,
            targetBookId: body.target_book_id,
            targetAccountId: body.target_account_id,
            targetCategoryId: body.target_category_id,
            targetMerchantId: body.target_merchant_id,
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
    '/api/v1/admin/classification-rules/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getClassificationRule(request.params.id, ctx),
      );
      return {
        data: serialize(requireResource(record, 'ClassificationRule')),
        meta: meta(request),
      };
    },
  );
  app.get(
    '/api/v1/admin/classification-rules',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) =>
        listClassificationRules(ctx),
      );
      const filtered = records.filter(
        (record) =>
          (query.active === undefined || record.active === (query.active === 'true')) &&
          (query.match_type === undefined || record.matchType === query.match_type) &&
          (query.target_book_id === undefined || record.targetBookId === query.target_book_id),
      );
      filtered.sort(
        (a, b) =>
          a.priority - b.priority || compare(a.createdAt, b.createdAt) || compare(a.id, b.id),
      );
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
