import type { FastifyInstance } from 'fastify';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { processInboxMessage, type ProcessMessageDependencies } from '@finance-hub/core';
import { inboxMessageSchema } from '../schemas/inbox.js';
import { meta } from './admin/shared.js';

export function registerInbox(instance: FastifyInstance, deps: ProcessMessageDependencies) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  app.post('/api/v1/inbox/messages', { schema: { body: inboxMessageSchema } }, async (request) => {
    const body = request.body;
    const result = await processInboxMessage(
      {
        source: 'whatsapp',
        sourceInstance: body.source_instance,
        sourceMessageId: body.source_message_id,
        senderReference: body.sender_reference,
        receivedAt: new Date(body.received_at),
        rawText: body.raw_text,
        isGroup: body.message_context.is_group,
        fromMe: body.message_context.from_me,
      },
      request.id,
      deps,
    );
    const responseMeta = { ...meta(request), duplicate: result.type === 'duplicate_message' };
    if (
      result.type === 'duplicate_message' ||
      result.type === 'processing' ||
      result.type === 'stale_claim'
    )
      return {
        data: { result: { type: result.type }, reply: { should_send: false } },
        meta: responseMeta,
      };
    if (result.type === 'ignored')
      return {
        data: { result: { type: 'ignored' }, reply: { should_send: false } },
        meta: responseMeta,
      };
    if (result.type === 'confirmation_required')
      return {
        data: {
          inbox_message: { id: result.inboxMessageId, status: result.status },
          result: {
            type: 'confirmation_required',
            confirmation: {
              id: result.confirmation.id,
              action: result.confirmation.action,
              expires_at: result.confirmation.expiresAt.toISOString(),
              options: result.confirmation.options?.map((option) => ({
                number: option.number,
                name: option.name,
              })),
            },
          },
          reply: { should_send: true },
        },
        meta: responseMeta,
      };
    if (result.type === 'transaction_created')
      return {
        data: {
          inbox_message: { id: result.inboxMessageId, status: result.status },
          result: {
            type: 'transaction_created',
            transaction: {
              id: result.transaction.id,
              human_ref: result.transaction.humanRef,
              book_id: result.transaction.bookId,
              type: result.transaction.type,
              amount: result.transaction.amount,
              transaction_date: result.transaction.transactionDate,
            },
          },
          reply: { should_send: true },
        },
        meta: responseMeta,
      };
    if (result.type === 'query_last')
      return {
        data: {
          inbox_message: { id: result.inboxMessageId, status: result.status },
          result: {
            type: 'query_last',
            transaction: result.transaction
              ? {
                  id: result.transaction.id,
                  human_ref: result.transaction.humanRef,
                  book_id: result.transaction.bookId,
                  type: result.transaction.type,
                  amount: result.transaction.amount,
                  transaction_date: result.transaction.transactionDate,
                }
              : null,
          },
          reply: { should_send: true },
        },
        meta: responseMeta,
      };
    return {
      data: {
        inbox_message: { id: result.inboxMessageId, status: result.status },
        result: { type: result.type },
        reply: { should_send: true },
      },
      meta: responseMeta,
    };
  });
}
