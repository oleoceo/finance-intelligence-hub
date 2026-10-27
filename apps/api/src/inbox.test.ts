import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './index.js';

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
});
