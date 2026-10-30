import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { CorrectTransaction, type FinancialTransactionContext } from '@finance-hub/core';
import { KyselyFinancialTransactionPort } from '@finance-hub/database';
import type { DB } from '../../../packages/database/src/db-types.js';
import { t02Database } from './t02-fixtures.js';

const fixture = t02Database();
const now = new Date('2026-10-29T12:00:00Z');
const ids = {
  book: randomUUID(),
  account: randomUUID(),
  second: randomUUID(),
  category: randomUUID(),
  merchant: randomUUID(),
  expense: randomUUID(),
  refund: randomUUID(),
  transfer: randomUUID(),
  voided: randomUUID(),
  reference: randomUUID(),
};
const correction = () =>
  new CorrectTransaction(new KyselyFinancialTransactionPort(fixture.db), () => now);

async function row(id: string) {
  return fixture.db
    .selectFrom('transactions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}
async function auditCount(id: string) {
  const rows = await fixture.db
    .selectFrom('audit_events')
    .selectAll()
    .where('entity_id', '=', id)
    .execute();
  return rows;
}
async function insert(
  id: string,
  type: string,
  amount: string,
  options: { refundOf?: string; status?: string; destination?: string; date?: string } = {},
) {
  await fixture.db
    .insertInto('transactions')
    .values({
      id,
      human_ref: randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
      book_id: ids.book,
      account_id: ids.account,
      destination_account_id: options.destination ?? null,
      category_id: type === 'transfer' ? null : ids.category,
      merchant_id: type === 'transfer' ? null : ids.merchant,
      type,
      status: options.status ?? 'posted',
      amount,
      currency: 'BRL',
      description: 'original',
      notes: 'old',
      transaction_date: options.date ?? '2026-10-20',
      source: 'direct_api',
      source_reference: null,
      inbox_message_id: null,
      refund_of_transaction_id: options.refundOf ?? null,
      version: 1,
      voided_at: options.status === 'voided' ? now : null,
      void_reason: options.status === 'voided' ? 'test' : null,
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
    await ctx.merchants.create({
      id: ids.merchant,
      name: ids.merchant,
      normalizedName: ids.merchant,
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  await insert(ids.expense, 'expense', '500.00');
  await insert(ids.refund, 'income', '200.00', { refundOf: ids.expense, date: '2026-10-21' });
  await insert(ids.transfer, 'transfer', '20.00', { destination: ids.second });
  await insert(ids.voided, 'expense', '10.00', { status: 'voided' });
  await insert(ids.reference, 'expense', '10.00');
}, 180000);

describe('M07-P01 correction in real PostgreSQL', () => {
  it('updates permitted fields, clears nullable fields, increments once and audits complete snapshots', async () => {
    const result = await correction().execute(
      ids.expense,
      {
        version: 1,
        amount: '450',
        accountId: ids.second,
        categoryId: null,
        merchantId: null,
        description: 'changed',
        notes: null,
        transactionDate: '2026-10-21',
      },
      randomUUID(),
    );
    expect(result).toMatchObject({
      amount: '450.00',
      accountId: ids.second,
      categoryId: null,
      merchantId: null,
      description: 'changed',
      notes: null,
      transactionDate: '2026-10-21',
      version: 2,
    });
    expect(await row(ids.expense)).toMatchObject({
      amount: '450.00',
      account_id: ids.second,
      version: 2,
    });
    const audits = await auditCount(ids.expense);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('TRANSACTION_UPDATED');
    expect(audits[0].old_data).toMatchObject({ amount: '500.00', version: 1 });
    expect(audits[0].new_data).toMatchObject({ amount: '450.00', version: 2 });
    await expect(
      correction().execute(ids.expense, { version: 2, amount: '100' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      correction().execute(
        ids.expense,
        { version: 2, transactionDate: '2026-10-22' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await row(ids.expense)).version).toBe(2);
  });

  it('ignores voided Refunds and accepts equality at amount/date bounds', async () => {
    await fixture.db
      .updateTable('transactions')
      .set({ status: 'voided', voided_at: now, void_reason: 'test' })
      .where('id', '=', ids.refund)
      .execute();
    const result = await correction().execute(
      ids.expense,
      { version: 2, amount: '100', transactionDate: '2026-10-22' },
      randomUUID(),
    );
    expect(result).toMatchObject({ amount: '100.00', transactionDate: '2026-10-22', version: 3 });
    await fixture.db
      .updateTable('transactions')
      .set({
        status: 'posted',
        voided_at: null,
        void_reason: null,
        amount: '100.00',
        transaction_date: '2026-10-22',
      })
      .where('id', '=', ids.refund)
      .execute();
    const equal = await correction().execute(
      ids.expense,
      { version: 3, amount: '100', transactionDate: '2026-10-22' },
      randomUUID(),
    );
    expect(equal.version).toBe(4);
  });

  it('preserves Transfer destination and rejects making accounts equal', async () => {
    await expect(
      correction().execute(ids.transfer, { version: 1, accountId: ids.second }, randomUUID()),
    ).rejects.toMatchObject({ code: 'TRANSFER_SAME_ACCOUNT' });
    const result = await correction().execute(
      ids.transfer,
      { version: 1, amount: '20.01' },
      randomUUID(),
    );
    expect(result.destinationAccountId).toBe(ids.second);
  });

  it('rejects stale, absent, and Refund targets', async () => {
    await expect(
      correction().execute(ids.expense, { version: 1, notes: randomUUID() }, randomUUID()),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(
      correction().execute(randomUUID(), { version: 1, notes: randomUUID() }, randomUUID()),
    ).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });
    await expect(
      correction().execute(ids.refund, { version: 1, notes: randomUUID() }, randomUUID()),
    ).rejects.toMatchObject({ code: 'REFUND_IMMUTABLE' });
    await expect(
      correction().execute(ids.voided, { version: 1, notes: 'changed' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects future dates and inactive Category and Merchant while keeping the row intact', async () => {
    const before = await row(ids.transfer);
    await expect(
      correction().execute(
        ids.transfer,
        { version: before.version, transactionDate: '2026-10-30' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRANSACTION_DATE_IN_FUTURE' });
    await fixture.db
      .updateTable('categories')
      .set({ active: false, archived_at: now })
      .where('id', '=', ids.category)
      .execute();
    await expect(
      correction().execute(ids.reference, { version: 1, description: 'no' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
    await fixture.db
      .updateTable('categories')
      .set({ active: true, archived_at: null })
      .where('id', '=', ids.category)
      .execute();
    await fixture.db
      .updateTable('merchants')
      .set({ active: false, archived_at: now })
      .where('id', '=', ids.merchant)
      .execute();
    await expect(
      correction().execute(ids.reference, { version: 1, description: 'no' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'MERCHANT_INACTIVE' });
    await fixture.db
      .updateTable('merchants')
      .set({ active: true, archived_at: null })
      .where('id', '=', ids.merchant)
      .execute();
    expect(await row(ids.transfer)).toEqual(before);
  });

  it('rolls back amount and version when audit fails', async () => {
    const before = await row(ids.transfer);
    const auditBefore = (await auditCount(ids.transfer)).length;
    const port = new KyselyFinancialTransactionPort(fixture.db);
    const poisoned = {
      runInTransaction: <T>(fn: (ctx: FinancialTransactionContext) => Promise<T>) =>
        port.runInTransaction((ctx) =>
          fn({
            ...ctx,
            audit: {
              write: async () => {
                throw new Error('forced audit failure');
              },
            },
          }),
        ),
    };
    await expect(
      new CorrectTransaction(poisoned, () => now).execute(
        ids.transfer,
        { version: before.version, amount: '30' },
        randomUUID(),
      ),
    ).rejects.toThrow('forced audit failure');
    expect(await row(ids.transfer)).toEqual(before);
    expect((await auditCount(ids.transfer)).length).toBe(auditBefore);
  });

  it('serializes competing corrections on independent PostgreSQL connections', async () => {
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
    try {
      const version = (await row(ids.transfer)).version;
      const secondPid = (await secondPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      const firstUseCase = new CorrectTransaction(
        new KyselyFinancialTransactionPort(firstDb),
        () => now,
      );
      const secondUseCase = new CorrectTransaction(
        new KyselyFinancialTransactionPort(secondDb),
        () => now,
      );
      const first = new KyselyFinancialTransactionPort(firstDb).runInTransaction(async (ctx) => {
        const result = await firstUseCase.executeInContext(
          ids.transfer,
          { version, description: 'winner' },
          randomUUID(),
          ctx,
        );
        held();
        await releasePromise;
        return result;
      });
      await heldPromise;
      const second = secondUseCase.execute(
        ids.transfer,
        { version, description: 'loser' },
        randomUUID(),
      );
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const check = await fixture.pool.query(
          'select pg_blocking_pids($1) as blockers from pg_stat_activity where pid=$1',
          [secondPid],
        );
        if (check.rows[0]?.blockers?.length) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      release();
      expect((await first).version).toBe(version + 1);
      await expect(second).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      expect((await row(ids.transfer)).description).toBe('winner');
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });

  it('waits for Account archival and revalidates the locked configuration', async () => {
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
    try {
      const before = await row(ids.transfer);
      const secondPid = (await secondPool.query('select pg_backend_pid() as pid')).rows[0]
        .pid as number;
      const archive = firstDb.transaction().execute(async (tx) => {
        await tx
          .updateTable('accounts')
          .set({ active: false, archived_at: now, updated_at: now })
          .where('id', '=', ids.account)
          .execute();
        held();
        await releasePromise;
      });
      await heldPromise;
      const correctionAttempt = new CorrectTransaction(
        new KyselyFinancialTransactionPort(secondDb),
        () => now,
      ).execute(ids.transfer, { version: before.version, notes: 'archived' }, randomUUID());
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const check = await fixture.pool.query(
          'select pg_blocking_pids($1) as blockers from pg_stat_activity where pid=$1',
          [secondPid],
        );
        if (check.rows[0]?.blockers?.length) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      release();
      await archive;
      await expect(correctionAttempt).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
      expect(await row(ids.transfer)).toEqual(before);
    } finally {
      release();
      await firstDb.destroy();
      await secondDb.destroy();
    }
  });
});
