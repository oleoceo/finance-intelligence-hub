import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
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

  async function open(o: Awaited<ReturnType<typeof owner>>, at = now) {
    const inboxMessageId = await inbox(o, 'needs_confirmation');
    const id = randomUUID();
    const session = await first
      .transaction()
      .execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).create({
          ...o,
          id,
          inboxMessageId,
          action: 'create_transaction',
          payload: { amount: '10.00' },
          now: at,
        }),
      );
    return { session, inboxMessageId };
  }

  it('persists origin, payload and 15-minute TTL; rejects a second pending row', async () => {
    const o = await owner();
    const { session } = await open(o);
    expect(session.expiresAt).toEqual(later(900000));
    expect(session.payload).toEqual({ amount: '10.00' });
    const other = await inbox(o, 'needs_confirmation');
    await expect(
      first
        .transaction()
        .execute((tx) =>
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
    const result = await first
      .transaction()
      .execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'no',
          resolverInboxMessageId,
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
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId: lateResolverId,
            now: later(2000),
          }),
        ),
    ).toEqual({ kind: 'none' });
  });

  it('keeps confirmed original and resolver for P05 shared financial commit', async () => {
    const o = await owner();
    const { inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    const result = await first
      .transaction()
      .execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId,
          now: later(1000),
        }),
      );
    expect(result).toMatchObject({
      kind: 'confirmed',
      session: { inboxMessageId, resolvedByInboxMessageId: resolverInboxMessageId },
    });
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

  it('rolls back confirmation and linked Inbox finalization with the caller transaction', async () => {
    const o = await owner();
    const { session, inboxMessageId } = await open(o);
    const resolverInboxMessageId = await inbox(o, 'processing');
    await expect(
      first.transaction().execute(async (tx) => {
        const repo = new KyselyConfirmationSessionRepository(tx);
        expect(
          await repo.resolveReply({ ...o, reply: 'yes', resolverInboxMessageId, now: later(1000) }),
        ).toMatchObject({ kind: 'confirmed' });
        await repo.finalizeConfirmed({ sessionId: session.id, now: later(1000) });
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
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId: lateResolverId,
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
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId: lateResolverId,
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
        now: later(1000),
      });
      entered();
      await held;
      return result;
    });
    await locked;
    const loser = second
      .transaction()
      .execute((tx) =>
        new KyselyConfirmationSessionRepository(tx).resolveReply({
          ...o,
          reply: 'yes',
          resolverInboxMessageId: yesId,
          now: later(1000),
        }),
      );
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
      await first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...intruder,
            reply: 'yes',
            resolverInboxMessageId: intruderReply,
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
      first
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId: intruderReply,
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
      const confirmation = second
        .transaction()
        .execute((tx) =>
          new KyselyConfirmationSessionRepository(tx).resolveReply({
            ...o,
            reply: 'yes',
            resolverInboxMessageId,
            now: later(1000),
          }),
        );
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
