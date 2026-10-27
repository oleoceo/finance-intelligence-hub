import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { claimInboxMessage } from '@finance-hub/core';
import {
  KyselyInboxMessageRepository,
  KyselyInboxTransactionPort,
  migrateUp,
} from '@finance-hub/database';
import type { DB } from '../../../packages/database/src/db-types.js';

describe('Inbox PostgreSQL persistence', { timeout: 30000 }, () => {
  let container: StartedTestContainer;
  let db: Kysely<DB>;
  let pool: Pool;
  let connectionString: string;

  beforeAll(async () => {
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'inbox_test',
        POSTGRES_USER: 'inbox_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    connectionString = `postgresql://inbox_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/inbox_test`;
    await migrateUp({ connectionString });
    pool = new Pool({ connectionString });
    db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  }, 180000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (container) await container.stop();
  });

  const now = () => new Date();
  function input(senderReference: string, sourceMessageId = randomUUID()) {
    return {
      source: 'whatsapp',
      sourceInstance: 'evolution-main/test',
      sourceMessageId,
      senderReference,
      receivedAt: now(),
      rawText: 'private amount and message',
      isGroup: false,
      fromMe: false,
    };
  }
  function options() {
    return { id: randomUUID(), correlationId: randomUUID(), now: now(), staleTimeoutMs: 60_000 };
  }
  async function sender(active = true) {
    const reference = `5511${Math.floor(100000000 + Math.random() * 900000000)}`;
    await db
      .insertInto('authorized_senders')
      .values({
        id: randomUUID(),
        channel: 'whatsapp',
        sender_reference: reference,
        name: null,
        default_book_id: null,
        default_account_id: null,
        active,
        created_at: now(),
        updated_at: now(),
      })
      .execute();
    return reference;
  }

  it('persists no raw row for absent or inactive sender', async () => {
    for (const reference of ['5511999999999', await sender(false)]) {
      const message = input(reference);
      await expect(
        claimInboxMessage(message, new KyselyInboxTransactionPort(db), options()),
      ).rejects.toMatchObject({ code: 'SENDER_NOT_AUTHORIZED' });
      const rows = await db
        .selectFrom('inbox_messages')
        .select('id')
        .where('source_message_id', '=', message.sourceMessageId)
        .execute();
      expect(rows).toHaveLength(0);
    }
  });

  it('uses the same row for failed retries, then fences the old claimant', async () => {
    const message = input(await sender());
    const port = new KyselyInboxTransactionPort(db);
    const first = await claimInboxMessage(message, port, options());
    expect(first).toMatchObject({ claimed: true, attemptCount: 1 });
    const repo = new KyselyInboxMessageRepository(db);
    const failed = await repo.transition({
      id: first!.message.id,
      attemptCount: first!.attemptCount,
      processingStartedAt: first!.processingStartedAt!,
      status: 'failed',
      now: now(),
      failureCode: 'PARSER_FAILED',
    });
    expect(failed).toMatchObject({
      status: 'failed',
      failureCode: 'PARSER_FAILED',
      failureMessage: null,
    });
    const retry = await claimInboxMessage(message, port, options());
    expect(retry).toMatchObject({ claimed: true, attemptCount: 2 });
    expect(retry!.message.id).toBe(first!.message.id);
    expect(
      await repo.transition({
        id: first!.message.id,
        attemptCount: first!.attemptCount,
        processingStartedAt: first!.processingStartedAt!,
        status: 'processed',
        now: now(),
      }),
    ).toBeNull();
    const processed = await repo.transition({
      id: retry!.message.id,
      attemptCount: retry!.attemptCount,
      processingStartedAt: retry!.processingStartedAt!,
      status: 'processed',
      now: now(),
    });
    expect(processed?.processedAt).toBeInstanceOf(Date);
    expect(await claimInboxMessage(message, port, options())).toMatchObject({
      claimed: false,
      attemptCount: 2,
    });
  });

  it('reclaims stale processing with a new attempt on the same row', async () => {
    const message = input(await sender());
    const first = await claimInboxMessage(message, new KyselyInboxTransactionPort(db), options());
    const later = { ...options(), now: new Date(first!.processingStartedAt!.getTime() + 61_000) };
    const second = await claimInboxMessage(message, new KyselyInboxTransactionPort(db), later);
    expect(second).toMatchObject({ claimed: true, attemptCount: 2 });
    expect(second!.message.id).toBe(first!.message.id);
    const repository = new KyselyInboxMessageRepository(db);
    expect(
      await repository.transition({
        id: first!.message.id,
        attemptCount: first!.attemptCount,
        processingStartedAt: first!.processingStartedAt!,
        status: 'processed',
        now: later.now,
      }),
    ).toBeNull();
    expect((await repository.findById(first!.message.id))?.status).toBe('processing');
  });

  it('keeps active processing and ignored rows unclaimed on duplicate delivery', async () => {
    const message = input(await sender());
    const port = new KyselyInboxTransactionPort(db);
    const first = await claimInboxMessage(message, port, options());
    const duplicate = await claimInboxMessage(message, port, options());
    expect(duplicate).toMatchObject({ claimed: false, attemptCount: 1 });
    expect(duplicate!.message.id).toBe(first!.message.id);
    const ignored = await new KyselyInboxMessageRepository(db).transition({
      id: first!.message.id,
      attemptCount: first!.attemptCount,
      processingStartedAt: first!.processingStartedAt!,
      status: 'ignored',
      now: now(),
    });
    expect(ignored?.processedAt).toBeInstanceOf(Date);
    expect(await claimInboxMessage(message, port, options())).toMatchObject({
      claimed: false,
      attemptCount: 1,
      message: { status: 'ignored' },
    });
  });

  it.each(['processing', 'processed', 'failed', 'stale'] as const)(
    'rejects a second sender colliding with a %s Inbox without disclosure or mutation',
    async (state) => {
      const owner = await sender();
      const other = await sender();
      const message = input(owner);
      message.rawText = 'owner private secret';
      const port = new KyselyInboxTransactionPort(db);
      const first = (await claimInboxMessage(message, port, options()))!;
      const repo = new KyselyInboxMessageRepository(db);
      if (state === 'processed' || state === 'failed') {
        await repo.transition({
          id: first.message.id,
          attemptCount: first.attemptCount,
          processingStartedAt: first.processingStartedAt!,
          status: state,
          now: now(),
        });
      }
      const before = await repo.findById(first.message.id);
      const attempted = { ...message, senderReference: other, rawText: 'attacker text' };
      let thrown: unknown;
      try {
        await claimInboxMessage(
          attempted,
          port,
          state === 'stale'
            ? { ...options(), now: new Date(first.processingStartedAt!.getTime() + 61_000) }
            : options(),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'INBOX_IDENTITY_CONFLICT', statusCode: 409 });
      expect(JSON.stringify(thrown)).not.toContain(message.rawText);
      expect(JSON.stringify(thrown)).not.toContain(owner);
      expect(JSON.stringify(thrown)).not.toContain(first.message.id);
      expect((thrown as Error).message).toBe('Inbox identity conflict');
      expect(await repo.findById(first.message.id)).toEqual(before);
      expect(
        await db
          .selectFrom('inbox_messages')
          .select('id')
          .where('source_message_id', '=', message.sourceMessageId)
          .execute(),
      ).toHaveLength(1);
    },
  );

  it('rejects changed text for the same sender and preserves failed retry content', async () => {
    const message = input(await sender());
    const port = new KyselyInboxTransactionPort(db);
    const first = (await claimInboxMessage(message, port, options()))!;
    const repo = new KyselyInboxMessageRepository(db);
    await repo.transition({
      id: first.message.id,
      attemptCount: first.attemptCount,
      processingStartedAt: first.processingStartedAt!,
      status: 'failed',
      now: now(),
    });
    const before = await repo.findById(first.message.id);
    await expect(
      claimInboxMessage({ ...message, rawText: 'edited text' }, port, options()),
    ).rejects.toMatchObject({ code: 'INBOX_IDENTITY_CONFLICT' });
    expect(await repo.findById(first.message.id)).toEqual(before);
    const retry = await claimInboxMessage(message, port, options());
    expect(retry).toMatchObject({ claimed: true, attemptCount: 2 });
    expect(retry!.message.rawText).toBe(message.rawText);
  });

  it('rejects unstructured failure text so raw content cannot enter failure metadata', async () => {
    const message = input(await sender());
    const first = await claimInboxMessage(message, new KyselyInboxTransactionPort(db), options());
    const repo = new KyselyInboxMessageRepository(db);
    await expect(
      repo.transition({
        id: first!.message.id,
        attemptCount: 1,
        processingStartedAt: first!.processingStartedAt!,
        status: 'failed',
        now: now(),
        failureMessage: message.rawText,
      }),
    ).rejects.toThrow('Free-form failure messages');
    expect((await repo.findById(first!.message.id))?.failureMessage).toBeNull();
  });

  it('serializes duplicate deliveries from independent connections on one identity', async () => {
    const message = input(await sender());
    const firstPool = new Pool({ connectionString, max: 1 });
    const secondPool = new Pool({ connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let signalHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      const first = new KyselyInboxTransactionPort(firstDb).runInTransaction(async (ctx) => {
        const candidate = await ctx.senders.findByChannelAndReference(
          'whatsapp',
          message.senderReference,
        );
        await ctx.locks.acquireLocks({ authorizedSenders: [candidate!.id] });
        const o = options();
        const result = await ctx.inbox.claim(
          {
            id: o.id,
            source: message.source,
            sourceInstance: message.sourceInstance,
            sourceMessageId: message.sourceMessageId,
            senderReference: message.senderReference,
            authorizedSenderId: candidate!.id,
            rawText: message.rawText,
            receivedAt: message.receivedAt,
            correlationId: o.correlationId,
            now: o.now,
          },
          new Date(o.now.getTime() - o.staleTimeoutMs),
        );
        signalHeld();
        await gate;
        return result;
      });
      await held;
      const second = claimInboxMessage(
        message,
        new KyselyInboxTransactionPort(secondDb),
        options(),
      );
      await expectBlocker(pid2, pid1);
      release();
      const [a, b] = await Promise.all([first, second]);
      expect(a.claimed).toBe(true);
      expect(b).toMatchObject({ claimed: false, attemptCount: 1 });
      expect(b!.message.id).toBe(a.message.id);
      const rows = await db
        .selectFrom('inbox_messages')
        .select('id')
        .where('source_message_id', '=', message.sourceMessageId)
        .execute();
      expect(rows).toHaveLength(1);
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('rejects a cross-sender collision waiting on an uncommitted claim', async () => {
    const message = input(await sender());
    const other = await sender();
    const firstPool = new Pool({ connectionString, max: 1 });
    const secondPool = new Pool({ connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let signalHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      expect(pid1).not.toBe(pid2);
      const first = new KyselyInboxTransactionPort(firstDb).runInTransaction(async (ctx) => {
        const candidate = await ctx.senders.findByChannelAndReference(
          'whatsapp',
          message.senderReference,
        );
        await ctx.locks.acquireLocks({ authorizedSenders: [candidate!.id] });
        const o = options();
        const claim = await ctx.inbox.claim(
          {
            id: o.id,
            source: message.source,
            sourceInstance: message.sourceInstance,
            sourceMessageId: message.sourceMessageId,
            senderReference: message.senderReference,
            authorizedSenderId: candidate!.id,
            rawText: message.rawText,
            receivedAt: message.receivedAt,
            correlationId: o.correlationId,
            now: o.now,
          },
          new Date(o.now.getTime() - o.staleTimeoutMs),
        );
        signalHeld();
        await gate;
        return claim;
      });
      await held;
      const collision = claimInboxMessage(
        { ...message, senderReference: other, rawText: 'other private text' },
        new KyselyInboxTransactionPort(secondDb),
        options(),
      );
      await expectBlocker(pid2, pid1);
      release();
      const ownerClaim = await first;
      await expect(collision).rejects.toMatchObject({ code: 'INBOX_IDENTITY_CONFLICT' });
      expect(
        await new KyselyInboxMessageRepository(db).findById(ownerClaim.message.id),
      ).toMatchObject({
        attemptCount: 1,
        status: 'processing',
        rawText: message.rawText,
        senderReference: message.senderReference,
      });
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('blocks sender deactivation until authorized Inbox insertion commits', async () => {
    const reference = await sender();
    const message = input(reference);
    const firstPool = new Pool({ connectionString, max: 1 });
    const secondPool = new Pool({ connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let signalHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const insert = new KyselyInboxTransactionPort(firstDb).runInTransaction(async (ctx) => {
        const candidate = await ctx.senders.findByChannelAndReference('whatsapp', reference);
        await ctx.locks.acquireLocks({ authorizedSenders: [candidate!.id] });
        expect((await ctx.senders.findByChannelAndReference('whatsapp', reference))?.active).toBe(
          true,
        );
        const o = options();
        const claim = await ctx.inbox.claim(
          {
            id: o.id,
            source: message.source,
            sourceInstance: message.sourceInstance,
            sourceMessageId: message.sourceMessageId,
            senderReference: reference,
            authorizedSenderId: candidate!.id,
            rawText: message.rawText,
            receivedAt: message.receivedAt,
            correlationId: o.correlationId,
            now: o.now,
          },
          new Date(o.now.getTime() - o.staleTimeoutMs),
        );
        signalHeld();
        await gate;
        return claim;
      });
      await held;
      const deactivate = secondDb
        .updateTable('authorized_senders')
        .set({ active: false })
        .where('sender_reference', '=', reference)
        .execute();
      await expectBlocker(pid2, pid1);
      release();
      expect((await insert).claimed).toBe(true);
      await deactivate;
      const row = await db
        .selectFrom('inbox_messages')
        .selectAll()
        .where('source_message_id', '=', message.sourceMessageId)
        .executeTakeFirstOrThrow();
      expect(row.sender_reference).toBe(reference);
      expect(row.raw_text).toBe(message.rawText);
      const next = input(reference);
      await expect(
        claimInboxMessage(next, new KyselyInboxTransactionPort(db), options()),
      ).rejects.toMatchObject({ code: 'SENDER_NOT_AUTHORIZED' });
      expect(
        await db
          .selectFrom('inbox_messages')
          .select('id')
          .where('source_message_id', '=', next.sourceMessageId)
          .execute(),
      ).toHaveLength(0);
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('rejects insertion when deactivation commits before the sender re-read', async () => {
    const reference = await sender();
    const message = input(reference);
    const firstPool = new Pool({ connectionString, max: 1 });
    const secondPool = new Pool({ connectionString, max: 1 });
    const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
    const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
    let signalHeld!: () => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const pid1 = (await firstPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const pid2 = (await secondPool.query('select pg_backend_pid() as pid')).rows[0].pid as number;
      const deactivate = firstDb.transaction().execute(async (tx) => {
        await tx
          .updateTable('authorized_senders')
          .set({ active: false })
          .where('sender_reference', '=', reference)
          .execute();
        signalHeld();
        await gate;
      });
      await held;
      const insert = claimInboxMessage(
        message,
        new KyselyInboxTransactionPort(secondDb),
        options(),
      );
      await expectBlocker(pid2, pid1);
      release();
      await deactivate;
      await expect(insert).rejects.toMatchObject({ code: 'SENDER_NOT_AUTHORIZED' });
      expect(
        await db
          .selectFrom('inbox_messages')
          .select('id')
          .where('source_message_id', '=', message.sourceMessageId)
          .execute(),
      ).toHaveLength(0);
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  async function expectBlocker(waitingPid: number, blockingPid: number) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = await pool.query('select pg_blocking_pids($1) as blockers', [waitingPid]);
      if ((result.rows[0].blockers as number[]).includes(blockingPid)) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('Expected PostgreSQL lock wait was not observed');
  }
});
