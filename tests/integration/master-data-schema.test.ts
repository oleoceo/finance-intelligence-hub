import { verifyColumns } from './schema-helpers.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { migrateUp, getMigrationStatus } from '@finance-hub/database';
import { insert } from './schema-helpers.js';
import { Pool } from 'pg';
import { book, account, named, id, now, rejects, indexes } from './schema-helpers.js';

describe('M02-T01 — Master Data Schema Constraints', { timeout: 120000 }, () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let db: Pool;

  beforeAll(async () => {
    // Start ephemeral PostgreSQL 18.6 container
    container = await new GenericContainer('postgres:18.6-bookworm')
      .withEnvironment({
        POSTGRES_DB: 'master_data_test_db',
        POSTGRES_USER: 'master_data_user',
        POSTGRES_PASSWORD: 'master_data_password',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .withStartupTimeout(120000)
      .start();

    const port = container.getMappedPort(5432);
    const host = container.getHost();

    // Wait for port binding to stabilize in WSL2
    await new Promise((resolve) => setTimeout(resolve, 3000));

    connectionString = `postgresql://master_data_user:master_data_password@${host}:${port}/master_data_test_db`;

    // Apply migrations
    await migrateUp({ connectionString });

    db = new Pool({ connectionString });
  });

  afterAll(async () => {
    if (db) {
      await db.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('Books constraints', () => {
    it('should enforce uppercase three-letter currency format', async () => {
      const validBook = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Test Book',
        normalized_name: 'test_book',
        currency: 'BRL',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'books', validBook);

      const invalidBook = {
        id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        name: 'Invalid Currency Book',
        normalized_name: 'invalid_currency_book',
        currency: 'brl',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'books', invalidBook)).rejects.toMatchObject({ code: '23514' });
    });

    it('should enforce archive consistency (active/archived_at)', async () => {
      const inconsistentBook = {
        id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        name: 'Inconsistent Archive Book',
        normalized_name: 'inconsistent_archive_book',
        currency: 'USD',
        active: false,
        archived_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'books', inconsistentBook)).rejects.toMatchObject({ code: '23514' });
    });

    it('should enforce unique normalized_name', async () => {
      const duplicateBook = {
        id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
        name: 'Duplicate Name Book',
        normalized_name: 'test_book',
        currency: 'EUR',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'books', duplicateBook)).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('Accounts constraints', () => {
    it('should enforce account type CHECK constraint', async () => {
      const invalidTypeAccount = {
        id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Invalid Type Account',
        normalized_name: 'invalid_type_account',
        type: 'invalid_type',
        currency: 'BRL',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'accounts', invalidTypeAccount)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('should enforce same Book/currency via composite FK', async () => {
      const wrongCurrencyAccount = {
        id: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Wrong Currency Account',
        normalized_name: 'wrong_currency_account',
        type: 'checking',
        currency: 'USD',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'accounts', wrongCurrencyAccount)).rejects.toMatchObject({
        code: '23503',
      });
    });

    it('should allow same account name across different books', async () => {
      const anotherBook = {
        id: 'a7b8c9d0-e1f2-3456-abcd-567890123456',
        name: 'Another Book',
        normalized_name: 'another_book',
        currency: 'BRL',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'books', anotherBook);

      const sameNameAccount = {
        id: 'b8c9d0e1-f2a3-4567-bcde-678901234567',
        book_id: 'a7b8c9d0-e1f2-3456-abcd-567890123456',
        name: 'Test Account',
        normalized_name: 'test_account',
        type: 'savings',
        currency: 'BRL',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'accounts', sameNameAccount);
    });
  });

  describe('Categories constraints', () => {
    it('should prohibit direct self-parent', async () => {
      const selfParentCategory = {
        id: 'c9d0e1f2-a3b4-5678-cdef-789012345678',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Self Parent Category',
        normalized_name: 'self_parent_category',
        parent_category_id: 'c9d0e1f2-a3b4-5678-cdef-789012345678',
        type: 'expense',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'categories', selfParentCategory)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('should allow same child name under different parents', async () => {
      const parent1 = {
        id: 'd0e1f2a3-b4c5-6789-defa-890123456789',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Parent 1',
        normalized_name: 'parent_1',
        type: 'both',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const parent2 = {
        id: 'e1f2a3b4-c5d6-7890-efab-901234567890',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Parent 2',
        normalized_name: 'parent_2',
        type: 'both',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'categories', parent1);
      await insert(db, 'categories', parent2);

      const child1 = {
        id: 'f2a3b4c5-d6e7-8901-fabc-012345678901',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Child',
        normalized_name: 'child',
        parent_category_id: 'd0e1f2a3-b4c5-6789-defa-890123456789',
        type: 'expense',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const child2 = {
        id: 'a3b4c5d6-e7f8-9012-abcd-123456789012',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Child',
        normalized_name: 'child',
        parent_category_id: 'e1f2a3b4-c5d6-7890-efab-901234567890',
        type: 'income',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'categories', child1);
      await insert(db, 'categories', child2);
    });

    it('should fail duplicate sibling names under same parent', async () => {
      const duplicateChild = {
        id: 'b4c5d6e7-f8a9-0123-bcde-234567890123',
        book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Duplicate Child',
        normalized_name: 'child',
        parent_category_id: 'd0e1f2a3-b4c5-6789-defa-890123456789',
        type: 'expense',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'categories', duplicateChild)).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  describe('Classification Rules constraints', () => {
    it('should require at least one target', async () => {
      const noTargetRule = {
        id: 'c5d6e7f8-a9b0-1234-cdef-345678901234',
        priority: 100,
        active: true,
        match_type: 'exact',
        pattern: 'test pattern',
        normalized_pattern: 'test_pattern',
        source: 'manual',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'classification_rules', noTargetRule)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('should enforce match_type CHECK constraint', async () => {
      const invalidMatchTypeRule = {
        id: 'd6e7f8a9-b0c1-2345-defa-456789012345',
        priority: 100,
        active: true,
        match_type: 'regex',
        pattern: 'test pattern',
        normalized_pattern: 'test_pattern',
        target_book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        source: 'manual',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'classification_rules', invalidMatchTypeRule)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('should enforce source CHECK constraint', async () => {
      const invalidSourceRule = {
        id: 'e7f8a9b0-c1d2-3456-efab-567890123456',
        priority: 100,
        active: true,
        match_type: 'contains',
        pattern: 'test pattern',
        normalized_pattern: 'test_pattern',
        target_account_id: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
        source: 'ai',
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'classification_rules', invalidSourceRule)).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  describe('Authorized Senders constraints', () => {
    it('should enforce unique channel + sender_reference', async () => {
      const sender1 = {
        id: 'f8a9b0c1-d2e3-4567-fabc-678901234567',
        channel: 'whatsapp',
        sender_reference: '+5511999999999',
        name: 'Test Sender',
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'authorized_senders', sender1);

      const duplicateSender = {
        id: 'a9b0c1d2-e3f4-5678-abcd-789012345678',
        channel: 'whatsapp',
        sender_reference: '+5511999999999',
        name: 'Duplicate Sender',
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'authorized_senders', duplicateSender)).rejects.toMatchObject({
        code: '23505',
      });
    });

    it('should require default_book_id when default_account_id is set', async () => {
      const accountWithoutBook = {
        id: 'b0c1d2e3-f4a5-6789-bcde-890123456789',
        channel: 'telegram',
        sender_reference: '@testuser',
        default_account_id: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
        default_book_id: null,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await expect(insert(db, 'authorized_senders', accountWithoutBook)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('should allow sender with only default_book_id (no account)', async () => {
      const bookOnlySender = {
        id: 'c1d2e3f4-a5b6-7890-cdef-901234567890',
        channel: 'email',
        sender_reference: 'test@example.com',
        default_book_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        default_account_id: null,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await insert(db, 'authorized_senders', bookOnlySender);
    });
  });

  describe('Migration status', () => {
    it('should show all five canonical migrations applied', async () => {
      const { executedMigrations, pendingMigrations } = await getMigrationStatus({
        connectionString,
      });

      expect(executedMigrations.length).toBe(5);
      expect(pendingMigrations.length).toBe(0);
      expect(executedMigrations.map((m) => m.name)).toContain('001_technical_validation');
      expect(executedMigrations.map((m) => m.name)).toContain('002_master_data');
    });
  });

  it('round-trips UUIDv7 and rejects missing master-data references and duplicate account names', async () => {
    const row = named({ id: '01900000-0000-7000-8000-000000000099', currency: 'BRL' });
    expect((await insert(db, 'books', row)).rows[0].id).toBe(row.id);
    const a = named({ book_id: row.id, currency: 'BRL', type: 'checking' });
    await insert(db, 'accounts', a);
    await rejects(insert(db, 'accounts', { ...a, id: id() }), '23505');
    const other = await book(db);
    await insert(db, 'accounts', { ...a, id: id(), book_id: other });
    await rejects(insert(db, 'accounts', { ...a, id: id(), book_id: id() }), '23503');
    await rejects(db.query('UPDATE accounts SET currency=$1 WHERE id=$2', ['USD', a.id]), '23503');
    await rejects(db.query('DELETE FROM books WHERE id=$1', [row.id]), '23503');
    for (const type of ['checking', 'savings', 'cash', 'credit_card', 'other'])
      await insert(db, 'accounts', named({ book_id: row.id, currency: 'BRL', type }));
  });
  it('enforces archive consistency on INSERT and UPDATE for all four archivable tables', async () => {
    const b = await book(db);
    for (const table of ['books', 'accounts', 'categories', 'merchants']) {
      const extra =
        table === 'books'
          ? { currency: 'BRL' }
          : table === 'accounts'
            ? { book_id: b, currency: 'BRL', type: 'checking' }
            : table === 'categories'
              ? { book_id: b }
              : {};
      for (const [active, archived_at] of [
        [true, null],
        [false, now],
      ] as const)
        await insert(db, table, named({ ...extra, active, archived_at }));
      for (const [active, archived_at] of [
        [true, now],
        [false, null],
      ] as const)
        await rejects(insert(db, table, named({ ...extra, active, archived_at })), '23514');
      const row = named(extra);
      await insert(db, table, row);
      await rejects(db.query(`UPDATE ${table} SET active=false WHERE id=$1`, [row.id]), '23514');
      await db.query(`UPDATE ${table} SET active=false, archived_at=$1 WHERE id=$2`, [now, row.id]);
      await rejects(
        db.query(`UPDATE ${table} SET archived_at=NULL WHERE id=$1`, [row.id]),
        '23514',
      );
    }
  });
  it('enforces root uniqueness, cross-Book/missing parents and hierarchy UPDATE/deletion integrity', async () => {
    const b = await book(db);
    const other = await book(db);
    const parent = named({ book_id: b });
    await insert(db, 'categories', parent);
    await rejects(insert(db, 'categories', { ...parent, id: id() }), '23505');
    await insert(db, 'categories', { ...parent, id: id(), book_id: other });
    for (const parentId of [id(), parent.id])
      await rejects(
        insert(db, 'categories', named({ book_id: other, parent_category_id: parentId })),
        '23503',
      );
    const child = named({ book_id: b, parent_category_id: parent.id });
    await insert(db, 'categories', child);
    await rejects(
      db.query('UPDATE categories SET parent_category_id=id WHERE id=$1', [child.id]),
      '23514',
      'categories_no_self_parent',
    );
    await rejects(
      db.query('UPDATE categories SET book_id=$1 WHERE id=$2', [other, child.id]),
      '23503',
    );
    await rejects(db.query('DELETE FROM categories WHERE id=$1', [parent.id]), '23503');
    await rejects(insert(db, 'categories', named({ book_id: b, type: 'transfer' })), '23514');
  });
  it('preserves nullable rule targets and enforces each target FK on INSERT/UPDATE', async () => {
    const b = await book(db);
    const a = await account(db, b);
    const c = named({ book_id: b });
    const m = named();
    await insert(db, 'categories', c);
    await insert(db, 'merchants', m);
    const base = {
      id: id(),
      match_type: 'exact',
      pattern: 'test',
      normalized_pattern: 'test',
      source: 'manual',
      created_at: now,
      updated_at: now,
    };
    for (const [column, target] of Object.entries({
      target_book_id: b,
      target_account_id: a,
      target_category_id: c.id,
      target_merchant_id: m.id,
    })) {
      const row = { ...base, id: id(), [column]: target };
      await insert(db, 'classification_rules', row);
      await rejects(
        insert(db, 'classification_rules', { ...base, id: id(), [column]: id() }),
        '23503',
      );
      await rejects(
        db.query(`UPDATE classification_rules SET ${column}=$1 WHERE id=$2`, [id(), row.id]),
        '23503',
      );
      await rejects(
        db.query(`UPDATE classification_rules SET ${column}=NULL WHERE id=$1`, [row.id]),
        '23514',
      );
    }
    await insert(db, 'classification_rules', {
      ...base,
      id: id(),
      match_type: 'contains',
      source: 'system',
      target_book_id: b,
    });
    await rejects(db.query('DELETE FROM merchants WHERE id=$1', [m.id]), '23503');
    // Merchants are global; normalized names are deliberately not unique.
    await insert(db, 'merchants', { ...m, id: id() });
  });
  it('enforces sender default FKs and UPDATE consistency without active-state historical FKs', async () => {
    const b = await book(db);
    const other = await book(db);
    const a = await account(db, b);
    const row = {
      id: id(),
      channel: 'test',
      sender_reference: id(),
      created_at: now,
      updated_at: now,
      default_book_id: b,
      default_account_id: a,
    };
    await insert(db, 'authorized_senders', row);
    for (const extra of [
      { default_book_id: other },
      { default_book_id: id() },
      { default_account_id: id() },
    ])
      await rejects(
        insert(db, 'authorized_senders', { ...row, id: id(), sender_reference: id(), ...extra }),
        '23503',
      );
    await rejects(
      db.query('UPDATE authorized_senders SET default_book_id=NULL WHERE id=$1', [row.id]),
      '23514',
    );
    await rejects(
      db.query('UPDATE authorized_senders SET default_book_id=$1 WHERE id=$2', [other, row.id]),
      '23503',
    );
    await rejects(db.query('DELETE FROM accounts WHERE id=$1', [a]), '23503');
    await db.query('UPDATE accounts SET active=false, archived_at=$1 WHERE id=$2', [now, a]);
    expect(
      (await db.query('SELECT default_account_id FROM authorized_senders WHERE id=$1', [row.id]))
        .rows[0].default_account_id,
    ).toBe(a);
  });
  it('matches documented master-data indexes and partial category predicates', async () => {
    const ix = await indexes(db, 'categories');
    expect(ix.uq_categories_root_name_per_book).toContain('(book_id, normalized_name)');
    expect(ix.uq_categories_root_name_per_book).toContain('WHERE (parent_category_id IS NULL)');
    expect(ix.uq_categories_child_name_per_book_parent).toContain(
      '(book_id, parent_category_id, normalized_name)',
    );
    expect(ix.uq_categories_child_name_per_book_parent).toContain(
      'WHERE (parent_category_id IS NOT NULL)',
    );
    expect((await indexes(db, 'merchants')).idx_merchants_normalized_name).toContain(
      '(normalized_name)',
    );
    const rules = await indexes(db, 'classification_rules');
    expect(rules.idx_classification_rules_active_priority).toContain('(active, priority)');
    expect(rules.idx_classification_rules_normalized_pattern).toContain('(normalized_pattern)');
  });
  it('matches complete physical column types, lengths, nullability, defaults and UUID primary keys', async () => {
    await verifyColumns(db, [
      'books',
      'accounts',
      'categories',
      'merchants',
      'classification_rules',
      'authorized_senders',
    ]);
  });
});
