import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { KyselyConfirmationSessionRepository, migrateUp } from '@finance-hub/database';
import type { DB } from '../../../packages/database/src/db-types.js';

describe('Confirmation PostgreSQL lifecycle', { timeout: 30000 }, () => {
  let container: StartedTestContainer;
  let first: Kysely<DB>;
  let second: Kysely<DB>;
  const now = new Date('2026-10-27T12:00:00Z');
  const later = (ms: number) => new Date(now.getTime() + ms);

  beforeAll(async () => {
    const password = randomUUID();
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'confirmation_test',
        POSTGRES_USER: 'confirmation_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .withStartupTimeout(120000)
      .start();
    const connectionString = `postgresql://confirmation_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/confirmation_test`;
    await migrateUp({ connectionString });
    first = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
    });
    second = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
    });
  }, 180000);

  afterAll(async () => {
    if (first) await first.destroy();
    if (second) await second.destroy();
    if (container) await container.stop();
  });

  async function owner() {
    const senderReference = `5511${Math.floor(100000000 + Math.random() * 900000000)}`;
    const authorizedSenderId = randomUUID();
    await first
      .insertInto('authorized_senders')
      .values({
        id: authorizedSenderId,
        channel: 'whatsapp',
        sender_reference: senderReference,
        name: null,
        default_book_id: null,
        default_account_id: null,
        active: true,
        created_at: now,
        updated_at: now,
      })
      .execute();
    return { channel: 'whatsapp', senderReference, authorizedSenderId };
  }

  async function inbox(
    o: Awaited<ReturnType<typeof owner>>,
    status: 'processing' | 'needs_confirmation',
  ) {
    const id = randomUUID();
    await first
      .insertInto('inbox_messages')
      .values({
        id,
        source: 'whatsapp',
        source_instance: 'test',
        source_message_id: randomUUID(),
        sender_reference: o.senderReference,
        authorized_sender_id: o.authorizedSenderId,
        raw_text: 'private command',
        raw_payload: null,
        received_at: now,
        processing_status: status,
        attempt_count: 1,
        processing_started_at: now,
        last_attempt_at: now,
        processed_at: null,
        correlation_id: randomUUID(),
        failure_code: null,
        failure_message: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    return id;
  }

  async function open(
    o: Awaited<ReturnType<typeof owner>>,
    at = now,
    action: 'create_transaction' | 'select_account' | 'select_book' = 'create_transaction',
  ) {
    const inboxMessageId = await inbox(o, 'needs_confirmation');
    const id = randomUUID();
    const session = await first.transaction().execute((tx) =>
      new KyselyConfirmationSessionRepository(tx).create({
        ...o,
        id,
        inboxMessageId,
        action,
        payload:
          action === 'create_transaction'
            ? { amount: '10.00' }
            : { interpretation: { kind: 'create_transaction' } },
        now: at,
      }),
    );
    return { session, inboxMessageId };
  }

  async function financialReferences() {
    const bookId = randomUUID();
    const accountId = randomUUID();
    await first
      .insertInto('books')
      .values({
        id: bookId,
        name: bookId,
        normalized_name: bookId,
        currency: 'BRL',
        timezone: 'UTC',
        active: true,
        archived_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    await first
      .insertInto('accounts')
      .values({
        id: accountId,
        book_id: bookId,
        name: accountId,
        normalized_name: accountId,
        type: 'checking',
        currency: 'BRL',
        institution_name: null,
        notes: null,
        active: true,
        archived_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
    return { bookId, accountId };
  }

  async function effect(
    tx: Kysely<DB>,
    inboxMessageId: string,
    refs: Awaited<ReturnType<typeof financialReferences>>,
  ) {
    await tx
      .insertInto('transactions')
      .values({
        id: randomUUID(),
        human_ref: randomUUID().slice(0, 16),
        book_id: refs.bookId,
        account_id: refs.accountId,
        destination_account_id: null,
        category_id: null,
        merchant_id: null,
        type: 'expense',
        status: 'posted',
        amount: '10.00',
        currency: 'BRL',
        description: 'confirmed expense',
        notes: null,
        transaction_date: '2026-10-27',
        source: 'whatsapp',
        source_reference: null,
        inbox_message_id: inboxMessageId,
        refund_of_transaction_id: null,
        version: 1,
        voided_at: null,
        void_reason: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  async function observeBlockedBackend(pid: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const state = await sql<{
        wait_event_type: string | null;
      }>`select wait_event_type from pg_stat_activity where pid = ${pid}`.execute(first);
      if (state.rows[0]?.wait_event_type === 'Lock') return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('Competing PostgreSQL backend did not wait on a lock');
  }

  it('persists origin, payload and 15-minute TTL; rejects a second pending row', async () => {
    const o = await owner();
    const { session } = await open(o);
    expect(session.expiresAt).toEqual(later(900000));
    expect(session.payload).toEqual({ amount: '10.00' });
    const other = await inbox(o, 'needs_confirmation');
    await expect(
      first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).create({
          ...o,
          id: randomUUID(),
          inboxMessageId: other,
          action: 'create_transaction',
          payload: {},
          now,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      first
        .insertInto('confirmation_sessions')
        .values({
          id: randomUUID(),
          channel: o.channel,
          sender_reference: o.senderReference,
          authorized_sender_id: o.authorizedSenderId,
          inbox_message_id: other,
          resolved_by_inbox_message_id: null,
          action: 'create_transaction',
          target_entity_type: null,
          target_entity_id: null,
          target_version: null,
          payload: {},
          status: 'pending',
          resolution_reason: null,
          expires_at: later(900000),
          created_at: now,
          resolved_at: null,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('cancels with a separate resolver and terminalizes both Inbox rows', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const result = await first.transaction().execute((tx) =>
      new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        reply: 'no',
        resolverInboxMessageId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      }),
    );
    expect(result).toMatchObject({
      kind: 'cancelled',
      session: { id: session.id, inboxMessageId, resolvedByInboxMessageId: resolverInboxMessageId },
    });
    const rows = await first
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [inboxMessageId, resolverInboxMessageId])
      .execute();
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: inboxMessageId, processing_status: 'ignored' },
        { id: resolverInboxMessageId, processing_status: 'processed' },
      ]),
    );
    const lateResolverId = await inbox(o, 'processing');
    expect(
      await first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId: lateResolverId,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(2000),
        }),
      ),
    ).toEqual({ kind: 'none' });
  });

  it('does not commit an orphan confirmation when only preparing approval', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const result = await first.transaction().execute((tx) =>
      new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        reply: 'yes',
        resolverInboxMessageId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      }),
    );
    expect(result).toMatchObject({
      kind: 'ready',
      session: { inboxMessageId, resolvedByInboxMessageId: null },
    });
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', inboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('needs_confirmation');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', resolverInboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('processing');
  });

  it.each(['1', '2'] as const)('keeps numeric %s as a contextual selection', async (reply) => {
    const o = await owner();
    const { session } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const result = await first.transaction().execute((tx) =>
      new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        reply,
        resolverInboxMessageId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      }),
    );
    expect(result).toMatchObject({ kind: 'choice', selection: reply, session: { id: session.id } });
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', resolverInboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('processing');
  });

  it('rolls back confirmation and linked Inbox finalization with the caller transaction', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const refs = await financialReferences();
    await expect(
      first.transaction().execute(async (tx) => {
        const repo = new KyselyConfirmationSessionRepository(tx);
        expect(
          await repo.resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId,
            attemptCount: 1,
            processingStartedAt: now,
            now: later(1000),
          }),
        ).toMatchObject({ kind: 'ready' });
        await effect(tx, inboxMessageId, refs);
        await repo.finalizeConfirmed({
          ...o,
          sessionId: session.id,
          resolverInboxMessageId,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(1000),
        });
        throw new Error('financial effect failed');
      }),
    ).rejects.toThrow('financial effect failed');
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', inboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('needs_confirmation');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', resolverInboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('processing');
    expect(
      await first
        .selectFrom('transactions')
        .select('id')
        .where('inbox_message_id', '=', inboxMessageId)
        .execute(),
    ).toEqual([]);
  });

  it('finalizes a prepared confirmation atomically and cannot replay it', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const refs = await financialReferences();
    const claim = {
      ...o,
      resolverInboxMessageId,
      attemptCount: 1,
      processingStartedAt: now,
      now: later(1000),
    };
    await first.transaction().execute(async (tx) => {
      const repo = new KyselyConfirmationSessionRepository(tx);
      expect(await repo.resolveReply({ ...claim, reply: 'yes' })).toMatchObject({ kind: 'ready' });
      await effect(tx, inboxMessageId, refs);
      await repo.finalizeConfirmed({ ...claim, sessionId: session.id });
    });
    const state = await first
      .selectFrom('confirmation_sessions')
      .select(['status', 'resolved_by_inbox_message_id'])
      .where('id', '=', session.id)
      .executeTakeFirstOrThrow();
    expect(state).toEqual({
      status: 'confirmed',
      resolved_by_inbox_message_id: resolverInboxMessageId,
    });
    const inboxes = await first
      .selectFrom('inbox_messages')
      .select(['id', 'processing_status'])
      .where('id', 'in', [inboxMessageId, resolverInboxMessageId])
      .execute();
    expect(inboxes).toEqual(
      expect.arrayContaining([
        { id: inboxMessageId, processing_status: 'processed' },
        { id: resolverInboxMessageId, processing_status: 'processed' },
      ]),
    );
    await expect(
      first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).finalizeConfirmed({
          ...claim,
          sessionId: session.id,
        }),
      ),
    ).rejects.toThrow('Confirmation is not pending');
  });

  it('rejects confirmed finalization without a linked financial effect', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const claim = {
      ...o,
      resolverInboxMessageId,
      attemptCount: 1,
      processingStartedAt: now,
      now: later(1000),
    };
    await expect(
      first.transaction().execute(async (tx) => {
        const repo = new KyselyConfirmationSessionRepository(tx);
        expect(await repo.resolveReply({ ...claim, reply: 'yes' })).toMatchObject({
          kind: 'ready',
        });
        await repo.finalizeConfirmed({ ...claim, sessionId: session.id });
      }),
    ).rejects.toThrow('financial effect is missing');
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', inboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('needs_confirmation');
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', resolverInboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('processing');
  });

  it.each(['select_account', 'select_book'] as const)(
    'rejects %s finalization without a linked posted financial effect',
    async (action) => {
      const o = await owner();
      const { session, inboxMessageId } = await open(o, now, action);
      const resolverInboxMessageId = await inbox(o, 'processing');
      const claim = {
        ...o,
        resolverInboxMessageId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      };
      await expect(
        first.transaction().execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).finalizeConfirmed({
            ...claim,
            sessionId: session.id,
          }),
        ),
      ).rejects.toThrow('financial effect is missing');
      expect(
        (
          await first
            .selectFrom('confirmation_sessions')
            .select('status')
            .where('id', '=', session.id)
            .executeTakeFirstOrThrow()
        ).status,
      ).toBe('pending');
      expect(
        (
          await first
            .selectFrom('inbox_messages')
            .select('processing_status')
            .where('id', '=', inboxMessageId)
            .executeTakeFirstOrThrow()
        ).processing_status,
      ).toBe('needs_confirmation');
    },
  );

  it.each(['yes', 'no'] as const)('rejects stale attempt before %s resolution', async (reply) => {
    const o = await owner();
    const { session } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    await first
      .updateTable('inbox_messages')
      .set({ attempt_count: 2, processing_started_at: later(1000) })
      .where('id', '=', resolverInboxMessageId)
      .execute();
    const stale = {
      ...o,
      resolverInboxMessageId,
      attemptCount: 1,
      processingStartedAt: now,
      now: later(2000),
    };
    expect(
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({ ...stale, reply }),
        ),
    ).toEqual({ kind: 'stale_claim' });
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      await first
        .selectFrom('inbox_messages')
        .select(['processing_status', 'attempt_count'])
        .where('id', '=', resolverInboxMessageId)
        .executeTakeFirst(),
    ).toMatchObject({ processing_status: 'processing', attempt_count: 2 });
    await expect(
      first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).finalizeConfirmed({
          ...stale,
          sessionId: session.id,
        }),
      ),
    ).rejects.toThrow('stale');
  });

  it('does not let a stale attempt ignore a newer claim after a late reply', async () => {
    const o = await owner();
    const resolverInboxMessageId = await inbox(o, 'processing');
    await first
      .updateTable('inbox_messages')
      .set({ attempt_count: 2, processing_started_at: later(1000) })
      .where('id', '=', resolverInboxMessageId)
      .execute();
    expect(
      await first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          resolverInboxMessageId,
          attemptCount: 1,
          processingStartedAt: now,
          reply: 'yes',
          now: later(2000),
        }),
      ),
    ).toEqual({ kind: 'stale_claim' });
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', resolverInboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('processing');
  });

  it('fences a reply racing PostgreSQL stale reclaim on independent connections', async () => {
    const o = await owner();
    const { session } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const reclaim = first.transaction().execute(async (tx) => {
      await tx
        .updateTable('inbox_messages')
        .set({ attempt_count: 2, processing_started_at: later(1000) })
        .where('id', '=', resolverInboxMessageId)
        .execute();
      entered();
      await held;
    });
    await locked;
    let started!: (pid: number) => void;
    const backend = new Promise<number>((resolve) => {
      started = resolve;
    });
    const reply = second.transaction().execute(async (tx) => {
      const pid = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(tx);
      started(pid.rows[0]!.pid);
      return new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        resolverInboxMessageId,
        attemptCount: 1,
        processingStartedAt: now,
        reply: 'no',
        now: later(2000),
      });
    });
    await observeBlockedBackend(await backend);
    release();
    await reclaim;
    expect(await reply).toEqual({ kind: 'stale_claim' });
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    expect(
      await first
        .selectFrom('inbox_messages')
        .select(['processing_status', 'attempt_count'])
        .where('id', '=', resolverInboxMessageId)
        .executeTakeFirst(),
    ).toMatchObject({ processing_status: 'processing', attempt_count: 2 });
  });

  it('expires at boundary and prevents late confirmation', async () => {
    const o = await owner();
    const { inboxMessageId } = await open(o);
    const repo = new KyselyConfirmationSessionRepository(first);
    expect(
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).expire({ ...o, now: later(899999) }),
        ),
    ).toEqual({ kind: 'none' });
    expect(
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).expire({ ...o, now: later(900000) }),
        ),
    ).toMatchObject({ kind: 'expired' });
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', inboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('ignored');
    const lateResolverId = await inbox(o, 'processing');
    expect(
      await first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId: lateResolverId,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(900001),
        }),
      ),
    ).toEqual({ kind: 'none' });
    void repo;
  });

  it('supersedes a pending session without executing its payload', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    expect(
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).supersede({ ...o, now: later(1000) }),
        ),
    ).toMatchObject({
      kind: 'cancelled',
      session: { id: session.id, resolutionReason: 'superseded_by_new_command' },
    });
    expect(
      (
        await first
          .selectFrom('inbox_messages')
          .select('processing_status')
          .where('id', '=', inboxMessageId)
          .executeTakeFirst()
      )?.processing_status,
    ).toBe('ignored');
    const lateResolverId = await inbox(o, 'processing');
    expect(
      await first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId: lateResolverId,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(2000),
        }),
      ),
    ).toEqual({ kind: 'none' });
  });

  it('serializes competing replies on independent connections', async () => {
    const o = await owner();
    await open(o);
    const yesId = await inbox(o, 'processing');
    const noId = await inbox(o, 'processing');
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const winner = first.transaction().execute(async (tx) => {
      const result = await new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        reply: 'no',
        resolverInboxMessageId: noId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      });
      entered();
      await held;
      return result;
    });
    await locked;
    let started!: (pid: number) => void;
    const backend = new Promise<number>((resolve) => {
      started = resolve;
    });
    const loser = second.transaction().execute(async (tx) => {
      const pid = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(tx);
      started(pid.rows[0]!.pid);
      return new KyselyConfirmationSessionRepository(tx).resolveReply({
        ...o,
        reply: 'yes',
        resolverInboxMessageId: yesId,
        attemptCount: 1,
        processingStartedAt: now,
        now: later(1000),
      });
    });
    await observeBlockedBackend(await backend);
    release();
    expect(await winner).toMatchObject({ kind: 'cancelled' });
    expect(await loser).toEqual({ kind: 'none' });
  });

  it('rejects another sender and does not touch the pending action', async () => {
    const o = await owner();
    const intruder = await owner();
    const { session } = await open(o);
    const intruderReply = await inbox(intruder, 'processing');
    expect(
      await first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...intruder,
          reply: 'yes',
          resolverInboxMessageId: intruderReply,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(1000),
        }),
      ),
    ).toEqual({ kind: 'none' });
    expect(
      (
        await first
          .selectFrom('confirmation_sessions')
          .select('status')
          .where('id', '=', session.id)
          .executeTakeFirst()
      )?.status,
    ).toBe('pending');
    await expect(
      first.transaction().execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId: intruderReply,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(1000),
        }),
      ),
    ).rejects.toThrow();
  });

  it.each(['expire', 'supersede'] as const)(
    'serializes confirm against %s across connections',
    async (operation) => {
      const o = await owner();
      const { session, inboxMessageId } = await open(o);
      const resolverInboxMessageId = await inbox(o, 'processing');
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const terminal = first.transaction().execute(async (tx) => {
        const repo = new KyselyConfirmationSessionRepository(tx);
        const result = await repo[operation]({
          ...o,
          now: operation === 'expire' ? later(900000) : later(1000),
        });
        entered();
        await held;
        return result;
      });
      await locked;
      let started!: (pid: number) => void;
      const backend = new Promise<number>((resolve) => {
        started = resolve;
      });
      const confirmation = second.transaction().execute(async (tx) => {
        const pid = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(tx);
        started(pid.rows[0]!.pid);
        return new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId,
          attemptCount: 1,
          processingStartedAt: now,
          now: later(1000),
        });
      });
      await observeBlockedBackend(await backend);
      release();
      expect(await terminal).toMatchObject({
        kind: operation === 'expire' ? 'expired' : 'cancelled',
      });
      expect(await confirmation).toEqual({ kind: 'none' });
      expect(
        (
          await first
            .selectFrom('confirmation_sessions')
            .select('status')
            .where('id', '=', session.id)
            .executeTakeFirst()
        )?.status,
      ).toBe(operation === 'expire' ? 'expired' : 'cancelled');
      expect(
        (
          await first
            .selectFrom('inbox_messages')
            .select('processing_status')
            .where('id', '=', inboxMessageId)
            .executeTakeFirst()
        )?.processing_status,
      ).toBe('ignored');
      expect(
        await first
          .selectFrom('transactions')
          .select('id')
          .where('inbox_message_id', '=', inboxMessageId)
          .execute(),
      ).toEqual([]);
    },
  );
});
