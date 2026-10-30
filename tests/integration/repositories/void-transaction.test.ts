import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { KyselyFinancialTransactionPort } from '@finance-hub/database';
import {
  VoidTransaction,
  CorrectTransaction,
  type FinancialTransactionPort,
} from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-29T12:00:00Z');
const ids = {
  book: randomUUID(),
  account: randomUUID(),
  second: randomUUID(),
  category: randomUUID(),
  expense: randomUUID(),
  income: randomUUID(),
  transfer: randomUUID(),
  refund: randomUUID(),
  blocked: randomUUID(),
  blockedRefund: randomUUID(),
  rollback: randomUUID(),
  raceSame: randomUUID(),
  raceDifferent: randomUUID(),
  racePatch: randomUUID(),
};
const port = () => new KyselyFinancialTransactionPort(fixture.db);
const service = () => new VoidTransaction(port(), () => now);
const read = (id: string) =>
  fixture.db.selectFrom('transactions').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const audits = (id: string) =>
  fixture.db.selectFrom('audit_events').selectAll().where('entity_id', '=', id).execute();
const keys = (key: string) =>
  fixture.db
    .selectFrom('idempotency_keys')
    .selectAll()
    .where('idempotency_key', '=', key)
    .execute();

async function insert(id: string, type: string, refundOf?: string) {
  await fixture.db
    .insertInto('transactions')
    .values({
      id,
      human_ref: randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
      book_id: ids.book,
      account_id: ids.account,
      destination_account_id: type === 'transfer' ? ids.second : null,
      category_id: type === 'transfer' ? null : ids.category,
      merchant_id: null,
      type,
      status: 'posted',
      amount: id === ids.blocked ? '50.00' : '20.00',
      currency: 'BRL',
      description: 'original',
      notes: null,
      transaction_date: '2026-10-20',
      source: 'direct_api',
      source_reference: null,
      inbox_message_id: null,
      refund_of_transaction_id: refundOf ?? null,
      version: 1,
      voided_at: null,
      void_reason: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

beforeAll(async () => {
  await fixture.run(async (ctx) => {
    await ctx.books.create({
      id: ids.book,
      name: ids.book,
      normalizedName: ids.book,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const id of [ids.account, ids.second])
      await ctx.accounts.create({
        id,
        bookId: ids.book,
        name: id,
        normalizedName: id,
        type: 'checking',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    await ctx.categories.create({
      id: ids.category,
      bookId: ids.book,
      name: ids.category,
      normalizedName: ids.category,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  for (const [id, type, refundOf] of [
    [ids.expense, 'expense'],
    [ids.income, 'income'],
    [ids.transfer, 'transfer'],
    [ids.blocked, 'expense'],
    [ids.refund, 'income', ids.blocked],
    [ids.blockedRefund, 'income', ids.blocked],
    [ids.rollback, 'expense'],
    [ids.raceSame, 'income'],
    [ids.raceDifferent, 'income'],
    [ids.racePatch, 'income'],
  ] as const)
    await insert(id, type, refundOf);
}, 180000);

describe('M07-P02 Void on PostgreSQL', () => {
  it('voids Income and Transfer exactly once with complete before/after audit', async () => {
    for (const id of [ids.income, ids.transfer]) {
      const before = await read(id);
      const result = await service().execute(
        id,
        { version: 1, reason: 'duplicate' },
        randomUUID(),
        randomUUID(),
      );
      expect(result).toMatchObject({
        id,
        status: 'voided',
        version: 2,
        voidReason: 'duplicate',
        bookId: before.book_id,
        amount: String(before.amount),
        source: before.source,
      });
      const events = await audits(id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'TRANSACTION_VOIDED',
        source: 'direct_api',
        actor_reference: null,
      });
      expect(events[0].old_data).toMatchObject({ status: 'posted', version: 1 });
      expect(events[0].new_data).toMatchObject({ status: 'voided', version: 2 });
    }
  });

  it('replays persisted response without additional mutation or audit, and rejects changed operations', async () => {
    const key = randomUUID();
    const input = { version: 1, reason: 'duplicate' };
    const result = await service().execute(ids.expense, input, key, randomUUID());
    const replay = await service().execute(ids.expense, input, key, randomUUID());
    expect(replay).toEqual(result);
    expect((await read(ids.expense)).version).toBe(2);
    expect(await audits(ids.expense)).toHaveLength(1);
    expect(await keys(key)).toMatchObject([{ scope: 'transactions:void', response_status: 200 }]);
    for (const changed of [
      { version: 2, reason: 'duplicate' },
      { version: 1, reason: 'other' },
    ])
      await expect(
        service().execute(ids.expense, changed, key, randomUUID()),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(service().execute(ids.income, input, key, randomUUID())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(service().execute(randomUUID(), input, key, randomUUID())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      service().execute(randomUUID(), input, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({
      code: 'TRANSACTION_NOT_FOUND',
    });
    await expect(
      service().execute(ids.expense, input, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'TRANSACTION_ALREADY_VOIDED' });
  });

  it('keeps the create scope separate and accepts trusted caller-owned provenance', async () => {
    const key = randomUUID();
    await fixture.run(async (ctx) => {
      await ctx.idempotencyKeys.create({
        id: randomUUID(),
        idempotencyKey: key,
        scope: 'transactions:create',
        requestHash: 'create-fingerprint',
        createdAt: now,
      });
    });
    const id = randomUUID();
    await insert(id, 'income');
    const financial = port();
    await financial.runInTransaction(async (ctx) => {
      const result = await new VoidTransaction(financial, () => now).executeInContext(
        id,
        { version: 1, reason: 'duplicate' },
        key,
        randomUUID(),
        ctx,
        { senderReference: 'validated-sender' },
      );
      expect(result.status).toBe('voided');
    });
    expect(await keys(key)).toHaveLength(2);
    expect(await audits(id)).toMatchObject([
      { source: 'whatsapp', actor_reference: 'validated-sender' },
    ]);
  });

  it('locks original before Refund, permits Refund Void, then permits original Expense Void', async () => {
    await expect(
      service().execute(
        ids.blocked,
        { version: 1, reason: 'duplicate' },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRANSACTION_HAS_POSTED_REFUNDS' });
    expect((await read(ids.blocked)).status).toBe('posted');
    const result = await service().execute(
      ids.blockedRefund,
      { version: 1, reason: 'incorrect refund' },
      randomUUID(),
      randomUUID(),
    );
    expect(result.refundOfTransactionId).toBe(ids.blocked);
    expect((await read(ids.blockedRefund)).status).toBe('voided');
    await service().execute(
      ids.refund,
      { version: 1, reason: 'incorrect refund' },
      randomUUID(),
      randomUUID(),
    );
    expect(
      (
        await service().execute(
          ids.blocked,
          { version: 1, reason: 'duplicate' },
          randomUUID(),
          randomUUID(),
        )
      ).status,
    ).toBe('voided');
  });

  it('rolls back mutation, audit, and claim when audit or completion fails', async () => {
    const original = await read(ids.rollback);
    for (const failing of ['audit', 'idempotency'] as const) {
      const key = randomUUID();
      const base = port();
      const poisoned: FinancialTransactionPort = {
        runInTransaction: (fn) =>
          base.runInTransaction((ctx) =>
            fn({
              ...ctx,
              audit:
                failing === 'audit'
                  ? {
                      write: async () => {
                        throw new Error('forced audit');
                      },
                    }
                  : ctx.audit,
              idempotencyKeys:
                failing === 'idempotency'
                  ? {
                      ...ctx.idempotencyKeys,
                      create: ctx.idempotencyKeys.create.bind(ctx.idempotencyKeys),
                      findByKeyAndScopeForUpdate:
                        ctx.idempotencyKeys.findByKeyAndScopeForUpdate.bind(ctx.idempotencyKeys),
                      findByKeyAndScope: ctx.idempotencyKeys.findByKeyAndScope.bind(
                        ctx.idempotencyKeys,
                      ),
                      complete: async () => {
                        throw new Error('forced completion');
                      },
                    }
                  : ctx.idempotencyKeys,
            }),
          ),
      };
      await expect(
        new VoidTransaction(poisoned, () => now).execute(
          ids.rollback,
          { version: 1, reason: 'duplicate' },
          key,
          randomUUID(),
        ),
      ).rejects.toThrow(`forced ${failing === 'audit' ? 'audit' : 'completion'}`);
      expect(await read(ids.rollback)).toEqual(original);
      expect(await audits(ids.rollback)).toHaveLength(0);
      expect(await keys(key)).toHaveLength(0);
    }
    expect(
      (
        await service().execute(
          ids.rollback,
          { version: 1, reason: 'duplicate' },
          randomUUID(),
          randomUUID(),
        )
      ).version,
    ).toBe(2);
  });

  it.each([
    ['same key', ids.raceSame],
    ['different keys', ids.raceDifferent],
    ['Void/PATCH', ids.racePatch],
  ] as const)(
    'serializes %s on independent PostgreSQL connections',
    async (scenario, id) => {
      const firstPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
      const secondPool = new Pool({ connectionString: fixture.connectionString, max: 1 });
      const firstDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: firstPool }) });
      const secondDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: secondPool }) });
      let release!: () => void;
      let held!: () => void;
      const releasePromise = new Promise<void>((resolve) => {
        release = resolve;
      });
      const heldPromise = new Promise<void>((resolve) => {
        held = resolve;
      });
      const key = randomUUID();
      const input = { version: 1, reason: 'duplicate' };
      try {
        const firstPort = new KyselyFinancialTransactionPort(firstDb);
        const secondPort = new KyselyFinancialTransactionPort(secondDb);
        const firstUseCase = new VoidTransaction(firstPort, () => now);
        const secondUseCase = new VoidTransaction(secondPort, () => now);
        const secondPid = (await secondPool.query('select pg_backend_pid() as pid')).rows[0]
          .pid as number;
        const first = firstPort.runInTransaction(async (ctx) => {
          const result = await firstUseCase.executeInContext(id, input, key, randomUUID(), ctx);
          held();
          await releasePromise;
          return result;
        });
        await heldPromise;
        const second =
          scenario === 'Void/PATCH'
            ? new CorrectTransaction(secondPort, () => now).execute(
                id,
                { version: 1, description: 'loser' },
                randomUUID(),
              )
            : secondUseCase.execute(
                id,
                input,
                scenario === 'same key' ? key : randomUUID(),
                randomUUID(),
              );
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const result = await fixture.pool.query(
            'select pg_blocking_pids($1) as blockers from pg_stat_activity where pid=$1',
            [secondPid],
          );
          if (result.rows[0]?.blockers?.length) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
        release();
        const winner = await first;
        if (scenario === 'same key') expect(await second).toEqual(winner);
        else
          await expect(second).rejects.toMatchObject({
            code: scenario === 'different keys' ? 'TRANSACTION_ALREADY_VOIDED' : 'VERSION_CONFLICT',
          });
        expect((await read(id)).version).toBe(2);
        expect(await audits(id)).toHaveLength(1);
      } finally {
        release();
        await firstDb.destroy();
        await secondDb.destroy();
      }
    },
    30000,
  );
});
