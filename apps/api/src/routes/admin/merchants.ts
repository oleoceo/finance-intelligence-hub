import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  createMerchant,
  getMerchant,
  listMerchants,
  updateMerchant,
  type MerchantRecord,
} from '@finance-hub/core';
import {
  createSchema,
  updateSchema,
  resourceSchema,
  querySchema,
} from '../../schemas/merchants.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: MerchantRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    archived_at: record.archivedAt?.toISOString() ?? null,
    name: record.name,
    normalized_name: record.normalizedName,
    type: record.type,
    tax_identifier: record.taxIdentifier,
  };
}
export function registerMerchants(instance: FastifyInstance, options: ConfigurationOptions) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/merchants',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createMerchant(
          { name: body.name, type: body.type, taxIdentifier: body.tax_identifier },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/merchants/:id',
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
        updateMerchant(
          {
            id: request.params.id,
            name: body.name,
            type: body.type,
            taxIdentifier: body.tax_identifier,
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
    '/api/v1/merchants/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getMerchant(request.params.id, ctx),
      );
      return { data: serialize(requireResource(record, 'Merchant')), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/merchants',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) => listMerchants(ctx));
      const filtered = records.filter(
        (record) => query.active === undefined || record.active === (query.active === 'true'),
      );
      filtered.sort((a, b) => compare(a.normalizedName, b.normalizedName) || compare(a.id, b.id));
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
