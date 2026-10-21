import type { FastifyInstance } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  createAuthorizedSender,
  getAuthorizedSender,
  listAuthorizedSenders,
  updateAuthorizedSender,
  type AuthorizedSenderRecord,
} from '@finance-hub/core';
import {
  createSchema,
  updateSchema,
  resourceSchema,
  querySchema,
} from '../../schemas/authorized-senders.js';
import { envelope, pathSchema } from '../../schemas/configuration.js';
import { type ConfigurationOptions, meta, compare, requireResource } from './shared.js';
function serialize(record: AuthorizedSenderRecord) {
  return {
    id: record.id,
    active: record.active,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    channel: record.channel,
    sender_reference: record.senderReference,
    name: record.name,
    default_book_id: record.defaultBookId,
    default_account_id: record.defaultAccountId,
  };
}
export function registerAuthorizedSenders(
  instance: FastifyInstance,
  options: ConfigurationOptions,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post(
    '/api/v1/admin/authorized-senders',
    { schema: { body: createSchema, response: { 201: envelope(resourceSchema) } } },
    async (request, reply) => {
      const body = request.body;
      const record = await options.transactions.runInTransaction((ctx) =>
        createAuthorizedSender(
          {
            channel: body.channel,
            senderReference: body.sender_reference,
            name: body.name,
            defaultBookId: body.default_book_id,
            defaultAccountId: body.default_account_id,
            active: body.active,
          },
          ctx,
          options.now(),
        ),
      );
      return reply.code(201).send({ data: serialize(record), meta: meta(request) });
    },
  );
  app.patch(
    '/api/v1/admin/authorized-senders/:id',
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
        updateAuthorizedSender(
          {
            id: request.params.id,
            name: body.name,
            defaultBookId: body.default_book_id,
            defaultAccountId: body.default_account_id,
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
    '/api/v1/admin/authorized-senders/:id',
    { schema: { params: pathSchema, response: { 200: envelope(resourceSchema) } } },
    async (request) => {
      const record = await options.transactions.runInTransaction((ctx) =>
        getAuthorizedSender(request.params.id, ctx),
      );
      return { data: serialize(requireResource(record, 'AuthorizedSender')), meta: meta(request) };
    },
  );
  app.get(
    '/api/v1/admin/authorized-senders',
    {
      schema: { querystring: querySchema, response: { 200: envelope(Type.Array(resourceSchema)) } },
    },
    async (request) => {
      const query = request.query;
      const records = await options.transactions.runInTransaction((ctx) =>
        listAuthorizedSenders(ctx),
      );
      const filtered = records.filter(
        (record) =>
          (query.active === undefined || record.active === (query.active === 'true')) &&
          (query.channel === undefined || record.channel === query.channel),
      );
      filtered.sort((a, b) => -(compare(a.createdAt, b.createdAt) || compare(a.id, b.id)));
      return { data: filtered.map(serialize), meta: meta(request) };
    },
  );
}
