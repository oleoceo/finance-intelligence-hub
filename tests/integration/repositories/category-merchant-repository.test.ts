/**
 * PostgreSQL integration tests for Category and Merchant repositories (M03-T03).
 *
 * Tests real database behavior including:
 * - Category create/read/list/update/archive with hierarchy
 * - Root/sibling uniqueness (partial indexes)
 * - Same-Book FK, self-parent CHECK
 * - Merchant create/read/list/update/archive
 * - Duplicate normalized_name permitted for Merchant
 * - Merchant persistence and lookup
 * - Hierarchy concurrency (Book lock + cycle detection)
 * - Concurrent duplicate Merchant creation
 * - Historical transaction retention after archive
 * - ClassificationRule references do not block archive
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import {
  KyselyBookRepository,
  KyselyCategoryRepository,
  KyselyMerchantRepository,
  KyselyTransactionPort,
} from '@finance-hub/database';
import { migrateUp } from '@finance-hub/database';
import {
  createCategory,
  updateCategory,
  archiveCategory,
  reactivateCategory,
  createMerchant,
  updateMerchant,
  archiveMerchant,
  ValidationError,
  ConfigurationLockSetChangedError,
} from '@finance-hub/core';
import type { DB } from '../../../packages/database/src/db-types.js';
import type { MasterDataTransactionContext, CategoryRecord } from '@finance-hub/core';

const v7 = randomUUID;

let container: StartedTestContainer;
let connectionString: string;
let pool: Pool;
let db: Kysely<DB>;

beforeAll(async () => {
  const password = randomUUID();
  container = await new GenericContainer('postgres:18.6-bookworm')
    .withEnvironment({
      POSTGRES_DB: 'cat_merch_test_db',
      POSTGRES_USER: 'cat_merch_user',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
    .withStartupTimeout(120000)
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();

  await new Promise((resolve) => setTimeout(resolve, 3000));

  connectionString = `postgresql://cat_merch_user:${password}@${host}:${port}/cat_merch_test_db`;

  await migrateUp({ connectionString });

  pool = new Pool({ connectionString });
  db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}, 180000);

afterAll(async () => {
  if (db) await db.destroy();
  if (container) await container.stop();
});

// ──────────────────────────────────────────────────────────────────────────
// Category integration
// ──────────────────────────────────────────────────────────────────────────

describe('Category Repository Integration', () => {
  async function createBook(id: string, normalizedName?: string): Promise<void> {
    const name = normalizedName ?? `cat book ${v7().slice(0, 8)}`;
    const now = new Date();
    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, name, name.toLowerCase(), 'BRL', 'America/Sao_Paulo', true, null, now, now],
    );
  }

  it('should create a root category', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const catId = v7();
    const now = new Date();

    await catRepo.create({
      id: catId,
      bookId,
      name: 'Root Category',
      normalizedName: 'root category',
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await catRepo.findById(catId);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Root Category');
    expect(found?.parentCategoryId).toBeNull();
  });

  it('should create a child category', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const parentId = v7();
    const childId = v7();
    const now = new Date();

    await catRepo.create({
      id: parentId,
      bookId,
      name: 'Parent',
      normalizedName: 'parent',
      parentCategoryId: null,
      type: 'expense',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await catRepo.create({
      id: childId,
      bookId,
      name: 'Child',
      normalizedName: 'child',
      parentCategoryId: parentId,
      type: 'expense',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const child = await catRepo.findById(childId);
    expect(child?.parentCategoryId).toBe(parentId);
  });

  it('should enforce root uniqueness within same Book', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const now = new Date();

    await catRepo.create({
      id: v7(),
      bookId,
      name: 'Root Dup',
      normalizedName: 'root dup',
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      catRepo.create({
        id: v7(),
        bookId,
        name: 'Root Dup Two',
        normalizedName: 'root dup',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should enforce child uniqueness within same Book/parent', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const parentId = v7();
    const now = new Date();

    await catRepo.create({
      id: parentId,
      bookId,
      name: 'Parent',
      normalizedName: `parent ${v7().slice(0, 8)}`,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const childName = `child dup ${v7().slice(0, 8)}`;

    await catRepo.create({
      id: v7(),
      bookId,
      name: 'Child One',
      normalizedName: childName,
      parentCategoryId: parentId,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      catRepo.create({
        id: v7(),
        bookId,
        name: 'Child Two',
        normalizedName: childName,
        parentCategoryId: parentId,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should allow same name under different parents', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const parentA = v7();
    const parentB = v7();
    const now = new Date();

    await catRepo.create({
      id: parentA,
      bookId,
      name: 'Parent A',
      normalizedName: `parent a ${v7().slice(0, 8)}`,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await catRepo.create({
      id: parentB,
      bookId,
      name: 'Parent B',
      normalizedName: `parent b ${v7().slice(0, 8)}`,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const sharedName = `shared child ${v7().slice(0, 8)}`;

    await catRepo.create({
      id: v7(),
      bookId,
      name: 'Shared',
      normalizedName: sharedName,
      parentCategoryId: parentA,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await catRepo.create({
      id: v7(),
      bookId,
      name: 'Shared',
      normalizedName: sharedName,
      parentCategoryId: parentB,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const all = await catRepo.findByBookId(bookId);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it('should enforce same-Book FK for parent', async () => {
    const bookId1 = v7();
    const bookId2 = v7();
    await createBook(bookId1);
    await createBook(bookId2);
    const catRepo = new KyselyCategoryRepository(db);
    const parentInBook2 = v7();
    const now = new Date();

    await catRepo.create({
      id: parentInBook2,
      bookId: bookId2,
      name: 'Other Book Parent',
      normalizedName: `other parent ${v7().slice(0, 8)}`,
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const txPort = new KyselyTransactionPort(db);
    await expect(
      txPort.runInTransaction(async (ctx) => {
        return createCategory(
          { bookId: bookId1, name: 'Cross Book Child', parentCategoryId: parentInBook2 },
          ctx,
          new Date(),
        );
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('should enforce self-parent CHECK constraint', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catId = v7();
    const now = new Date();

    // Direct insert with self-parent should fail at DB level
    await expect(
      pool.query(
        `INSERT INTO categories (id, book_id, name, normalized_name, parent_category_id, type, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [catId, bookId, 'Self Parent', 'self parent', catId, 'both', true, null, now, now],
      ),
    ).rejects.toThrow();
  });

  it('should enforce root/sibling unique on rename via update', async () => {
    const bookId = v7();
    await createBook(bookId);
    const catRepo = new KyselyCategoryRepository(db);
    const catA = v7();
    const catB = v7();
    const now = new Date();

    await catRepo.create({
      id: catA,
      bookId,
      name: 'Cat A',
      normalizedName: 'cat a',
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await catRepo.create({
      id: catB,
      bookId,
      name: 'Cat B',
      normalizedName: 'cat b',
      parentCategoryId: null,
      type: 'both',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      catRepo.update({
        id: catB,
        name: 'Cat A',
        normalizedName: 'cat a',
        type: 'both',
        parentCategoryId: null,
        updatedAt: new Date(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('should support reparenting via use case (valid move)', async () => {
    const bookId = v7();
    await createBook(bookId);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const catA = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Cat A' }, ctx, now),
    );
    const catB = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Cat B' }, ctx, now),
    );
    const catC = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Cat C', parentCategoryId: catA.id }, ctx, now),
    );

    const moved = await txPort.runInTransaction(async (ctx) =>
      updateCategory({ id: catC.id, parentCategoryId: catB.id }, ctx, new Date()),
    );
    expect(moved.parentCategoryId).toBe(catB.id);
  });

  it('should support detach to null via update', async () => {
    const bookId = v7();
    await createBook(bookId);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const catA = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Parent Detach' }, ctx, now),
    );
    const catB = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Child Detach', parentCategoryId: catA.id }, ctx, now),
    );

    const detached = await txPort.runInTransaction(async (ctx) =>
      updateCategory({ id: catB.id, parentCategoryId: null }, ctx, new Date()),
    );
    expect(detached.parentCategoryId).toBeNull();
  });

  it('should archive and retain category', async () => {
    const bookId = v7();
    await createBook(bookId);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const cat = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Archivable Cat' }, ctx, now),
    );
    const archived = await txPort.runInTransaction(async (ctx) =>
      archiveCategory(cat.id, ctx, new Date()),
    );

    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();

    // Should still be readable
    const catRepo = new KyselyCategoryRepository(db);
    const found = await catRepo.findById(cat.id);
    expect(found?.active).toBe(false);
  });

  it('should reactivate an archived category', async () => {
    const bookId = v7();
    await createBook(bookId);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const cat = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Reactivatable' }, ctx, now),
    );
    await txPort.runInTransaction(async (ctx) => archiveCategory(cat.id, ctx, new Date()));
    const reactivated = await txPort.runInTransaction(async (ctx) =>
      reactivateCategory(cat.id, ctx, new Date()),
    );

    expect(reactivated.active).toBe(true);
    expect(reactivated.archivedAt).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Merchant integration
// ──────────────────────────────────────────────────────────────────────────

describe('Merchant Repository Integration', () => {
  it('should create a merchant', async () => {
    const merchRepo = new KyselyMerchantRepository(db);
    const merchId = v7();
    const now = new Date();

    await merchRepo.create({
      id: merchId,
      name: 'Test Merchant',
      normalizedName: 'test merchant',
      type: 'retail',
      taxIdentifier: '12.345.678/0001-90',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await merchRepo.findById(merchId);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Test Merchant');
    expect(found?.taxIdentifier).toBe('12.345.678/0001-90');
  });

  it('should allow duplicate normalized_name (no global unique)', async () => {
    const merchRepo = new KyselyMerchantRepository(db);
    const dupName = `dup merchant ${v7().slice(0, 8)}`;
    const now = new Date();

    await merchRepo.create({
      id: v7(),
      name: 'First Dup',
      normalizedName: dupName,
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await merchRepo.create({
      id: v7(),
      name: 'Second Dup',
      normalizedName: dupName,
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Both should be found via normalized name
    const all = await merchRepo.findByNormalizedName(dupName);
    expect(all).toHaveLength(2);
  });

  it('should archive and reactivate a merchant', async () => {
    const merchRepo = new KyselyMerchantRepository(db);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const merchant = await txPort.runInTransaction(async (ctx) =>
      createMerchant({ name: 'Archivable Merch' }, ctx, now),
    );
    const archived = await txPort.runInTransaction(async (ctx) =>
      archiveMerchant(merchant.id, ctx, new Date()),
    );

    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();

    const found = await merchRepo.findById(merchant.id);
    expect(found?.active).toBe(false);
  });

  it('should update merchant fields', async () => {
    const merchRepo = new KyselyMerchantRepository(db);
    const txPort = new KyselyTransactionPort(db);
    const now = new Date();

    const merchant = await txPort.runInTransaction(async (ctx) =>
      createMerchant({ name: 'Updatable Merch' }, ctx, now),
    );
    const updated = await txPort.runInTransaction(async (ctx) =>
      updateMerchant(
        { id: merchant.id, name: 'Updated Merch', type: 'wholesale' },
        ctx,
        new Date(),
      ),
    );

    expect(updated.name).toBe('Updated Merch');
    expect(updated.type).toBe('wholesale');
  });

  it('should list merchants', async () => {
    const merchRepo = new KyselyMerchantRepository(db);
    const all = await merchRepo.find();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Category hierarchy concurrency (two independent connections, barrier)
// ──────────────────────────────────────────────────────────────────────────

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Barrier timed out')), 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
async function testBook() {
  const id = v7();
  const now = new Date();
  await new KyselyBookRepository(db).create({
    id,
    name: id,
    normalizedName: id,
    currency: 'BRL',
    timezone: 'UTC',
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
async function testCategory(bookId: string, name: string, parentCategoryId: string | null = null) {
  return new KyselyTransactionPort(db).runInTransaction((ctx) =>
    createCategory({ bookId, name, parentCategoryId }, ctx, new Date()),
  );
}
async function assertGraph(bookId: string, expected: Record<string, string | null>) {
  const rows = await new KyselyCategoryRepository(db).findByBookId(bookId);
  const graph = Object.fromEntries(rows.map((row) => [row.id, row.parentCategoryId]));
  expect(graph).toEqual(expected);
  for (const row of rows) {
    const seen = new Set<string>();
    let id: string | null = row.id;
    while (id !== null) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      id = graph[id];
    }
  }
}
type Operation = (ctx: MasterDataTransactionContext) => Promise<CategoryRecord>;
// Separate max=1 pools guarantee independent backend connections. The observer uses pool.
async function coordinated(first: Operation, second: Operation, independent = false) {
  const pool1 = new Pool({
    connectionString,
    max: 1,
    options: '-c statement_timeout=10000 -c lock_timeout=10000',
  });
  const pool2 = new Pool({
    connectionString,
    max: 1,
    options: '-c statement_timeout=10000 -c lock_timeout=10000',
  });
  const db1 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool1 }) });
  const db2 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool2 }) });
  const held = barrier();
  const release = barrier();
  const secondStarted = barrier();
  let firstFinished = false;
  let pending: Promise<PromiseSettledResult<CategoryRecord>[]> | undefined;
  try {
    const pid1 = (await pool1.query('select pg_backend_pid() as pid')).rows[0].pid;
    const pid2 = (await pool2.query('select pg_backend_pid() as pid')).rows[0].pid;
    expect(pid1).not.toBe(pid2);
    const run1 = new KyselyTransactionPort(db1)
      .runInTransaction((ctx) =>
        first({
          ...ctx,
          locks: {
            acquireLocks: async (spec) => {
              await ctx.locks.acquireLocks(spec);
              if (spec.books?.length) {
                held.release();
                await bounded(release.promise);
              }
            },
          },
        }),
      )
      .finally(() => {
        firstFinished = true;
      });
    // Attach rejection handling immediately, including on barrier failure.
    const settled1 = Promise.allSettled([run1]);
    await bounded(held.promise);
    const run2 = new KyselyTransactionPort(db2).runInTransaction((ctx) =>
      second({
        ...ctx,
        locks: {
          acquireLocks: async (spec) => {
            if (spec.books?.length) secondStarted.release();
            await ctx.locks.acquireLocks(spec);
          },
        },
      }),
    );
    pending = Promise.allSettled([run1, run2]);
    await bounded(secondStarted.promise);
    if (independent) {
      await bounded(run2);
      expect(firstFinished).toBe(false); // Book 2 committed while Book 1 remains locked.
    } else {
      await bounded(
        (async () => {
          const deadline = Date.now() + 7000;
          for (;;) {
            if (Date.now() > deadline) throw new Error('Expected Book lock wait was not observed');
            const observed = await pool.query(
              'select pg_blocking_pids($1) as blockers, wait_event_type, query from pg_stat_activity where pid=$1',
              [pid2],
            );
            const row = observed.rows[0];
            if (row?.blockers.includes(pid1)) {
              expect(row.wait_event_type).toBe('Lock');
              expect(row.query).toContain('"books"');
              expect(row.query).toContain('for update');
              break;
            }
          }
        })(),
      );
      expect(firstFinished).toBe(false);
    }
    release.release();
    const results = await bounded(pending);
    await settled1;
    return results;
  } finally {
    release.release();
    if (pending) await pending;
    await db1.destroy();
    await db2.destroy();
  }
}

describe('Category Hierarchy Concurrency', { timeout: 30000 }, () => {
  it.each([false, true])(
    'Opposite moves with explicit Book-lock wait, reverse=%s',
    async (reverse) => {
      const book = await testBook();
      const a = await testCategory(book, 'A');
      const b = await testCategory(book, 'B');
      const [winner, loser] = reverse ? [b, a] : [a, b];
      const results = await coordinated(
        (ctx) => updateCategory({ id: winner.id, parentCategoryId: loser.id }, ctx, new Date()),
        (ctx) => updateCategory({ id: loser.id, parentCategoryId: winner.id }, ctx, new Date()),
      );
      expect(results[0].status).toBe('fulfilled');
      expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'CATEGORY_CYCLE' } });
      await assertGraph(book, { [winner.id]: loser.id, [loser.id]: null });
    },
  );
  it.each([false, true])(
    'Longer disjoint-row cycle re-reads ancestry after commit, reverse=%s',
    async (reverse) => {
      const book = await testBook();
      const a = await testCategory(book, 'A');
      const b = await testCategory(book, 'B');
      const c = await testCategory(book, 'C', a.id);
      const d = await testCategory(book, 'D', b.id);
      // Disjoint Category lock sets {A,D} and {B,C}. Together: A->D->B->C->A.
      const one: Operation = (ctx) =>
        updateCategory({ id: a.id, parentCategoryId: d.id }, ctx, new Date());
      const two: Operation = (ctx) =>
        updateCategory({ id: b.id, parentCategoryId: c.id }, ctx, new Date());
      const results = await coordinated(reverse ? two : one, reverse ? one : two);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'CATEGORY_CYCLE' } });
      await assertGraph(book, {
        [a.id]: reverse ? null : d.id,
        [b.id]: reverse ? c.id : null,
        [c.id]: a.id,
        [d.id]: b.id,
      });
    },
  );
  it('Distinct Books commit independently while the first hierarchy lock is held', async () => {
    const book1 = await testBook();
    const book2 = await testBook();
    const a = await testCategory(book1, 'A');
    const b = await testCategory(book1, 'B');
    const c = await testCategory(book2, 'C');
    const d = await testCategory(book2, 'D');
    const results = await coordinated(
      (ctx) => updateCategory({ id: a.id, parentCategoryId: b.id }, ctx, new Date()),
      (ctx) => updateCategory({ id: c.id, parentCategoryId: d.id }, ctx, new Date()),
      true,
    );
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    await assertGraph(book1, { [a.id]: b.id, [b.id]: null });
    await assertGraph(book2, { [c.id]: d.id, [d.id]: null });
  });
  it.each(['create', 'update'])(
    'Opposing cross-Book %s attempts lock Books first and reject without deadlock',
    async (operation) => {
      const book1 = await testBook();
      const book2 = await testBook();
      const a = await testCategory(book1, 'A');
      const b = await testCategory(book2, 'B');
      const attempt =
        (own: CategoryRecord, other: CategoryRecord): Operation =>
        (ctx) =>
          operation === 'create'
            ? createCategory(
                { bookId: own.bookId, name: 'invalid', parentCategoryId: other.id },
                ctx,
                new Date(),
              )
            : updateCategory({ id: own.id, parentCategoryId: other.id }, ctx, new Date());
      const results = await coordinated(attempt(a, b), attempt(b, a));
      for (const result of results)
        expect(result).toMatchObject({
          status: 'rejected',
          reason: {
            code: 'VALIDATION_ERROR',
            field: 'parentCategoryId',
            message: 'Parent Category must belong to the same Book',
          },
        });
      await assertGraph(book1, { [a.id]: null });
      await assertGraph(book2, { [b.id]: null });
    },
  );
});

describe('T03 review PostgreSQL regressions', () => {
  it('restarts the entire transaction after changed discovery and rolls back prior writes', async () => {
    const book = await testBook();
    let attempts = 0;
    const result = await new KyselyTransactionPort(db).runInTransaction(async (ctx) => {
      attempts++;
      const row = await createCategory({ bookId: book, name: 'retry' }, ctx, new Date());
      if (attempts === 1) throw new ConfigurationLockSetChangedError();
      return row;
    });
    expect(attempts).toBe(2);
    expect(await new KyselyCategoryRepository(db).findByBookId(book)).toEqual([result]);
  });
  it('bounds changed-discovery retries and rolls back every attempt', async () => {
    const book = await testBook();
    let attempts = 0;
    await expect(
      new KyselyTransactionPort(db).runInTransaction(async (ctx) => {
        attempts++;
        await createCategory({ bookId: book, name: 'retry' }, ctx, new Date());
        throw new ConfigurationLockSetChangedError();
      }),
    ).rejects.toMatchObject({ code: 'CONCURRENCY_ERROR' });
    expect(attempts).toBe(3);
    expect(await new KyselyCategoryRepository(db).findByBookId(book)).toEqual([]);
  });

  it('rejects inactive-Book reparent atomically but permits ordinary field updates', async () => {
    const book = await testBook();
    const a = await testCategory(book, 'A');
    const b = await testCategory(book, 'B');
    await pool.query('update books set active=false, archived_at=now() where id=$1', [book]);
    const port = new KyselyTransactionPort(db);
    await expect(
      port.runInTransaction((ctx) =>
        updateCategory(
          { id: a.id, parentCategoryId: b.id, name: 'changed', active: false },
          ctx,
          new Date(),
        ),
      ),
    ).rejects.toMatchObject({ field: 'bookId' });
    expect(await new KyselyCategoryRepository(db).findById(a.id)).toEqual(a);
    expect(
      await port.runInTransaction((ctx) =>
        updateCategory({ id: a.id, name: 'ordinary', type: 'income' }, ctx, new Date()),
      ),
    ).toMatchObject({ name: 'ordinary', type: 'income' });
  });
  it.each(['sibling', 'root'])(
    'rolls back reparent normalized-name %s conflict including lifecycle fields',
    async (target) => {
      const book = await testBook();
      const p = await testCategory(book, 'P');
      const q = await testCategory(book, 'Q');
      await testCategory(book, ' SAME  name ', target === 'root' ? null : q.id);
      const child = await testCategory(book, 'same name', p.id);
      await expect(
        new KyselyTransactionPort(db).runInTransaction((ctx) =>
          updateCategory(
            { id: child.id, parentCategoryId: target === 'root' ? null : q.id, active: false },
            ctx,
            new Date(),
          ),
        ),
      ).rejects.toThrow('uniqueness');
      expect(await new KyselyCategoryRepository(db).findById(child.id)).toEqual(child);
    },
  );
  it('persists combined Category archive/reparent/name and reactivate/type patches', async () => {
    const book = await testBook();
    const a = await testCategory(book, 'A');
    const b = await testCategory(book, 'B');
    const port = new KyselyTransactionPort(db);
    const now = new Date();
    const archived = await port.runInTransaction((ctx) =>
      updateCategory(
        { id: a.id, parentCategoryId: b.id, name: ' NEW  name ', active: false },
        ctx,
        now,
      ),
    );
    expect(archived).toMatchObject({
      name: 'NEW  name',
      normalizedName: 'new name',
      parentCategoryId: b.id,
      active: false,
      archivedAt: now,
    });
    const repeated = await port.runInTransaction((ctx) =>
      updateCategory(
        { id: a.id, name: 'again', active: false },
        ctx,
        new Date(now.getTime() + 1000),
      ),
    );
    expect(repeated.archivedAt).toEqual(now);
    const result = await port.runInTransaction((ctx) =>
      updateCategory({ id: a.id, name: 'back', type: 'income', active: true }, ctx, new Date()),
    );
    expect(result).toMatchObject({ name: 'back', type: 'income', active: true, archivedAt: null });
    expect(await new KyselyCategoryRepository(db).findById(a.id)).toEqual(result);
  });
  it('persists combined Merchant archive/name and reactivate/type/tax patches', async () => {
    const port = new KyselyTransactionPort(db);
    const now = new Date();
    const m = await port.runInTransaction((ctx) => createMerchant({ name: 'initial' }, ctx, now));
    expect(
      await port.runInTransaction((ctx) =>
        updateMerchant({ id: m.id, name: ' NEW  merchant ', active: false }, ctx, now),
      ),
    ).toMatchObject({ normalizedName: 'new merchant', active: false, archivedAt: now });
    const result = await port.runInTransaction((ctx) =>
      updateMerchant(
        { id: m.id, type: 'retail', taxIdentifier: '123', active: true },
        ctx,
        new Date(),
      ),
    );
    expect(result).toMatchObject({
      type: 'retail',
      taxIdentifier: '123',
      active: true,
      archivedAt: null,
    });
    expect(await new KyselyMerchantRepository(db).findById(m.id)).toEqual(result);
  });
});

describe('Merchant Concurrency', { timeout: 15000 }, () => {
  it('Concurrent duplicate Merchant creation succeeds with distinct IDs', async () => {
    const dupName = `concurrent merch ${v7().slice(0, 8)}`;
    const now = new Date();
    const txPort = new KyselyTransactionPort(db);

    const results = await Promise.allSettled([
      txPort.runInTransaction(async (ctx) => createMerchant({ name: dupName }, ctx, now)),
      txPort.runInTransaction(async (ctx) => createMerchant({ name: dupName }, ctx, now)),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const merchRepo = new KyselyMerchantRepository(db);
    const all = await merchRepo.findByNormalizedName(dupName.toLowerCase());
    expect(all).toHaveLength(2);
    expect(all[0].id).not.toBe(all[1].id);
  });

  it('Merchant lookup preserves both rows after concurrent creates', async () => {
    const dupName = `lookup merch ${v7().slice(0, 8)}`;
    const now = new Date();

    const merchRepo = new KyselyMerchantRepository(db);
    const id1 = v7();
    const id2 = v7();

    await merchRepo.create({
      id: id1,
      name: 'First',
      normalizedName: dupName.toLowerCase(),
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await merchRepo.create({
      id: id2,
      name: 'Second',
      normalizedName: dupName.toLowerCase(),
      type: null,
      taxIdentifier: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await merchRepo.findByNormalizedName(dupName.toLowerCase());
    const ids = found.map((m) => m.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Archive persistence with historical transactions
// ──────────────────────────────────────────────────────────────────────────

describe('Archive History Preservation', () => {
  it('Seeded posted/voided history retains Category/Merchant FKs after archive', async () => {
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        `History Book ${v7().slice(0, 8)}`,
        `history book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO accounts (id, book_id, name, normalized_name, type, currency, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        accountId,
        bookId,
        'Hist Account',
        `hist account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    const txPort = new KyselyTransactionPort(db);
    const category = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Hist Category' }, ctx, now),
    );
    const merchant = await txPort.runInTransaction(async (ctx) =>
      createMerchant({ name: 'Hist Merchant' }, ctx, now),
    );

    // Create transactions referencing both
    const postedId = v7();
    const voidedId = v7();

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, category_id, merchant_id, type, status, amount, currency, description, transaction_date, source, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        postedId,
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        accountId,
        category.id,
        merchant.id,
        'expense',
        'posted',
        '10.00',
        'BRL',
        'Posted txn',
        '2026-01-15',
        'test',
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, category_id, merchant_id, type, status, amount, currency, description, transaction_date, source, voided_at, void_reason, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        voidedId,
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        accountId,
        category.id,
        merchant.id,
        'expense',
        'voided',
        '20.00',
        'BRL',
        'Voided txn',
        '2026-01-15',
        'test',
        now,
        'test',
        now,
        now,
      ],
    );

    // Archive category and merchant
    await txPort.runInTransaction(async (ctx) => archiveCategory(category.id, ctx, new Date()));
    await txPort.runInTransaction(async (ctx) => archiveMerchant(merchant.id, ctx, new Date()));

    // Verify transactions still reference the archived entities
    const posted = await pool.query(
      'SELECT category_id, merchant_id FROM transactions WHERE id=$1',
      [postedId],
    );
    expect(posted.rows[0].category_id).toBe(category.id);
    expect(posted.rows[0].merchant_id).toBe(merchant.id);

    const voided = await pool.query(
      'SELECT category_id, merchant_id FROM transactions WHERE id=$1',
      [voidedId],
    );
    expect(voided.rows[0].category_id).toBe(category.id);
    expect(voided.rows[0].merchant_id).toBe(merchant.id);

    // Categories/merchants still readable
    const catRepo = new KyselyCategoryRepository(db);
    const merchRepo = new KyselyMerchantRepository(db);
    expect(await catRepo.findById(category.id)).not.toBeNull();
    expect(await merchRepo.findById(merchant.id)).not.toBeNull();
  });

  it('Rule references do not prevent Category/Merchant archive', async () => {
    const bookId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        `Rule Archive Book ${v7().slice(0, 8)}`,
        `rule archive book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    const txPort = new KyselyTransactionPort(db);
    const category = await txPort.runInTransaction(async (ctx) =>
      createCategory({ bookId, name: 'Rule Cat' }, ctx, now),
    );
    const merchant = await txPort.runInTransaction(async (ctx) =>
      createMerchant({ name: 'Rule Merch' }, ctx, now),
    );

    // Create a classification rule referencing the category and merchant
    const ruleId = v7();
    await pool.query(
      `INSERT INTO classification_rules (id, priority, active, match_type, pattern, normalized_pattern, target_book_id, target_category_id, target_merchant_id, source, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        ruleId,
        100,
        true,
        'contains',
        'rule pattern',
        'rule pattern',
        bookId,
        category.id,
        merchant.id,
        'manual',
        now,
        now,
      ],
    );

    // Archive should still succeed
    await txPort.runInTransaction(async (ctx) => archiveCategory(category.id, ctx, new Date()));
    await txPort.runInTransaction(async (ctx) => archiveMerchant(merchant.id, ctx, new Date()));

    // Rule still exists
    const rule = await pool.query(
      'SELECT target_category_id, target_merchant_id FROM classification_rules WHERE id=$1',
      [ruleId],
    );
    expect(rule.rows[0].target_category_id).toBe(category.id);
    expect(rule.rows[0].target_merchant_id).toBe(merchant.id);
  });

  it('Existing M02 constraints remain green (books/accounts)', async () => {
    const bookId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        `M02 Book ${v7().slice(0, 8)}`,
        `m02 book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO accounts (id, book_id, name, normalized_name, type, currency, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        v7(),
        bookId,
        'M02 Account',
        `m02 account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    // Currency CHECK still enforced
    await expect(
      pool.query(
        `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          v7(),
          'Bad Currency',
          `bad currency ${v7().slice(0, 8)}`,
          'brl',
          'America/Sao_Paulo',
          true,
          null,
          now,
          now,
        ],
      ),
    ).rejects.toThrow();
  });
});
