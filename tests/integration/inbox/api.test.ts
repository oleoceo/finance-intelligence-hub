import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { buildApp } from '../../../apps/api/src/index.js';
import { claimInboxMessage, interpretMessage } from '@finance-hub/core';
import {
  KyselyConfirmationSessionRepository,
  KyselyFinancialTransactionPort,
  KyselyInboxMessageRepository,
  KyselyInboxTransactionPort,
} from '@finance-hub/database';
import { t02Database } from '../repositories/t02-fixtures.js';
import type { DB } from '../../../packages/database/src/db-types.js';

const fixture = t02Database();
const now = new Date('2026-10-21T12:00:00Z');
const senderReference = '5511998877665';
let app: ReturnType<typeof buildApp>;
let bookId: string;
let secondBookId: string;
let secondAccountId: string;
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
  secondBookId = randomUUID();
  secondAccountId = randomUUID();
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
    await ctx.books.create({
      id: secondBookId,
      name: 'Pessoal',
      normalizedName: 'pessoal',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.accounts.create({
      id: secondAccountId,
      bookId: secondBookId,
      name: 'Pessoal',
      normalizedName: 'pessoal',
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
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

  it('keeps one committed effect after a lost response and a verified same-identity replay', async () => {
    const request = body('gastei 35 almoço');
    const before = {
      inbox: await count('inbox_messages'),
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const committed = await post(request);
    expect(committed.statusCode).toBe(200);
    expect(committed.json().data.result.type).toBe('transaction_created');
    // The caller discards the response after Finance commits, then retries the exact envelope.
    const replay = await post(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.result.type).toBe('duplicate_message');
    expect(replay.json().data.reply).toEqual({ should_send: false });
    const inboxId = committed.json().data.inbox_message.id as string;
    const inboxRows = await fixture.db
      .selectFrom('inbox_messages')
      .select(['id', 'source_instance', 'source_message_id'])
      .where('source_instance', '=', request.source_instance)
      .where('source_message_id', '=', request.source_message_id)
      .execute();
    expect(inboxRows).toEqual([
      {
        id: inboxId,
        source_instance: request.source_instance,
        source_message_id: request.source_message_id,
      },
    ]);
    const rows = await fixture.db
      .selectFrom('transactions')
      .select(['id', 'inbox_message_id'])
      .where('inbox_message_id', '=', inboxId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.inbox_message_id).toBe(inboxId);
    expect(await count('inbox_messages')).toBe(before.inbox + 1);
    expect(await count('transactions')).toBe(before.transactions + 1);
    expect(await count('audit_events')).toBe(before.audits + 1);
    expect(await count('idempotency_keys')).toBe(before.keys + 1);
  });

  it('overlaps same-identity financial processing on independent PostgreSQL connections without another effect', async () => {
    const firstPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const secondPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let entered!: () => void;
    let release!: () => void;
    const atFinancialBoundary = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstPort = new KyselyFinancialTransactionPort(firstDb);
    const firstApp = buildForConnection({
      inboxTransactions: new KyselyInboxTransactionPort(firstDb),
      financialTransactions: firstPort,
      inboxProcessing: {
        runInboxTransaction: (fn) =>
          firstPort.runInboxTransaction(async (ctx) => {
            entered();
            await gate;
            return fn(ctx);
          }),
      },
    });
    const secondApp = buildForConnection({
      inboxTransactions: new KyselyInboxTransactionPort(secondDb),
      financialTransactions: new KyselyFinancialTransactionPort(secondDb),
    });
    const request = body('gastei 35 almoco');
    const before = {
      inbox: await count('inbox_messages'),
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const postWith = (target: typeof firstApp) =>
      target.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: request,
      });
    try {
      await Promise.all([firstApp.ready(), secondApp.ready()]);
      const pid1 = (await firstPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      const first = postWith(firstApp);
      await atFinancialBoundary;
      const competing = await postWith(secondApp);
      expect(competing.statusCode, competing.body).toBe(200);
      expect(competing.json().data.result.type).toBe('processing');
      expect(competing.json().data.reply).toEqual({ should_send: false });
      release();
      const winner = await first;
      expect(winner.statusCode, winner.body).toBe(200);
      expect(winner.json().data.result.type).toBe('transaction_created');
      const inboxId = winner.json().data.inbox_message.id as string;
      const inbox = await fixture.db
        .selectFrom('inbox_messages')
        .selectAll()
        .where('source', '=', request.source)
        .where('source_instance', '=', request.source_instance)
        .where('source_message_id', '=', request.source_message_id)
        .execute();
      expect(inbox).toHaveLength(1);
      expect(inbox[0]).toMatchObject({
        id: inboxId,
        authorized_sender_id: senderId,
        processing_status: 'processed',
        attempt_count: 1,
      });
      const transactions = await fixture.db
        .selectFrom('transactions')
        .selectAll()
        .where('inbox_message_id', '=', inboxId)
        .execute();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        status: 'posted',
        source: 'whatsapp',
        source_reference: request.source_message_id,
      });
      const audits = await fixture.db
        .selectFrom('audit_events')
        .selectAll()
        .where('entity_type', '=', 'transaction')
        .where('entity_id', '=', transactions[0]!.id)
        .execute();
      expect(audits).toHaveLength(1);
      const keys = await fixture.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('resource_id', '=', transactions[0]!.id)
        .execute();
      expect(keys).toHaveLength(1);
      expect(keys[0]?.status).toBe('completed');
      const replay = await postWith(secondApp);
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.json().data.result.type).toBe('duplicate_message');
      expect(replay.json().data.reply).toEqual({ should_send: false });
      expect(
        await fixture.db
          .selectFrom('transactions')
          .select('id')
          .where('inbox_message_id', '=', inboxId)
          .execute(),
      ).toHaveLength(1);
      expect(
        await fixture.db
          .selectFrom('audit_events')
          .select('id')
          .where('entity_type', '=', 'transaction')
          .where('entity_id', '=', transactions[0]!.id)
          .execute(),
      ).toHaveLength(1);
      expect(
        await fixture.db
          .selectFrom('idempotency_keys')
          .select('id')
          .where('resource_id', '=', transactions[0]!.id)
          .execute(),
      ).toHaveLength(1);
      expect(await count('inbox_messages')).toBe(before.inbox + 1);
      expect(await count('transactions')).toBe(before.transactions + 1);
      expect(await count('audit_events')).toBe(before.audits + 1);
      expect(await count('idempotency_keys')).toBe(before.keys + 1);
    } finally {
      release();
      await Promise.all([firstApp.close(), secondApp.close()]);
      await Promise.all([firstDb.destroy(), secondDb.destroy()]);
    }
  }, 30000);

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
      await fixture.db
        .updateTable('books')
        .set({ active: false, archived_at: now, updated_at: now })
        .where('id', '=', addedId)
        .execute();
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

  it('keeps numeric choices contextual and rejects a duplicate reply', async () => {
    const initial = await post(body('gastei 18'));
    expect(initial.json().data.result.type).toBe('confirmation_required');
    const before = await count('transactions');
    const choiceRequest = body('1');
    const choice = await post(choiceRequest);
    expect(choice.statusCode, choice.body).toBe(200);
    expect(choice.json().data.result.type).toBe('confirmation_required');
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', initial.json().data.result.confirmation.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('pending');
    expect(await count('transactions')).toBe(before);
    const duplicate = await post(choiceRequest);
    expect(duplicate.json().data.result.type).toBe('duplicate_message');
    expect(duplicate.json().data.reply.should_send).toBe(false);
    const affirmative = await post(body('sim'));
    expect(affirmative.json().data.result.type).toBe('confirmation_required');
    expect(await count('transactions')).toBe(before);
    expect((await post(body('não'))).json().data.result.type).toBe('cancelled');
  });

  it('preserves pending intent for unknown, unsupported and incomplete messages', async () => {
    const original = await post(body('gastei 12'));
    const originalId = original.json().data.inbox_message.id as string;
    const sessionId = original.json().data.result.confirmation.id as string;
    const before = await count('transactions');
    for (const text of ['oi', 'resumo', 'gastei', 'gastei 13']) {
      const result = await post(body(text));
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().data.result.type).toBe('confirmation_required');
      expect(result.json().data.result.confirmation.id).toBe(sessionId);
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
    }
    expect(await count('transactions')).toBe(before);
    expect((await post(body('gastei 14 cafe'))).json().data.result.type).toBe(
      'transaction_created',
    );
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('resolution_reason')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).resolution_reason,
    ).toBe('superseded_by_new_command');
    const pendingRead = await post(body('gastei 16'));
    const pendingReadId = pendingRead.json().data.result.confirmation.id as string;
    const beforeRead = await count('transactions');
    const read = await post(body('último'));
    expect(read.json().data.result.type).toBe('query_last');
    expect(await count('transactions')).toBe(beforeRead);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('resolution_reason')
          .where('id', '=', pendingReadId)
          .executeTakeFirstOrThrow()
      ).resolution_reason,
    ).toBe('superseded_by_new_command');
  });

  it('resolves offered account choice once and rejects out-of-range input', async () => {
    const reference = '5511666555444';
    await fixture.run(async (ctx) =>
      ctx.authorizedSenders.create({
        id: randomUUID(),
        channel: 'whatsapp',
        senderReference: reference,
        name: 'Choice sender',
        defaultBookId: bookId,
        defaultAccountId: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const request = (text: string, sourceMessageId = randomUUID()) => ({
      ...body(text, sourceMessageId),
      sender_reference: reference,
    });
    const original = await post(request('gastei 18 cafe'));
    expect(original.statusCode, original.body).toBe(200);
    expect(original.json().data.result.confirmation.action).toBe('select_account');
    const options = original.json().data.result.confirmation.options as {
      number: string;
      name: string;
    }[];
    expect(options).toHaveLength(2);
    const originalId = original.json().data.inbox_message.id as string;
    const before = await count('transactions');
    const invalid = await post(request('3'));
    expect(invalid.json().data.result.type).toBe('confirmation_required');
    expect(await count('transactions')).toBe(before);
    const selection = request('2');
    const selectedAccount = await fixture.db
      .selectFrom('accounts')
      .select('id')
      .where('name', '=', options[1]!.name)
      .where('book_id', '=', bookId)
      .executeTakeFirstOrThrow();
    await fixture.db
      .updateTable('accounts')
      .set({ active: false, archived_at: now, updated_at: now })
      .where('id', '=', selectedAccount.id)
      .execute();
    try {
      const stale = await post(request('2'));
      expect(stale.json().data.result.type).toBe('confirmation_required');
      expect(await count('transactions')).toBe(before);
    } finally {
      await fixture.db
        .updateTable('accounts')
        .set({ active: true, archived_at: null, updated_at: now })
        .where('id', '=', selectedAccount.id)
        .execute();
    }
    const chosen = await post(selection);
    expect(chosen.statusCode, chosen.body).toBe(200);
    expect(chosen.json().data.result.type).toBe('transaction_created');
    expect(
      (
        await fixture.db
          .selectFrom('transactions')
          .select('account_id')
          .where('inbox_message_id', '=', originalId)
          .executeTakeFirstOrThrow()
      ).account_id,
    ).toBe(selectedAccount.id);
    expect(await count('transactions')).toBe(before + 1);
    expect((await post(selection)).json().data.result.type).toBe('duplicate_message');
    expect(await count('transactions')).toBe(before + 1);

    const racing = await post(request('gastei 22 cafe'));
    const racingId = racing.json().data.inbox_message.id as string;
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
    const countBeforeRace = await count('transactions');
    try {
      const first = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: request('1'),
      });
      await atLock;
      const winner = await post(request('2'));
      expect(winner.json().data.result.type).toBe('transaction_created');
      release();
      const loser = await first;
      expect(loser.json().data.result.type).toBe('ignored');
      expect(await count('transactions')).toBe(countBeforeRace + 1);
      expect(
        (
          await fixture.db
            .selectFrom('transactions')
            .select(fixture.db.fn.countAll<number>().as('count'))
            .where('inbox_message_id', '=', racingId)
            .executeTakeFirstOrThrow()
        ).count,
      ).toBe('1');
    } finally {
      release();
      await paused.close();
    }
  });

  it('returns a safe empty result for a different default Book without financial writes', async () => {
    const secondSender = randomUUID();
    const secondReference = '5511777666555';
    await fixture.run(async (ctx) => {
      await ctx.authorizedSenders.create({
        id: secondSender,
        channel: 'whatsapp',
        senderReference: secondReference,
        name: 'Other sender',
        defaultBookId: secondBookId,
        defaultAccountId: secondAccountId,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const result = await post({ ...body('último'), sender_reference: secondReference });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data.result.type).toBe('query_last');
    expect(result.json().data.result.transaction).toBeNull();
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });

  it('returns only posted Transactions with created_at and id tie ordering', async () => {
    const ids: string[] = [];
    for (const amount of [31, 32, 33]) {
      const result = await post(body(`gastei ${amount} café`));
      expect(result.statusCode, result.body).toBe(200);
      ids.push(result.json().data.result.transaction.id as string);
    }
    const tieTime = new Date('2026-11-01T12:00:00Z');
    await fixture.db
      .updateTable('transactions')
      .set({ created_at: tieTime })
      .where('id', 'in', ids.slice(0, 2))
      .execute();
    await fixture.db
      .updateTable('transactions')
      .set({
        created_at: new Date('2026-11-02T12:00:00Z'),
        status: 'voided',
        voided_at: now,
        void_reason: 'test ordering',
      })
      .where('id', '=', ids[2]!)
      .execute();
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const result = await post(body('último empresa'));
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data.result.transaction.id).toBe(ids.slice(0, 2).sort().at(-1));
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });

  it('advances Book choice to Account choice and posts the original expense once', async () => {
    const reference = '5511444333222';
    await fixture.run((ctx) =>
      ctx.authorizedSenders.create({
        id: randomUUID(),
        channel: 'whatsapp',
        senderReference: reference,
        name: 'Two-step sender',
        defaultBookId: null,
        defaultAccountId: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const request = (text: string, sourceMessageId = randomUUID()) => ({
      ...body(text, sourceMessageId),
      sender_reference: reference,
    });
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    expect(
      await fixture.db.selectFrom('books').select('id').where('active', '=', true).execute(),
    ).toHaveLength(2);
    expect(
      await fixture.db
        .selectFrom('accounts')
        .select('id')
        .where('book_id', '=', bookId)
        .where('active', '=', true)
        .execute(),
    ).toHaveLength(2);
    const original = await post(request('gastei 18 café'));
    expect(original.statusCode, original.body).toBe(200);
    const originalId = original.json().data.inbox_message.id as string;
    const firstConfirmation = original.json().data.result.confirmation;
    expect(firstConfirmation.action).toBe('select_book');
    expect(firstConfirmation.options).toHaveLength(2);
    const bookChoice = firstConfirmation.options.find(
      (option: { name: string }) => option.name === 'Empresa',
    );
    expect(bookChoice).toBeDefined();
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
    const otherChoice = firstConfirmation.options.find(
      (option: { name: string }) => option.name === 'Pessoal',
    );
    let intermediate!: Awaited<ReturnType<typeof post>>;
    const competingRequest = request(otherChoice.number);
    const intermediateRequest = request(bookChoice.number);
    try {
      const competing = paused.inject({
        method: 'POST',
        url: '/api/v1/inbox/messages',
        headers: { authorization: 'Bearer integration-ingest' },
        payload: competingRequest,
      });
      await atLock;
      intermediate = await post(intermediateRequest);
      release();
      const stale = await competing;
      expect(stale.statusCode, stale.body).toBe(200);
      expect(stale.json().data.result.confirmation.action).toBe('select_account');
      expect(await count('transactions')).toBe(before.transactions);
    } finally {
      release();
      await paused.close();
    }
    expect(intermediate.statusCode, intermediate.body).toBe(200);
    const secondConfirmation = intermediate.json().data.result.confirmation;
    expect(secondConfirmation.action).toBe('select_account');
    expect(secondConfirmation.id).toBe(firstConfirmation.id);
    expect(
      secondConfirmation.options.map((option: { name: string }) => option.name).sort(),
    ).toEqual(['Caixa', 'Nubank']);
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .selectAll()
      .where('id', '=', firstConfirmation.id)
      .executeTakeFirstOrThrow();
    expect(session.status).toBe('pending');
    expect(session.inbox_message_id).toBe(originalId);
    const intermediateRows = await fixture.db
      .selectFrom('inbox_messages')
      .select(['source_message_id', 'processing_status'])
      .where('source_message_id', 'in', [
        intermediateRequest.source_message_id,
        competingRequest.source_message_id,
      ])
      .execute();
    expect(intermediateRows).toEqual(
      expect.arrayContaining([
        {
          source_message_id: intermediateRequest.source_message_id,
          processing_status: 'processed',
        },
        { source_message_id: competingRequest.source_message_id, processing_status: 'processed' },
      ]),
    );
    expect(
      (session.payload as { interpretation: { book: { value: string } } }).interpretation.book
        .value,
    ).toBe(bookId);
    expect(
      await fixture.db
        .selectFrom('confirmation_sessions')
        .select('id')
        .where('sender_reference', '=', reference)
        .where('status', '=', 'pending')
        .execute(),
    ).toHaveLength(1);
    const accountChoice = secondConfirmation.options.find(
      (option: { name: string }) => option.name === 'Caixa',
    );
    const finalRequest = request(accountChoice.number);
    const final = await post(finalRequest);
    expect(final.statusCode, final.body).toBe(200);
    expect(final.json().data.result.type).toBe('transaction_created');
    const financial = await fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('inbox_message_id', '=', originalId)
      .execute();
    expect(financial).toHaveLength(1);
    expect(financial[0]).toMatchObject({
      type: 'expense',
      status: 'posted',
      book_id: bookId,
      account_id: destinationId,
      amount: '18.00',
      description: 'café',
    });
    expect(await count('transactions')).toBe(before.transactions + 1);
    expect(await count('audit_events')).toBe(before.audits + 1);
    expect(await count('idempotency_keys')).toBe(before.keys + 1);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', firstConfirmation.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('confirmed');
    const inboxes = await fixture.db
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [originalId, final.json().data.inbox_message.id])
      .execute();
    expect(inboxes).toEqual(
      expect.arrayContaining([
        { id: originalId, processing_status: 'processed' },
        { id: final.json().data.inbox_message.id, processing_status: 'processed' },
      ]),
    );
    expect((await post(finalRequest)).json().data.result.type).toBe('duplicate_message');
    expect(await count('transactions')).toBe(before.transactions + 1);
  });

  it('asks for reformulation when a selected Book has no eligible Account', async () => {
    const reference = '5511444333225';
    await fixture.run((ctx) =>
      ctx.authorizedSenders.create({
        id: randomUUID(),
        channel: 'whatsapp',
        senderReference: reference,
        name: 'Missing account sender',
        defaultBookId: null,
        defaultAccountId: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const request = (text: string) => ({ ...body(text), sender_reference: reference });
    const original = await post(request('gastei 18 café'));
    const originalId = original.json().data.inbox_message.id as string;
    const confirmation = original.json().data.result.confirmation;
    const bookChoice = confirmation.options.find(
      (option: { name: string }) => option.name === 'Empresa',
    );
    const before = await count('transactions');
    await fixture.db
      .updateTable('accounts')
      .set({ active: false, archived_at: now, updated_at: now })
      .where('book_id', '=', bookId)
      .execute();
    try {
      const selected = await post(request(bookChoice.number));
      expect(selected.statusCode, selected.body).toBe(200);
      expect(selected.json().data.result.confirmation.action).toBe('clarify_account');
      expect(selected.json().data.result.confirmation.options).toEqual([]);
      expect(
        (
          await fixture.db
            .selectFrom('confirmation_sessions')
            .select('status')
            .where('id', '=', confirmation.id)
            .executeTakeFirstOrThrow()
        ).status,
      ).toBe('pending');
      expect(await count('transactions')).toBe(before);
    } finally {
      await fixture.db
        .updateTable('accounts')
        .set({ active: true, archived_at: null, updated_at: now })
        .where('book_id', '=', bookId)
        .execute();
    }
    const replacement = await post(request('gastei empresa 19 café conta: Nubank'));
    expect(replacement.statusCode, replacement.body).toBe(200);
    expect(replacement.json().data.result.type).toBe('transaction_created');
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('resolution_reason')
          .where('id', '=', confirmation.id)
          .executeTakeFirstOrThrow()
      ).resolution_reason,
    ).toBe('superseded_by_new_command');
    expect(
      (
        await fixture.db
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', originalId)
          .executeTakeFirstOrThrow()
      ).processing_status,
    ).toBe('ignored');
    expect(
      await fixture.db
        .selectFrom('transactions')
        .select('id')
        .where('inbox_message_id', '=', originalId)
        .execute(),
    ).toEqual([]);
  });

  it.each(['Empresa', 'Pessoal'] as const)(
    'selects Book for read-only último in %s, including empty result',
    async (name) => {
      const reference = name === 'Empresa' ? '5511444333223' : '5511444333224';
      await fixture.run((ctx) =>
        ctx.authorizedSenders.create({
          id: randomUUID(),
          channel: 'whatsapp',
          senderReference: reference,
          name: 'Read choice sender',
          defaultBookId: null,
          defaultAccountId: null,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const request = (text: string) => ({ ...body(text), sender_reference: reference });
      const before = {
        transactions: await count('transactions'),
        audits: await count('audit_events'),
        keys: await count('idempotency_keys'),
      };
      const original = await post(request('último'));
      expect(original.statusCode, original.body).toBe(200);
      const originalId = original.json().data.inbox_message.id as string;
      const confirmation = original.json().data.result.confirmation;
      expect(confirmation.action).toBe('select_book');
      expect(confirmation.options).toHaveLength(2);
      const choice = confirmation.options.find((option: { name: string }) => option.name === name);
      const selected = await post(request(choice.number));
      expect(selected.statusCode, selected.body).toBe(200);
      expect(selected.json().data.result.type).toBe('query_last');
      if (name === 'Pessoal') expect(selected.json().data.result.transaction).toBeNull();
      else expect(selected.json().data.result.transaction.book_id).toBe(bookId);
      expect(
        (
          await fixture.db
            .selectFrom('confirmation_sessions')
            .select('status')
            .where('id', '=', confirmation.id)
            .executeTakeFirstOrThrow()
        ).status,
      ).toBe('confirmed');
      const rows = await fixture.db
        .selectFrom('inbox_messages')
        .select(['id', 'processing_status'])
        .where('id', 'in', [originalId, selected.json().data.inbox_message.id])
        .execute();
      expect(rows).toEqual(
        expect.arrayContaining([
          { id: originalId, processing_status: 'processed' },
          { id: selected.json().data.inbox_message.id, processing_status: 'processed' },
        ]),
      );
      expect(await count('transactions')).toBe(before.transactions);
      expect(await count('audit_events')).toBe(before.audits);
      expect(await count('idempotency_keys')).toBe(before.keys);
    },
  );

  it('corrects an explicit Transaction directly with one version step and preserved creator Inbox', async () => {
    const created = await post(body('gastei 500 compra teste P05'));
    expect(created.statusCode, created.body).toBe(200);
    const target = created.json().data.result.transaction;
    const originalInboxId = created.json().data.inbox_message.id;
    const before = { audits: await count('audit_events'), keys: await count('idempotency_keys') };
    const corrected = await post(body(`corrige ${target.human_ref} para 450`));
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(corrected.json().data.result).toMatchObject({
      type: 'transaction_mutated',
      action: 'correction',
      transaction: { id: target.id, amount: '450.00', version: 2 },
    });
    const persisted = await fixture.db
      .selectFrom('transactions')
      .select(['inbox_message_id', 'version', 'amount'])
      .where('id', '=', target.id)
      .executeTakeFirstOrThrow();
    expect(persisted).toMatchObject({
      inbox_message_id: originalInboxId,
      version: 2,
      amount: '450.00',
    });
    expect(await count('audit_events')).toBe(before.audits + 1);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });

  it('requires a second explicit reply to Void the captured Last, even after a newer Transaction appears', async () => {
    const created = await post(body('gastei 31 alvo P05'));
    expect(created.statusCode, created.body).toBe(200);
    const target = created.json().data.result.transaction;
    const originalInbox = created.json().data.inbox_message.id;
    const latestCreated = await fixture.db
      .selectFrom('transactions')
      .select('created_at')
      .where('book_id', '=', bookId)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    const proposedCreatedAt = new Date(latestCreated.created_at.getTime() + 86_400_000);
    await fixture.db
      .updateTable('transactions')
      .set({ created_at: proposedCreatedAt })
      .where('id', '=', target.id)
      .execute();
    const beforeAudit = await count('audit_events');
    const request = await post(body('cancela último'));
    expect(request.statusCode, request.body).toBe(200);
    expect(request.json().data.result.confirmation.action).toBe('confirm_void');
    const sessionId = request.json().data.result.confirmation.id;
    const session = await fixture.db
      .selectFrom('confirmation_sessions')
      .select(['target_entity_type', 'target_entity_id', 'target_version'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();
    expect(session).toMatchObject({
      target_entity_type: 'transaction',
      target_entity_id: target.id,
      target_version: 1,
    });
    expect(
      (
        await fixture.db
          .selectFrom('transactions')
          .select('status')
          .where('id', '=', target.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('posted');
    const newer = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer integration-admin', 'idempotency-key': randomUUID() },
      payload: {
        type: 'expense',
        book_id: bookId,
        account_id: accountId,
        amount: '12.00',
        description: 'newer after proposal',
        transaction_date: '2026-10-21',
      },
    });
    expect(newer.statusCode, newer.body).toBe(201);
    await fixture.db
      .updateTable('transactions')
      .set({ created_at: new Date(proposedCreatedAt.getTime() + 86_400_000) })
      .where('id', '=', newer.json().data.id)
      .execute();
    const replyRequest = body('sim');
    const confirmed = await post(replyRequest);
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json().data.result).toMatchObject({
      type: 'transaction_mutated',
      action: 'void',
      transaction: { id: target.id, status: 'voided', version: 2 },
    });
    expect(
      (
        await fixture.db
          .selectFrom('transactions')
          .select('status')
          .where('id', '=', newer.json().data.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('posted');
    expect(
      (
        await fixture.db
          .selectFrom('transactions')
          .select('inbox_message_id')
          .where('id', '=', target.id)
          .executeTakeFirstOrThrow()
      ).inbox_message_id,
    ).toBe(originalInbox);
    expect(await count('audit_events')).toBe(beforeAudit + 2);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('confirmed');
    const replay = await post(replyRequest);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.result.type).toBe('duplicate_message');
    expect(await count('audit_events')).toBe(beforeAudit + 2);
  });

  it('rejects stale Void confirmation without effect or false confirmed state', async () => {
    const created = await post(body('gastei 49 alvo stale P05'));
    const target = created.json().data.result.transaction;
    const pending = await post(body(`cancela ${target.human_ref}`));
    expect(pending.statusCode, pending.body).toBe(200);
    const sessionId = pending.json().data.result.confirmation.id;
    const direct = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${target.id}`,
      headers: { authorization: 'Bearer integration-admin' },
      payload: { version: 1, amount: '50.00' },
    });
    expect(direct.statusCode, direct.body).toBe(200);
    const reply = await post(body('sim'));
    expect(reply.statusCode, reply.body).toBe(200);
    const row = await fixture.db
      .selectFrom('transactions')
      .select(['status', 'version', 'amount'])
      .where('id', '=', target.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'posted', version: 2, amount: '50.00' });
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).not.toBe('confirmed');
  });

  it('keeps a candidate version captured during choice and rejects a changed target', async () => {
    const first = (await post(body('gastei 41 compra escolha versao P05'))).json().data.result
      .transaction;
    const second = (await post(body('gastei 42 compra escolha versao P05'))).json().data.result
      .transaction;
    const request = await post(body('cancela compra escolha versao P05'));
    expect(request.statusCode, request.body).toBe(200);
    expect(request.json().data.result.confirmation.action).toBe('select_transaction');
    const option = request
      .json()
      .data.result.confirmation.options.find(
        (row: { name: string }) => row.name === first.human_ref,
      );
    expect(option).toBeDefined();
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${first.id}`,
      headers: { authorization: 'Bearer integration-admin' },
      payload: { version: 1, amount: '43.00' },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const choice = await post(body(option.number));
    expect(choice.statusCode, choice.body).toBe(200);
    expect(choice.json().data.result.type).toBe('stale_target');
    expect(
      await fixture.db
        .selectFrom('transactions')
        .select(['status', 'version'])
        .where('id', '=', first.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ status: 'posted', version: 2 });
    expect(
      (
        await fixture.db
          .selectFrom('transactions')
          .select('status')
          .where('id', '=', second.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('posted');
  });

  it('chooses the credited Account and confirms one linked Refund with original Inbox provenance', async () => {
    const created = await post(body('gastei 500 compra refund P05'));
    expect(created.statusCode, created.body).toBe(200);
    const target = created.json().data.result.transaction;
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const original = await post(body(`estorna 200 da compra ${target.human_ref}`));
    expect(original.statusCode, original.body).toBe(200);
    expect(original.json().data.result.confirmation.action).toBe('select_refund_account');
    const originalInbox = original.json().data.inbox_message.id;
    const sessionId = original.json().data.result.confirmation.id;
    expect(await count('transactions')).toBe(before.transactions);
    const choice = original
      .json()
      .data.result.confirmation.options.find((row: { name: string }) => row.name === 'Nubank');
    const selected = await post(body(choice.number));
    expect(selected.statusCode, selected.body).toBe(200);
    expect(selected.json().data.result.confirmation.action).toBe('confirm_refund');
    const stored = await fixture.db
      .selectFrom('confirmation_sessions')
      .select(['target_entity_type', 'target_entity_id', 'target_version'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      target_entity_type: 'transaction',
      target_entity_id: target.id,
      target_version: 1,
    });
    expect(await count('transactions')).toBe(before.transactions);
    const reply = await post(body('sim'));
    expect(reply.statusCode, reply.body).toBe(200);
    expect(reply.json().data.result).toMatchObject({
      type: 'transaction_mutated',
      action: 'refund',
      transaction: { amount: '200.00', version: 1 },
    });
    const refund = await fixture.db
      .selectFrom('transactions')
      .select(['refund_of_transaction_id', 'inbox_message_id', 'source', 'account_id', 'amount'])
      .where('id', '=', reply.json().data.result.transaction.id)
      .executeTakeFirstOrThrow();
    expect(refund).toMatchObject({
      refund_of_transaction_id: target.id,
      inbox_message_id: originalInbox,
      source: 'whatsapp',
      account_id: accountId,
      amount: '200.00',
    });
    expect(await count('transactions')).toBe(before.transactions + 1);
    expect(await count('audit_events')).toBe(before.audits + 1);
    expect(await count('idempotency_keys')).toBe(before.keys + 1);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('confirmed');
    const inboxRows = await fixture.db
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [
        originalInbox,
        selected.json().data.inbox_message.id,
        reply.json().data.inbox_message.id,
      ])
      .execute();
    expect(inboxRows).toEqual(
      expect.arrayContaining([
        { id: originalInbox, processing_status: 'processed' },
        { id: selected.json().data.inbox_message.id, processing_status: 'processed' },
        { id: reply.json().data.inbox_message.id, processing_status: 'processed' },
      ]),
    );
  });

  it('closes an account choice when the proposed Expense version becomes stale', async () => {
    const target = (await post(body('gastei 500 account stale P05'))).json().data.result
      .transaction;
    const proposed = await post(body(`estorna 200 da compra ${target.human_ref}`));
    expect(proposed.json().data.result.confirmation.action).toBe('select_refund_account');
    const sessionId = proposed.json().data.result.confirmation.id;
    const originalId = proposed.json().data.inbox_message.id;
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${target.id}`,
      headers: { authorization: 'Bearer integration-admin' },
      payload: { version: 1, amount: '501.00' },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const auditAfterPatch = await count('audit_events');
    const choice = await post(body('1'));
    expect(choice.statusCode, choice.body).toBe(200);
    expect(choice.json().data.result.type).toBe('stale_target');
    expect(choice.json().data.reply).toMatchObject({ should_send: true });
    expect(choice.json().data.reply.text.length).toBeLessThanOrEqual(600);
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(auditAfterPatch);
    expect(await count('idempotency_keys')).toBe(before.keys);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('cancelled');
    const rows = await fixture.db
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [originalId, choice.json().data.inbox_message.id])
      .execute();
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: originalId, processing_status: 'ignored' },
        { id: choice.json().data.inbox_message.id, processing_status: 'processed' },
      ]),
    );
  });

  it('revalidates Refund balance at yes without partial financial or idempotency writes', async () => {
    const target = (await post(body('gastei 500 balance stale P05'))).json().data.result
      .transaction;
    const proposed = await post(body(`estorna 400 da compra ${target.human_ref}`));
    const originalId = proposed.json().data.inbox_message.id;
    const sessionId = proposed.json().data.result.confirmation.id;
    expect(proposed.json().data.result.confirmation.action).toBe('select_refund_account');
    const choice = await post(body('1'));
    expect(choice.json().data.result.confirmation.action).toBe('confirm_refund');
    const direct = await app.inject({
      method: 'POST',
      url: `/api/v1/transactions/${target.id}/refunds`,
      headers: { authorization: 'Bearer integration-admin', 'idempotency-key': randomUUID() },
      payload: {
        version: 1,
        amount: '300.00',
        account_id: accountId,
        transaction_date: '2026-10-21',
        description: 'Concurrent refund',
      },
    });
    expect(direct.statusCode, direct.body).toBe(201);
    const before = {
      transactions: await count('transactions'),
      audits: await count('audit_events'),
      keys: await count('idempotency_keys'),
    };
    const yes = await post(body('sim'));
    expect(yes.statusCode, yes.body).toBe(200);
    expect(yes.json().data.result.type).toBe('stale_target');
    expect(yes.json().data.reply).toMatchObject({ should_send: true });
    expect(yes.json().data.reply.text.length).toBeLessThanOrEqual(600);
    expect(await count('transactions')).toBe(before.transactions);
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('idempotency_keys')).toBe(before.keys);
    expect(
      (
        await fixture.db
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', sessionId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('cancelled');
    const rows = await fixture.db
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [originalId, yes.json().data.inbox_message.id])
      .execute();
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: originalId, processing_status: 'ignored' },
        { id: yes.json().data.inbox_message.id, processing_status: 'processed' },
      ]),
    );
  });

  it('rolls back Void effect, Audit, idempotency and both Inbox finalizations on injected failures', async () => {
    await sql`CREATE FUNCTION p05_mutation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked mutation stage'; END $$`.execute(
      fixture.db,
    );
    try {
      for (const stage of ['audit_events', 'idempotency_keys', 'inbox_messages'] as const) {
        const created = await post(body(`gastei 30 rollback ${stage}`));
        const target = created.json().data.result.transaction;
        const requested = await post(body(`cancela ${target.human_ref}`));
        expect(requested.statusCode, requested.body).toBe(200);
        const originalInbox = requested.json().data.inbox_message.id;
        const before = {
          audits: await count('audit_events'),
          keys: await count('idempotency_keys'),
        };
        if (stage === 'audit_events')
          await sql`CREATE TRIGGER p05_mutation_fail BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action = 'TRANSACTION_VOIDED') EXECUTE FUNCTION p05_mutation_fail()`.execute(
            fixture.db,
          );
        else if (stage === 'idempotency_keys')
          await sql`CREATE TRIGGER p05_mutation_fail BEFORE INSERT ON idempotency_keys FOR EACH ROW WHEN (NEW.scope = 'transactions:void') EXECUTE FUNCTION p05_mutation_fail()`.execute(
            fixture.db,
          );
        else
          await sql`CREATE TRIGGER p05_mutation_fail BEFORE UPDATE ON inbox_messages FOR EACH ROW WHEN (OLD.processing_status = 'needs_confirmation' AND NEW.processing_status = 'processed') EXECUTE FUNCTION p05_mutation_fail()`.execute(
            fixture.db,
          );
        const reply = body('sim');
        try {
          const failed = await post(reply);
          expect(failed.statusCode, `${stage}: ${failed.body}`).toBe(500);
        } finally {
          if (stage === 'audit_events')
            await sql`DROP TRIGGER p05_mutation_fail ON audit_events`.execute(fixture.db);
          else if (stage === 'idempotency_keys')
            await sql`DROP TRIGGER p05_mutation_fail ON idempotency_keys`.execute(fixture.db);
          else await sql`DROP TRIGGER p05_mutation_fail ON inbox_messages`.execute(fixture.db);
        }
        expect(
          await fixture.db
            .selectFrom('transactions')
            .select(['status', 'version'])
            .where('id', '=', target.id)
            .executeTakeFirstOrThrow(),
        ).toMatchObject({ status: 'posted', version: 1 });
        expect(await count('audit_events')).toBe(before.audits);
        expect(await count('idempotency_keys')).toBe(before.keys);
        expect(
          (
            await fixture.db
              .selectFrom('inbox_messages')
              .select('processing_status')
              .where('id', '=', originalInbox)
              .executeTakeFirstOrThrow()
          ).processing_status,
        ).toBe('needs_confirmation');
        expect(
          (
            await fixture.db
              .selectFrom('inbox_messages')
              .select('processing_status')
              .where('source_message_id', '=', reply.source_message_id)
              .executeTakeFirstOrThrow()
          ).processing_status,
        ).toBe('failed');
        const retried = await post(reply);
        expect(retried.statusCode, retried.body).toBe(200);
        expect(retried.json().data.result.type).toBe('transaction_mutated');
      }
    } finally {
      await sql`DROP FUNCTION p05_mutation_fail()`.execute(fixture.db);
    }
  });

  it('serializes two distinct confirmations on independent PostgreSQL connections into one Void', async () => {
    const created = await post(body('gastei 43 concurrent confirmation'));
    const target = created.json().data.result.transaction;
    const pending = await post(body(`cancela ${target.human_ref}`));
    expect(pending.statusCode, pending.body).toBe(200);
    const before = { audits: await count('audit_events'), keys: await count('idempotency_keys') };
    const pools = [
      new Pool({ connectionString: fixture.connectionString, max: 1 }),
      new Pool({ connectionString: fixture.connectionString, max: 1 }),
    ];
    const dbs = pools.map((pool) => new Kysely<DB>({ dialect: new PostgresDialect({ pool }) }));
    const pids = await Promise.all(
      dbs.map(
        async (db) =>
          (await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(db)).rows[0]!.pid,
      ),
    );
    expect(pids[0]).not.toBe(pids[1]);
    let entered = 0;
    let both!: () => void;
    let release!: () => void;
    const bothAtBarrier = new Promise<void>((resolve) => {
      both = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apps = dbs.map((db) => {
      const real = new KyselyFinancialTransactionPort(db);
      let held = false;
      return buildForConnection({
        inboxProcessing: {
          runInboxTransaction: (fn) =>
            real.runInboxTransaction((ctx) =>
              fn({
                ...ctx,
                locks: {
                  acquireLocks: async (spec) => {
                    if (!held) {
                      held = true;
                      entered++;
                      if (entered === 2) both();
                      await proceed;
                    }
                    return ctx.locks.acquireLocks(spec);
                  },
                },
              }),
            ),
        },
      });
    });
    try {
      await Promise.all(apps.map((instance) => instance.ready()));
      const requests = apps.map((instance) =>
        instance.inject({
          method: 'POST',
          url: '/api/v1/inbox/messages',
          headers: { authorization: 'Bearer integration-ingest' },
          payload: body('sim'),
        }),
      );
      await Promise.race([
        bothAtBarrier,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Both independent confirmations did not reach the barrier')),
            10_000,
          ),
        ),
      ]);
      release();
      const results = await Promise.all(requests);
      expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
      expect(
        results.filter((result) => result.json().data.result.type === 'transaction_mutated'),
      ).toHaveLength(1);
      expect(
        await fixture.db
          .selectFrom('transactions')
          .select(['status', 'version'])
          .where('id', '=', target.id)
          .executeTakeFirstOrThrow(),
      ).toMatchObject({ status: 'voided', version: 2 });
      expect(await count('audit_events')).toBe(before.audits + 1);
      expect(await count('idempotency_keys')).toBe(before.keys + 1);
    } finally {
      release();
      await Promise.all(apps.map((instance) => instance.close()));
      await Promise.all(dbs.map((db) => db.destroy()));
    }
  });
});
