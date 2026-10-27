import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  resolveInterpretation,
  type Interpretation,
  type MasterDataTransactionContextT04,
  type TransactionPort,
} from '@finance-hub/core';
import { KyselyInboxConfigurationReader, KyselyTransactionPort } from '@finance-hub/database';
import type { DB } from '../../../packages/database/src/db-types.js';
import { t02Database } from '../repositories/t02-fixtures.js';

const fixture = t02Database();
const instant = new Date('2026-10-27T12:00:00.000Z');
const value = <T>(item: T) => ({
  value: item,
  raw: String(item),
  provenance: 'explicit_input' as const,
});
const candidate = (
  fields: Partial<Extract<Interpretation, { kind: 'create_transaction' }>> = {},
): Interpretation => ({
  kind: 'create_transaction',
  transactionType: value('expense'),
  amount: value('10.00'),
  description: value('cafe'),
  ...fields,
});

async function seed() {
  const db = fixture.db;
  await db
    .updateTable('classification_rules')
    .set({ active: false, updated_at: instant })
    .execute();
  const id = {
    book: randomUUID(),
    account: randomUUID(),
    other: randomUUID(),
    category: randomUUID(),
    merchant: randomUUID(),
    rule: randomUUID(),
    sender: randomUUID(),
  };
  const reference = randomUUID();
  await db
    .insertInto('books')
    .values({
      id: id.book,
      name: `Book ${id.book}`,
      normalized_name: id.book,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archived_at: null,
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  for (const accountId of [id.account, id.other]) {
    await db
      .insertInto('accounts')
      .values({
        id: accountId,
        book_id: id.book,
        name: accountId,
        normalized_name: accountId,
        type: 'checking',
        currency: 'BRL',
        institution_name: null,
        notes: null,
        active: true,
        archived_at: null,
        created_at: instant,
        updated_at: instant,
      })
      .execute();
  }
  await db
    .insertInto('categories')
    .values({
      id: id.category,
      book_id: id.book,
      name: id.category,
      normalized_name: id.category,
      parent_category_id: null,
      type: 'expense',
      active: true,
      archived_at: null,
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  await db
    .insertInto('merchants')
    .values({
      id: id.merchant,
      name: id.merchant,
      normalized_name: id.merchant,
      type: null,
      tax_identifier: null,
      active: true,
      archived_at: null,
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  await db
    .insertInto('classification_rules')
    .values({
      id: id.rule,
      priority: 10,
      active: true,
      match_type: 'contains',
      pattern: 'cafe',
      normalized_pattern: 'cafe',
      target_book_id: null,
      target_account_id: null,
      target_category_id: id.category,
      target_merchant_id: id.merchant,
      source: 'manual',
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  await db
    .insertInto('authorized_senders')
    .values({
      id: id.sender,
      channel: 'whatsapp',
      sender_reference: reference,
      name: null,
      default_book_id: id.book,
      default_account_id: id.account,
      active: true,
      created_at: instant,
      updated_at: instant,
    })
    .execute();
  return { id, reference };
}

function request(interpretation: Interpretation, reference: string) {
  return {
    interpretation,
    channel: 'whatsapp',
    senderReference: reference,
    receivedAt: instant,
    now: instant,
  };
}

/** Pause deterministically after preliminary discovery, before the ordered lock call. */
async function race(
  interpretation: Interpretation,
  reference: string,
  update: (db: Kysely<DB>) => Promise<void>,
) {
  const discovered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let first = true;
  const base = new KyselyTransactionPort(fixture.db);
  const port: TransactionPort<MasterDataTransactionContextT04> = {
    runInTransaction: (fn) =>
      base.runInTransaction((ctx) =>
        fn({
          ...ctx,
          locks: {
            acquireLocks: async (spec) => {
              if (first) {
                first = false;
                discovered.resolve();
                await release.promise;
              }
              await ctx.locks.acquireLocks(spec);
            },
          },
        }),
      ),
  };
  const pending = resolveInterpretation(request(interpretation, reference), port);
  await discovered.promise;
  const other = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: fixture.connectionString }),
    }),
  });
  try {
    await update(other);
  } finally {
    await other.destroy();
    release.resolve();
  }
  return pending;
}

describe('P03 PostgreSQL configuration races', { timeout: 60000 }, () => {
  it('returns a complete create DTO with no financial write', async () => {
    const { id, reference } = await seed();
    const result = await new KyselyInboxConfigurationReader(fixture.db).resolve(
      request(candidate(), reference),
    );
    expect(result).toMatchObject({
      kind: 'create',
      input: {
        bookId: id.book,
        accountId: id.account,
        categoryId: id.category,
        merchantId: id.merchant,
        amount: '10.00',
        transactionDate: '2026-10-27',
      },
    });
    expect(await fixture.db.selectFrom('transactions').select('id').execute()).toHaveLength(0);
  });
  it.each(['expense', 'income'] as const)(
    'resolves a persisted both Category for %s explicitly and through a rule',
    async (transactionType) => {
      const { id, reference } = await seed();
      await fixture.db
        .updateTable('categories')
        .set({ type: 'both', updated_at: new Date() })
        .where('id', '=', id.category)
        .execute();
      const reader = new KyselyInboxConfigurationReader(fixture.db);
      for (const fields of [{ category: value(id.category) }, {}]) {
        expect(
          await reader.resolve(
            request(candidate({ transactionType: value(transactionType), ...fields }), reference),
          ),
        ).toMatchObject({
          kind: 'create',
          input: { type: transactionType, categoryId: id.category },
        });
      }
      expect(await fixture.db.selectFrom('transactions').select('id').execute()).toHaveLength(0);
    },
  );
  it('rejects a persisted incompatible Category for Income', async () => {
    const { id, reference } = await seed();
    const reader = new KyselyInboxConfigurationReader(fixture.db);
    expect(
      await reader.resolve(
        request(
          candidate({ transactionType: value('income'), category: value(id.category) }),
          reference,
        ),
      ),
    ).toEqual({ kind: 'clarification', field: 'category', reason: 'invalid' });
    expect(
      await reader.resolve(request(candidate({ transactionType: value('income') }), reference)),
    ).toMatchObject({ kind: 'create', input: { categoryId: null } });
    expect(await fixture.db.selectFrom('transactions').select('id').execute()).toHaveLength(0);
  });
  it('rereads sender default changes from an independent connection', async () => {
    const { id, reference } = await seed();
    const result = await race(candidate(), reference, async (db) => {
      await db
        .updateTable('authorized_senders')
        .set({ default_account_id: id.other, updated_at: new Date() })
        .where('id', '=', id.sender)
        .execute();
    });
    expect(result).toMatchObject({ kind: 'create', input: { accountId: id.other } });
  });
  it('ignores a deactivated rule after ordered locking', async () => {
    const { id, reference } = await seed();
    const result = await race(candidate(), reference, async (db) => {
      await db
        .updateTable('classification_rules')
        .set({ active: false, updated_at: new Date() })
        .where('id', '=', id.rule)
        .execute();
    });
    expect(result).toMatchObject({ kind: 'create', input: { categoryId: null, merchantId: null } });
  });
  it('retries the whole transaction when an explicit Merchant appears after discovery', async () => {
    const { reference } = await seed();
    const merchantId = randomUUID();
    const result = await race(
      candidate({ merchant: value('new-merchant') }),
      reference,
      async (db) => {
        await db
          .insertInto('merchants')
          .values({
            id: merchantId,
            name: 'new-merchant',
            normalized_name: 'new-merchant',
            type: null,
            tax_identifier: null,
            active: true,
            archived_at: null,
            created_at: instant,
            updated_at: instant,
          })
          .execute();
      },
    );
    expect(result).toMatchObject({ kind: 'create', input: { merchantId } });
  });
  it.each(['book', 'account', 'category', 'merchant'] as const)(
    'rejects a %s archived during discovery',
    async (target) => {
      const { id, reference } = await seed();
      const table = {
        book: 'books',
        account: 'accounts',
        category: 'categories',
        merchant: 'merchants',
      } as const;
      const input = candidate(
        target === 'category'
          ? { category: value(id.category) }
          : target === 'merchant'
            ? { merchant: value(id.merchant) }
            : target === 'account'
              ? { account: value(id.account) }
              : { book: value(id.book) },
      );
      const result = await race(input, reference, async (db) => {
        await db
          .updateTable(table[target])
          .set({ active: false, archived_at: new Date(), updated_at: new Date() })
          .where('id', '=', id[target])
          .execute();
      });
      expect(result).toEqual({ kind: 'clarification', field: target, reason: 'invalid' });
      expect(await fixture.db.selectFrom('transactions').select('id').execute()).toHaveLength(0);
    },
  );
  it('returns only a validated Book ID for Last and performs no query or write', async () => {
    const { id, reference } = await seed();
    expect(
      await new KyselyInboxConfigurationReader(fixture.db).resolve(
        request({ kind: 'query_last' }, reference),
      ),
    ).toEqual({ kind: 'query_last', bookId: id.book });
    expect(await fixture.db.selectFrom('transactions').select('id').execute()).toHaveLength(0);
  });
});
