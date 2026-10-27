import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { buildApp } from '../../../apps/api/src/index.js';
import { claimInboxMessage, interpretMessage } from '@finance-hub/core';
import {
  KyselyConfirmationSessionRepository,
  KyselyFinancialTransactionPort,
  KyselyInboxMessageRepository,
  KyselyInboxTransactionPort,
} from '@finance-hub/database';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-21T12:00:00Z');
const senderReference = '5511998877665';
let app: ReturnType<typeof buildApp>;
let bookId: string;
let accountId: string;
let destinationId: string;
let senderId: string;

function body(
  rawText: string,
  sourceMessageId = randomUUID(),
  context = { is_group: false, from_me: false },
) {
  return {
    source: 'whatsapp',
    source_instance: 'integration',
    source_message_id: sourceMessageId,
    sender_reference: senderReference,
    received_at: now.toISOString(),
    raw_text: rawText,
    message_context: context,
  };
}
function post(payload: Record<string, unknown>, authorization = 'Bearer integration-ingest') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/inbox/messages',
    headers: { authorization },
    payload,
  });
}
function buildForConnection(options: Parameters<typeof buildApp>[0] = {}) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fixture.connectionString;
  try {
    return buildApp({
      adminToken: 'integration-admin',
      ingestToken: 'integration-ingest',
      now: () => now,
      ...options,
    });
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}
async function count(
  table:
    'inbox_messages' | 'interpretations' | 'transactions' | 'audit_events' | 'idempotency_keys',
) {
  const row = await fixture.db
    .selectFrom(table)
    .select(fixture.db.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

beforeAll(async () => {
  bookId = randomUUID();
  accountId = randomUUID();
  destinationId = randomUUID();
  senderId = randomUUID();
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: bookId,
      name: 'Empresa',
      normalizedName: 'empresa',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const [id, name] of [
      [accountId, 'Nubank'],
      [destinationId, 'Caixa'],
    ] as const)
      await ctx.accounts.create({
        id,
        bookId,
        name,
        normalizedName: name.toLowerCase(),
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    await ctx.authorizedSenders.create({
      id: senderId,
      channel: 'whatsapp',
      senderReference,
      name: 'Sender',
      defaultBookId: bookId,
      defaultAccountId: accountId,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
  app = buildForConnection();
  await app.ready();
}, 180000);
afterAll(async () => {
  if (app) await app.close();
});

describe('P05 Inbox API with PostgreSQL', () => {
  it('authenticates before schema validation and keeps scopes separate', async () => {
    expect((await post({ raw_text: 'x' }, 'Bearer wrong')).statusCode).toBe(401);
    expect((await post({ raw_text: 'x' }, 'Bearer integration-admin')).statusCode).toBe(403);
    expect((await post({ raw_text: 'x' })).statusCode).toBe(422);
    const direct = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer integration-ingest' },
      payload: {},
    });
    expect(direct.statusCode).toBe(403);
  });

  it('persists no raw Inbox for unauthorized sender and filters groups before persistence', async () => {
    const before = await count('inbox_messages');
    const unauthorized = await post({
      ...body('gastei 35 almoço'),
      sender_reference: '5511888777666',
    });
    expect(unauthorized.statusCode).toBe(403);
    expect(unauthorized.json().error.code).toBe('SENDER_NOT_AUTHORIZED');
    expect(
      (
        await post(body('gastei 35 almoço', randomUUID(), { is_group: true, from_me: false }))
      ).json().data.result.type,
    ).toBe('ignored');
    expect(await count('inbox_messages')).toBe(before);
  });

  it('creates Expense, Income and Transfer once, with Inbox provenance and Audit', async () => {
    for (const [text, type] of [
      ['gastei 35 almoço', 'expense'],
      ['recebi 40 salário', 'income'],
      ['transferi 10 Nubank para Caixa', 'transfer'],
    ] as const) {
      const request = body(text);
      const before = {
        transactions: await count('transactions'),
        audits: await count('audit_events'),
        keys: await count('idempotency_keys'),
      };
      const first = await post(request);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().data.result.type).toBe('transaction_created');
      const id = first.json().data.inbox_message.id as string;
      const transaction = await fixture.db
        .selectFrom('transactions')
        .selectAll()
        .where('inbox_message_id', '=', id)
        .executeTakeFirstOrThrow();
      expect(transaction.type).toBe(type);
      expect(transaction.source).toBe('whatsapp');
      expect(transaction.source_reference).toBe(request.source_message_id);
      expect(await count('transactions')).toBe(before.transactions + 1);
      expect(await count('audit_events')).toBe(before.audits + 1);
      expect(await count('idempotency_keys')).toBe(before.keys + 1);
      const replay = await post(request);
      expect(replay.json().data.result.type).toBe('duplicate_message');
      expect(replay.json().data.reply.should_send).toBe(false);
      expect(await count('transactions')).toBe(before.transactions + 1);
    }
  });

  it('executes query_last in the authorized Book with zero financial writes', async () => {
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    for (const text of ['último', 'último empresa']) {
      const result = await post(body(text));
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().data.result.type).toBe('query_last');
      expect(result.json().data.result.transaction.book_id).toBe(bookId);
    }
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });

  it('opens a clarification and cancels it with a contextual reply', async () => {
    const initial = await post(body('gastei 12', randomUUID()));
    expect(initial.statusCode, initial.body).toBe(200);
    expect(initial.json().data.result.type).toBe('confirmation_required');
    const reply = await post(body('não'));
    expect(reply.statusCode, reply.body).toBe(200);
    expect(reply.json().data.result.type).toBe('cancelled');
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', initial.json().data.result.confirmation.id)
      .executeTakeFirstOrThrow();
    expect(session.status).toBe('cancelled');
    expect(
      (
        await fixture.db
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', initial.json().data.inbox_message.id)
          .executeTakeFirstOrThrow()
      ).processing_status,
    ).toBe('ignored');
  });

  it('rolls back Transaction, Audit, idempotency and interpretation on Audit failure, then retries the same Inbox row', async () => {
    await sql`CREATE FUNCTION p05_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked audit'; END $$`.execute(
      fixture.db,
    );
    await sql`CREATE TRIGGER p05_fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION p05_fail_audit()`.execute(
      fixture.db,
    );
    const request = body('gastei 19 lanche');
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
      interpretations: await count('interpretations'),
    };
    try {
      const failed = await post(request);
      expect(failed.statusCode, failed.body).toBe(500);
    } finally {
      await sql`DROP TRIGGER p05_fail_audit ON audit_events`.execute(fixture.db);
      await sql`DROP FUNCTION p05_fail_audit()`.execute(fixture.db);
    }
    const inbox = await fixture.db
      .selectFrom('inbox_messages')
      .selectAll()
      .where('source_message_id', '=', request.source_message_id)
      .executeTakeFirstOrThrow();
    expect(inbox.processing_status).toBe('failed');
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
    expect(await count('interpretations')).toBe(before.interpretations);
    const retry = await post(request);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().data.inbox_message.id).toBe(inbox.id);
    expect(
      (
        await fixture.db
          .selectFrom('inbox_messages')
          .select('attempt_count')
          .where('id', '=', inbox.id)
          .executeTakeFirstOrThrow()
      ).attempt_count,
    ).toBe(2);
  });

  it('rolls back the whole effect when financial, idempotency or final Inbox writes fail', async () => {
    await sql`CREATE FUNCTION p05_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked write'; END $$`.execute(
      fixture.db,
    );
    try {
      for (const target of ['transactions', 'idempotency_keys', 'inbox_messages'] as const) {
        if (target === 'transactions')
          await sql`CREATE TRIGGER p05_fail_write BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION p05_fail_write()`.execute(
            fixture.db,
          );
        else if (target === 'idempotency_keys')
          await sql`CREATE TRIGGER p05_fail_write BEFORE INSERT ON idempotency_keys FOR EACH ROW EXECUTE FUNCTION p05_fail_write()`.execute(
            fixture.db,
          );
        else
          await sql`CREATE TRIGGER p05_fail_write BEFORE UPDATE ON inbox_messages FOR EACH ROW WHEN (NEW.processing_status = 'processed') EXECUTE FUNCTION p05_fail_write()`.execute(
            fixture.db,
          );
        const request = body('gastei 21 almoço');
        const before = {
          transactions: await count('transactions'),
          audits: await count('audit_events'),
          keys: await count('idempotency_keys'),
          interpretations: await count('interpretations'),
        };
        try {
          const result = await post(request);
          expect(result.statusCode, `${target}: ${result.body}`).toBe(500);
        } finally {
          if (target === 'transactions')
            await sql`DROP TRIGGER p05_fail_write ON transactions`.execute(fixture.db);
          else if (target === 'idempotency_keys')
            await sql`DROP TRIGGER p05_fail_write ON idempotency_keys`.execute(fixture.db);
          else await sql`DROP TRIGGER p05_fail_write ON inbox_messages`.execute(fixture.db);
        }
        expect(await count('transactions')).toBe(before.transactions);
        expect(await count('audit_events')).toBe(before.audits);
        expect(await count('idempotency_keys')).toBe(before.keys);
        expect(await count('interpretations')).toBe(before.interpretations);
        expect(
          (
            await fixture.db
              .selectFrom('inbox_messages')
              .select('processing_status')
              .where('source_message_id', '=', request.source_message_id)
              .executeTakeFirstOrThrow()
          ).processing_status,
        ).toBe('failed');
      }
    } finally {
      await sql`DROP FUNCTION p05_fail_write()`.execute(fixture.db);
    }
  });

  it('revalidates sender after a deterministic pre-lock barrier, before financial execution', async () => {
    let entered!: () => void;
    let release!: () => void;
    const atLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = new KyselyFinancialTransactionPort(fixture.db);
    const paused = buildForConnection({
      inboxProcessing: {
        runInboxTransaction: (fn) =>
          real.runInboxTransaction((ctx) =>
            fn({
              ...ctx,
              locks: {
                acquireLocks: async (spec) => {
                  entered();
                  await proceed;
                  await ctx.locks.acquireLocks(spec);
                },
              },
            }),
          ),
      },
    });
    await paused.ready();
    const request = body('gastei 23 café');
    const before = await count('transactions');
    try {
      const inFlight = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: request,
      });
      await atLock;
      await fixture.db
        .updateTable('authorized_senders')
        .set({ active: false, updated_at: now })
        .where('id', '=', senderId)
        .execute();
      release();
      const result = await inFlight;
      expect(result.statusCode, result.body).toBe(403);
      expect(result.json().error.code).toBe('SENDER_NOT_AUTHORIZED');
      expect(await count('transactions')).toBe(before);
    } finally {
      release();
      await fixture.db
        .updateTable('authorized_senders')
        .set({ active: true, updated_at: now })
        .where('id', '=', senderId)
        .execute();
      await paused.close();
    }
  });

  it('releases the P01 sender lock before processing; duplicate and stale workers cannot create twice', async () => {
    let entered!: () => void;
    let release!: () => void;
    const atLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = new KyselyFinancialTransactionPort(fixture.db);
    const paused = buildForConnection({
      inboxProcessing: {
        runInboxTransaction: (fn) =>
          real.runInboxTransaction((ctx) =>
            fn({
              ...ctx,
              locks: {
                acquireLocks: async (spec) => {
                  entered();
                  await proceed;
                  await ctx.locks.acquireLocks(spec);
                },
              },
            }),
          ),
      },
    });
    await paused.ready();
    const request = body('gastei 27 almoço');
    const before = await count('transactions');
    try {
      const first = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: request,
      });
      await atLock;
      const duplicate = await post(request);
      expect(duplicate.statusCode, duplicate.body).toBe(200);
      expect(duplicate.json().data.result.type).toBe('processing');
      const later = buildForConnection({ now: () => new Date(now.getTime() + 120_000) });
      await later.ready();
      try {
        const reclaimed = await later.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: 'Bearer integration-ingest' },
          payload: request,
        });
        expect(reclaimed.statusCode, reclaimed.body).toBe(200);
        expect(reclaimed.json().data.result.type).toBe('transaction_created');
      } finally {
        await later.close();
      }
      release();
      const old = await first;
      expect(old.json().data.result.type).toBe('stale_claim');
      expect(await count('transactions')).toBe(before + 1);
      const row = await fixture.db
        .selectFrom('inbox_messages')
        .selectAll()
        .where('source_message_id', '=', request.source_message_id)
        .executeTakeFirstOrThrow();
      expect(row.attempt_count).toBe(2);
      expect(row.processing_status).toBe('processed');
    } finally {
      release();
      await paused.close();
    }
  });

  it('withholds query_last data when the sender is revoked before the read boundary', async () => {
    let entered!: () => void;
    let release!: () => void;
    const atLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = new KyselyFinancialTransactionPort(fixture.db);
    const paused = buildForConnection({
      inboxProcessing: {
        runInboxTransaction: (fn) =>
          real.runInboxTransaction((ctx) =>
            fn({
              ...ctx,
              locks: {
                acquireLocks: async (spec) => {
                  entered();
                  await proceed;
                  await ctx.locks.acquireLocks(spec);
                },
              },
            }),
          ),
      },
    });
    await paused.ready();
    try {
      const inFlight = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: body('último'),
      });
      await atLock;
      await fixture.db
        .updateTable('authorized_senders')
        .set({ active: false, updated_at: now })
        .where('id', '=', senderId)
        .execute();
      release();
      const result = await inFlight;
      expect(result.statusCode).toBe(403);
      expect(result.body).not.toContain('human_ref');
    } finally {
      release();
      await fixture.db
        .updateTable('authorized_senders')
        .set({ active: true, updated_at: now })
        .where('id', '=', senderId)
        .execute();
      await paused.close();
    }
  });

  it('restarts the whole transaction when the discovered configuration lock set changes', async () => {
    let entered!: () => void;
    let release!: () => void;
    const atLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let lockAttempts = 0;
    const real = new KyselyFinancialTransactionPort(fixture.db);
    const paused = buildForConnection({
      inboxProcessing: {
        runInboxTransaction: (fn) =>
          real.runInboxTransaction((ctx) =>
            fn({
              ...ctx,
              locks: {
                acquireLocks: async (spec) => {
                  lockAttempts++;
                  if (lockAttempts === 1) {
                    entered();
                    await proceed;
                  }
                  await ctx.locks.acquireLocks(spec);
                },
              },
            }),
          ),
      },
    });
    await paused.ready();
    try {
      const inFlight = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: body('gastei 29 almoço'),
      });
      await atLock;
      const addedId = randomUUID();
      await fixture.run(async (ctx) =>
        ctx.books.create({
          id: addedId,
          name: addedId,
          normalizedName: addedId,
          currency: 'BRL',
          timezone: 'America/Sao_Paulo',
          active: true,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );
      release();
      const result = await inFlight;
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().data.result.type).toBe('transaction_created');
      expect(lockAttempts).toBe(2);
    } finally {
      release();
      await paused.close();
    }
  });

  it('confirms a prepared financial command atomically with both Inbox rows', async () => {
    const originalText = 'gastei 7 café';
    const claim = await claimInboxMessage(
      {
        source: 'whatsapp',
        sourceInstance: 'integration',
        sourceMessageId: randomUUID(),
        senderReference,
        receivedAt: now,
        rawText: originalText,
        isGroup: false,
        fromMe: false,
      },
      new KyselyInboxTransactionPort(fixture.db),
      { id: randomUUID(), correlationId: randomUUID(), now, staleTimeoutMs: 60_000 },
    );
    expect(claim?.claimed).toBe(true);
    const originalId = claim!.message.id;
    await fixture.db.transaction().execute(async (tx) => {
      const inbox = new KyselyInboxMessageRepository(tx);
      await inbox.transition({
        id: originalId,
        attemptCount: claim!.attemptCount,
        processingStartedAt: claim!.processingStartedAt!,
        status: 'needs_confirmation',
        now,
      });
      const confirmations = new KyselyConfirmationSessionRepository(tx);
      await confirmations.create({
        id: randomUUID(),
        channel: 'whatsapp',
        senderReference,
        authorizedSenderId: senderId,
        inboxMessageId: originalId,
        action: 'create_transaction',
        payload: { interpretation: interpretMessage({ rawText: originalText }) },
        now,
      });
    });
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const reply = await post(body('sim'));
    expect(reply.statusCode, reply.body).toBe(200);
    expect(reply.json().data.result.type).toBe('transaction_created');
    const effect = await fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('inbox_message_id', '=', originalId)
      .executeTakeFirstOrThrow();
    expect(effect.source).toBe('whatsapp');
    expect(await count('transactions')).toBe(before.transactions + 1);
    expect(await count('audit_events')).toBe(before.audits + 1);
    expect(await count('idempotency_keys')).toBe(before.keys + 1);
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('inbox_message_id', '=', originalId)
      .executeTakeFirstOrThrow();
    expect(session.status).toBe('confirmed');
    const rows = await fixture.db
      .selectFrom('inbox_messages')
      .select('processing_status')
      .where('id', 'in', [originalId, reply.json().data.inbox_message.id])
      .execute();
    expect(rows.map((row) => row.processing_status)).toEqual(['processed', 'processed']);
  });

  it('keeps a ready Confirmation pending when the financial write fails', async () => {
    const originalText = 'gastei 9 café';
    const claim = await claimInboxMessage(
      {
        source: 'whatsapp',
        sourceInstance: 'integration',
        sourceMessageId: randomUUID(),
        senderReference,
        receivedAt: now,
        rawText: originalText,
        isGroup: false,
        fromMe: false,
      },
      new KyselyInboxTransactionPort(fixture.db),
      { id: randomUUID(), correlationId: randomUUID(), now, staleTimeoutMs: 60_000 },
    );
    const originalId = claim!.message.id;
    const sessionId = randomUUID();
    await fixture.db.transaction().execute(async (tx) => {
      await new KyselyInboxMessageRepository(tx).transition({
        id: originalId,
        attemptCount: claim!.attemptCount,
        processingStartedAt: claim!.processingStartedAt!,
        status: 'needs_confirmation',
        now,
      });
      await new KyselyConfirmationSessionRepository(tx).create({
        id: sessionId,
        channel: 'whatsapp',
        senderReference,
        authorizedSenderId: senderId,
        inboxMessageId: originalId,
        action: 'create_transaction',
        payload: { interpretation: interpretMessage({ rawText: originalText }) },
        now,
      });
    });
    await sql`CREATE FUNCTION p05_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked audit'; END $$`.execute(
      fixture.db,
    );
    await sql`CREATE TRIGGER p05_fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION p05_fail_audit()`.execute(
      fixture.db,
    );
    const before = await count('transactions');
    const replyRequest = body('sim');
    try {
      const reply = await post(replyRequest);
      expect(reply.statusCode).toBe(500);
    } finally {
      await sql`DROP TRIGGER p05_fail_audit ON audit_events`.execute(fixture.db);
      await sql`DROP FUNCTION p05_fail_audit()`.execute(fixture.db);
    }
    expect(await count('transactions')).toBe(before);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('pending');
    expect(
      (
        await fixture.db
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', originalId)
          .executeTakeFirstOrThrow()
      ).processing_status,
    ).toBe('needs_confirmation');
    const retry = await post(replyRequest);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.result.type).toBe('transaction_created');
  });

  it('supersedes an old confirmation and expires a late reply without financial effect', async () => {
    const old = await post(body('gastei 11'));
    expect(old.json().data.result.type).toBe('confirmation_required');
    const newCommand = await post(body('gastei 11 almoço'));
    expect(newCommand.json().data.result.type).toBe('transaction_created');
    const oldSession = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', old.json().data.result.confirmation.id)
      .executeTakeFirstOrThrow();
    expect(oldSession.resolution_reason).toBe('superseded_by_new_command');
    const expiring = await post(body('gastei 13'));
    const later = buildForConnection({ now: () => new Date(now.getTime() + 16 * 60_000) });
    await later.ready();
    const before = await count('transactions');
    try {
      const reply = await later.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: body('sim'),
      });
      expect(reply.statusCode, reply.body).toBe(200);
      expect(reply.json().data.result.type).toBe('expired');
      expect(await count('transactions')).toBe(before);
      const session = await fixture.db
        .selectFrom('confirmation_sessions')
        .select('status')
        .where('id', '=', expiring.json().data.result.confirmation.id)
        .executeTakeFirstOrThrow();
      expect(session.status).toBe('expired');
    } finally {
      await later.close();
    }
  });
});
