import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  CreateRefund,
  CorrectTransaction,
  VoidTransaction,
  type FinancialTransactionPort,
} from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from '@finance-hub/database';
import { t02Database } from './t02-fixtures.js';
import { coordinatedFinancialPair } from '../helpers/financial-create-race.js';

const fixture = t02Database();
const now = new Date('2026-10-29T12:00:00Z');
const ids = {
  book: randomUUID(),
  account: randomUUID(),
  expense: randomUUID(),
  full: randomUUID(),
  rollback: randomUUID(),
  rollbackCompletion: randomUUID(),
  race: randomUUID(),
};
const service = () =>
  new CreateRefund(
    new KyselyFinancialTransactionPort(fixture.db),
    { generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase() },
    () => now,
  );
const input = (amount: string) => ({
  version: 1,
  amount,
  accountId: ids.account,
  transactionDate: '2026-10-29',
  description: 'refund',
});
const rows = (id: string) =>
  fixture.db
    .selectFrom('transactions')
    .selectAll()
    .where('refund_of_transaction_id', '=', id)
    .execute();

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
    await ctx.accounts.create({
      id: ids.account,
      bookId: ids.book,
      name: ids.account,
      normalizedName: ids.account,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  for (const [id, amount] of [
    [ids.expense, '500.00'],
    [ids.full, '500.00'],
    [ids.rollback, '500.00'],
    [ids.rollbackCompletion, '500.00'],
    [ids.race, '500.00'],
  ] as const)
    await fixture.db
      .insertInto('transactions')
      .values({
        id,
        human_ref: randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
        book_id: ids.book,
        account_id: ids.account,
        destination_account_id: null,
        category_id: null,
        merchant_id: null,
        type: 'expense',
        status: 'posted',
        amount,
        currency: 'BRL',
        description: 'expense',
        notes: null,
        transaction_date: '2026-10-20',
        source: 'direct_api',
        source_reference: null,
        inbox_message_id: null,
        refund_of_transaction_id: null,
        version: 1,
        voided_at: null,
        void_reason: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
}, 180000);

describe('M07-P03 Refund persistence', () => {
  it('creates linked Income with exact Money, audit, replay and unchanged original', async () => {
    const key = randomUUID();
    const before = await fixture.db
      .selectFrom('transactions')
      .selectAll()
      .where('id', '=', ids.expense)
      .executeTakeFirstOrThrow();
    const created = await service().execute(ids.expense, input('300.00'), key, randomUUID());
    expect(created).toMatchObject({
      type: 'income',
      status: 'posted',
      amount: '300.00',
      currency: 'BRL',
      bookId: ids.book,
      refundOfTransactionId: ids.expense,
      version: 1,
    });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect((await service().execute(ids.expense, input('300'), key, randomUUID())).id).toBe(
      created.id,
    );
    expect(await rows(ids.expense)).toHaveLength(1);
    expect(
      await fixture.db
        .selectFrom('transactions')
        .selectAll()
        .where('id', '=', ids.expense)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
    const audit = await fixture.db
      .selectFrom('audit_events')
      .selectAll()
      .where('entity_id', '=', created.id)
      .execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'TRANSACTION_REFUND_CREATED',
      source: 'direct_api',
      actor_reference: null,
    });
    expect(audit[0].new_data).toMatchObject({
      refundOfTransactionId: ids.expense,
      amount: '300.00',
    });
    await expect(
      service().execute(ids.expense, input('200.00'), key, randomUUID()),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('accepts multiple partial Refunds and exact remaining boundary, rejects excess', async () => {
    await expect(
      service().execute(ids.expense, input('200.00'), randomUUID(), randomUUID()),
    ).resolves.toMatchObject({ amount: '200.00' });
    await expect(
      service().execute(ids.expense, input('0.01'), randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'REFUND_AMOUNT_EXCEEDED' });
    expect((await rows(ids.expense)).map((row) => String(row.amount)).sort()).toEqual([
      '200.00',
      '300.00',
    ]);
    await expect(
      service().execute(ids.full, input('500.00'), randomUUID(), randomUUID()),
    ).resolves.toMatchObject({ amount: '500.00' });
  });

  it('rejects wrong targets, stale versions and invalid dates', async () => {
    const refund = (await rows(ids.full))[0];
    await expect(
      service().execute(refund.id, input('1.00'), randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'REFUND_INVALID_TARGET' });
    await expect(
      service().execute(ids.rollback, { ...input('1.00'), version: 2 }, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(
      service().execute(
        ids.rollback,
        { ...input('1.00'), transactionDate: '2026-10-19' },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REFUND_DATE_INVALID' });
  });

  it('preserves correction and Void guards and releases capacity after Refund Void', async () => {
    const correct = new CorrectTransaction(
      new KyselyFinancialTransactionPort(fixture.db),
      () => now,
    );
    await expect(
      correct.execute(ids.expense, { version: 1, amount: '499.99' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const voider = new VoidTransaction(new KyselyFinancialTransactionPort(fixture.db), () => now);
    await expect(
      voider.execute(ids.expense, { version: 1, reason: 'test' }, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'TRANSACTION_HAS_POSTED_REFUNDS' });
    const refund = (await rows(ids.full))[0];
    await voider.execute(refund.id, { version: 1, reason: 'test' }, randomUUID(), randomUUID());
    await expect(
      service().execute(ids.full, input('500.00'), randomUUID(), randomUUID()),
    ).resolves.toMatchObject({ amount: '500.00' });
  });

  it('serializes distinct keys on independent PostgreSQL backends and prevents over-refund', async () => {
    const keyA = randomUUID();
    const keyB = randomUUID();
    const results = await coordinatedFinancialPair(
      fixture.connectionString,
      fixture.pool,
      (ctx) => service().executeInContext(ids.race, input('300.00'), keyA, randomUUID(), ctx),
      (ctx) => service().executeInContext(ids.race, input('300.00'), keyB, randomUUID(), ctx),
      (first, second) => {
        expect(first).toContain(ids.account);
        expect(second).toContain(ids.account);
      },
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ code: 'REFUND_AMOUNT_EXCEEDED' });
    expect((await rows(ids.race)).map((row) => String(row.amount))).toEqual(['300.00']);
    await expect(
      service().execute(ids.race, input('200.00'), randomUUID(), randomUUID()),
    ).resolves.toMatchObject({ amount: '200.00' });
  });

  it('rolls back Refund, audit and idempotency on audit or completion failure, then retries once', async () => {
    const realPort = new KyselyFinancialTransactionPort(fixture.db);
    for (const failAt of ['audit', 'completion'] as const) {
      const key = randomUUID();
      const originalId = failAt === 'audit' ? ids.rollback : ids.rollbackCompletion;
      const injected: FinancialTransactionPort = {
        runInTransaction: (fn) =>
          realPort.runInTransaction((ctx) =>
            fn({
              ...ctx,
              audit:
                failAt === 'audit'
                  ? {
                      write: async () => {
                        throw new Error('injected audit failure');
                      },
                    }
                  : ctx.audit,
              idempotencyKeys:
                failAt === 'completion'
                  ? {
                      create: (value) => ctx.idempotencyKeys.create(value),
                      findByKeyAndScope: (key, scope) =>
                        ctx.idempotencyKeys.findByKeyAndScope(key, scope),
                      findByKeyAndScopeForUpdate: (key, scope) =>
                        ctx.idempotencyKeys.findByKeyAndScopeForUpdate(key, scope),
                      complete: async () => {
                        throw new Error('injected completion failure');
                      },
                    }
                  : ctx.idempotencyKeys,
            }),
          ),
      };
      const failing = new CreateRefund(
        injected,
        { generate: () => randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase() },
        () => now,
      );
      await expect(failing.execute(originalId, input('100.00'), key, key)).rejects.toThrow(
        `injected ${failAt} failure`,
      );
      expect(await rows(originalId)).toHaveLength(0);
      expect(
        await fixture.db
          .selectFrom('audit_events')
          .selectAll()
          .where('action', '=', 'TRANSACTION_REFUND_CREATED')
          .where('correlation_id', '=', key)
          .execute(),
      ).toHaveLength(0);
      expect(
        await fixture.db
          .selectFrom('idempotency_keys')
          .selectAll()
          .where('idempotency_key', '=', key)
          .execute(),
      ).toHaveLength(0);
      const result = await service().execute(originalId, input('100.00'), key, randomUUID());
      expect(result.refundOfTransactionId).toBe(originalId);
    }
    expect(await rows(ids.rollback)).toHaveLength(1);
    expect(await rows(ids.rollbackCompletion)).toHaveLength(1);
  });
});
