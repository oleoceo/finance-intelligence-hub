import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './index.js';
import type { InboxProcessingResult } from '@finance-hub/core';

const override = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('@finance-hub/core', async (importOriginal) => {
  const original = await importOriginal<
    {
      processInboxMessage: (...args: unknown[]) => unknown;
    } & Record<string, unknown>
  >();
  return {
    ...original,
    processInboxMessage: (...args: unknown[]) =>
      override.result ?? original.processInboxMessage(...args),
  };
});

describe('Inbox API boundary', () => {
  const body = {
    source: 'whatsapp',
    source_instance: 'unit',
    source_message_id: 'id',
    sender_reference: '5511999999999',
    received_at: '2026-10-21T12:00:00Z',
    raw_text: 'private',
    message_context: { is_group: true, from_me: false },
  };

  it('authenticates before body validation and isolates scopes', async () => {
    const app = buildApp({ adminToken: 'admin-unit', ingestToken: 'ingest-unit' });
    try {
      const send = (token: string, payload: unknown) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: `Bearer ${token}` },
          payload: payload as Record<string, unknown>,
        });
      expect((await send('wrong', {})).statusCode).toBe(401);
      expect((await send('admin-unit', {})).statusCode).toBe(403);
      expect((await send('ingest-unit', {})).statusCode).toBe(422);
      const direct = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { authorization: 'Bearer ingest-unit' },
        payload: {},
      });
      expect(direct.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('filters group and from_me messages without calling persistence', async () => {
    const claim = vi.fn();
    const app = buildApp({
      adminToken: 'admin-unit',
      ingestToken: 'ingest-unit',
      inboxTransactions: { runInTransaction: claim },
    });
    try {
      for (const context of [
        { is_group: true, from_me: false },
        { is_group: false, from_me: true },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: 'Bearer ingest-unit' },
          payload: { ...body, message_context: context },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().data.result.type).toBe('ignored');
      }
      expect(claim).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('serializes every reply category and suppresses unsupported outcomes without writes', async () => {
    const financialWrite = vi.fn();
    const app = buildApp({
      adminToken: 'admin-unit',
      ingestToken: 'ingest-unit',
      inboxTransactions: { runInTransaction: financialWrite },
    });
    const send = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: 'Bearer ingest-unit' },
          payload: { ...body, message_context: { is_group: false, from_me: false } },
        })
      ).json().data;
    const base = { inboxMessageId: 'inbox', status: 'processed' as const };
    const cases: Array<[InboxProcessingResult, boolean]> = [
      [
        {
          ...base,
          type: 'transaction_created',
          transaction: {
            id: 'tx',
            humanRef: 'ABC123',
            bookId: 'book',
            type: 'expense',
            amount: '35.00',
            transactionDate: '2026-10-28',
          } as Extract<InboxProcessingResult, { type: 'transaction_created' }>['transaction'],
          replyText: '✅ Gasto registrado!',
        },
        true,
      ],
      [
        {
          ...base,
          type: 'query_last',
          transaction: null,
          replyText: 'Nenhum lançamento encontrado neste contexto.',
        },
        true,
      ],
      [
        {
          type: 'confirmation_required',
          inboxMessageId: 'inbox',
          status: 'needs_confirmation',
          confirmation: {
            id: 'session',
            action: 'select_book',
            expiresAt: new Date('2026-10-28T12:15:00Z'),
            options: [
              { number: '1', id: 'private-1', name: 'Casa' },
              { number: '2', id: 'private-2', name: 'Empresa' },
            ],
          },
          replyText: 'Escolha o contexto',
        },
        true,
      ],
      [{ ...base, type: 'cancelled', replyText: '✅ Solicitação pendente cancelada.' }, true],
      [{ ...base, type: 'expired', replyText: '⏳ Esta confirmação expirou.' }, true],
      [{ ...base, type: 'choice' }, false],
      [{ type: 'ignored' }, false],
      [{ type: 'duplicate_message' }, false],
      [{ type: 'processing' }, false],
      [{ type: 'stale_claim' }, false],
    ];
    try {
      for (const [result, expectedSend] of cases) {
        override.result = expectedSend
          ? { ...result, replyContract: { version: 'm06-p03-v1', maxCodePoints: 500 } }
          : result;
        const data = await send();
        expect(data.reply.should_send).toBe(expectedSend);
        expect('text' in data.reply).toBe(expectedSend);
        if (expectedSend)
          expect(data.reply.contract).toEqual({ version: 'm06-p03-v1', max_code_points: 500 });
      }
      override.result = { ...base, type: 'cancelled', replyText: 'unsafe without contract' };
      expect((await send()).reply).toEqual({ should_send: false });
      expect(financialWrite).not.toHaveBeenCalled();
    } finally {
      override.result = null;
      await app.close();
    }
  });
});
