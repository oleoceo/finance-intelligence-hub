/**
 * PostgreSQL integration tests for Book and Account repositories (M03-T02).
 *
 * Tests real database behavior including:
 * - Normalized name uniqueness
 * - Book-scoped Account uniqueness
 * - Account currency matches Book
 * - Inactive Book cannot receive new Account (Core use-case, not FK)
 * - FinancialUsageReader source/destination, voided, book usage
 * - SenderDefaultReferenceReader Book/Account reference
 * - Deterministic lock ordering and race conditions
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import {
  KyselyBookRepository,
  KyselyAccountRepository,
  KyselyFinancialUsageReader,
  KyselySenderDefaultReferenceReader,
  KyselyTransactionPort,
} from '@finance-hub/database';
import { migrateUp } from '@finance-hub/database';
import { createAccount, archiveBook, ValidationError } from '@finance-hub/core';
import type { DB } from '../../packages/database/src/db-types.js';

const v7 = randomUUID;

let container: StartedTestContainer;
let connectionString: string;
let pool: Pool;
let db: Kysely<DB>;

beforeAll(async () => {
  const password = randomUUID();
  container = await new GenericContainer('postgres:18.6-bookworm')
    .withEnvironment({
      POSTGRES_DB: 'book_account_test_db',
      POSTGRES_USER: 'book_account_user',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
    .withStartupTimeout(120000)
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();

  // Wait for port binding to stabilize in WSL2
  await new Promise((resolve) => setTimeout(resolve, 3000));

  connectionString = `postgresql://book_account_user:${password}@${host}:${port}/book_account_test_db`;

  // Apply canonical migrations
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

describe('Book Repository Integration', () => {
  it('should create a book with normalized name', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id = v7();
    const now = new Date();

    await bookRepo.create({
      id,
      name: 'Test Book',
      normalizedName: 'test book unique 1',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await bookRepo.findById(id);
    expect(found).not.toBeNull();
    expect(found?.normalizedName).toBe('test book unique 1');
    expect(found?.currency).toBe('BRL');
  });

  it('should enforce unique normalized name across books', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id1 = v7();
    const id2 = v7();
    const now = new Date();

    await bookRepo.create({
      id: id1,
      name: 'Unique Book',
      normalizedName: `unique book ${id1.slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Duplicate normalized name should fail at DB level
    await expect(
      bookRepo.create({
        id: id2,
        name: 'Another Unique Book',
        normalizedName: `unique book ${id1.slice(0, 8)}`,
        currency: 'USD',
        timezone: 'America/New_York',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });

  it('should find book by normalized name', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id = v7();
    const uniqueName = `searchable book ${v7().slice(0, 8)}`;
    const now = new Date();

    await bookRepo.create({
      id,
      name: 'Searchable Book',
      normalizedName: uniqueName,
      currency: 'EUR',
      timezone: 'Europe/London',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await bookRepo.findByName(uniqueName);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(id);
  });

  it('should update book fields', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id = v7();
    const now = new Date();

    await bookRepo.create({
      id,
      name: 'Original Name',
      normalizedName: `original name ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const updated = await bookRepo.update({
      id,
      name: 'Updated Name',
      normalizedName: `updated name ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/New_York',
      updatedAt: new Date(),
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.timezone).toBe('America/New_York');
  });

  it('should archive a book', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id = v7();
    const now = new Date();

    await bookRepo.create({
      id,
      name: 'Archivable Book',
      normalizedName: `archivable book ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const archived = await bookRepo.archive({
      id,
      active: false,
      archivedAt: now,
      updatedAt: now,
    });

    expect(archived.active).toBe(false);
    expect(archived.archivedAt).toEqual(now);
  });

  it('should translate uniqueness violation to Core ValidationError', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const id1 = v7();
    const id2 = v7();
    const dupName = `translate error ${v7().slice(0, 8)}`;
    const now = new Date();

    await bookRepo.create({
      id: id1,
      name: 'First',
      normalizedName: dupName,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      bookRepo.create({
        id: id2,
        name: 'Second',
        normalizedName: dupName,
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Account Repository Integration', () => {
  it('should create an account with currency derived from book', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const accountRepo = new KyselyAccountRepository(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await bookRepo.create({
      id: bookId,
      name: 'Parent Book',
      normalizedName: `parent book ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await accountRepo.create({
      id: accountId,
      bookId,
      name: 'Test Account',
      normalizedName: `test account ${v7().slice(0, 8)}`,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await accountRepo.findById(accountId);
    expect(found).not.toBeNull();
    expect(found?.bookId).toBe(bookId);
    expect(found?.currency).toBe('BRL');
  });

  it('should enforce unique normalized name within same book', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const accountRepo = new KyselyAccountRepository(db);
    const bookId = v7();
    const accountId1 = v7();
    const accountId2 = v7();
    const dupName = `dup account ${v7().slice(0, 8)}`;
    const now = new Date();

    await bookRepo.create({
      id: bookId,
      name: 'Uniqueness Book',
      normalizedName: `uniqueness book ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await accountRepo.create({
      id: accountId1,
      bookId,
      name: 'First Account',
      normalizedName: dupName,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      accountRepo.create({
        id: accountId2,
        bookId,
        name: 'Second Account',
        normalizedName: dupName,
        type: 'savings',
        currency: 'BRL',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });

  it('should allow same normalized name in different books', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const accountRepo = new KyselyAccountRepository(db);
    const bookId1 = v7();
    const bookId2 = v7();
    const accountId1 = v7();
    const accountId2 = v7();
    const sharedName = `shared name ${v7().slice(0, 8)}`;
    const now = new Date();

    await bookRepo.create({
      id: bookId1,
      name: 'Book One',
      normalizedName: `book one ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await bookRepo.create({
      id: bookId2,
      name: 'Book Two',
      normalizedName: `book two ${v7().slice(0, 8)}`,
      currency: 'USD',
      timezone: 'America/New_York',
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await accountRepo.create({
      id: accountId1,
      bookId: bookId1,
      name: 'Shared Name',
      normalizedName: sharedName,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await accountRepo.create({
      id: accountId2,
      bookId: bookId2,
      name: 'Shared Name',
      normalizedName: sharedName,
      type: 'checking',
      currency: 'USD',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const accounts = await accountRepo.findByBookId(bookId2);
    expect(accounts).toHaveLength(1);
  });

  it('should enforce inactive Book check via Core createAccount, not raw FK', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const txPort = new KyselyTransactionPort(db);
    const bookId = v7();
    const now = new Date();

    // Create an inactive book directly
    await bookRepo.create({
      id: bookId,
      name: 'Inactive Book',
      normalizedName: `inactive book ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: false,
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Core invariant: cannot create Account under inactive Book via use case
    await expect(
      txPort.runInTransaction(async (ctx) => {
        return createAccount({ bookId, name: 'Orphan Account', type: 'checking' }, ctx, new Date());
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Verify no account was inserted
    const accounts = await new KyselyAccountRepository(db).findByBookId(bookId);
    expect(accounts).toHaveLength(0);
  });

  it('should allow repository to insert into inactive book (schema level) - proves Core invariant not FK', async () => {
    const bookRepo = new KyselyBookRepository(db);
    const accountRepo = new KyselyAccountRepository(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await bookRepo.create({
      id: bookId,
      name: 'Inactive Book 2',
      normalizedName: `inactive book 2 ${v7().slice(0, 8)}`,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: false,
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Direct repository should succeed - no FK constraint on active
    await accountRepo.create({
      id: accountId,
      bookId,
      name: 'Direct Account',
      normalizedName: `direct account ${v7().slice(0, 8)}`,
      type: 'checking',
      currency: 'BRL',
      institutionName: null,
      notes: null,
      active: true,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const found = await accountRepo.findById(accountId);
    expect(found).not.toBeNull();
  });
});

describe('FinancialUsageReader Integration', () => {
  it('should detect account usage through source account_id', async () => {
    const usageReader = new KyselyFinancialUsageReader(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Usage Book Src',
        `usage book src ${v7().slice(0, 8)}`,
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
        'Usage Account Src',
        `usage account src ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, type, status, amount, currency, description, transaction_date, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        v7(),
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        accountId,
        'expense',
        'posted',
        '10.50',
        'BRL',
        'Source transaction',
        '2026-01-15',
        'test',
        now,
        now,
      ],
    );

    expect(await usageReader.hasAccountUsage(accountId)).toBe(true);
  });

  it('should detect account usage through destination_account_id', async () => {
    const usageReader = new KyselyFinancialUsageReader(db);
    const bookId = v7();
    const srcAccountId = v7();
    const destAccountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Usage Book Dest',
        `usage book dest ${v7().slice(0, 8)}`,
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
        srcAccountId,
        bookId,
        'Src Transfer Account',
        `src transfer ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
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
        destAccountId,
        bookId,
        'Dest Transfer Account',
        `dest transfer ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, destination_account_id, type, status, amount, currency, description, transaction_date, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        v7(),
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        srcAccountId,
        destAccountId,
        'transfer',
        'posted',
        '20.00',
        'BRL',
        'Transfer transaction',
        '2026-01-15',
        'test',
        now,
        now,
      ],
    );

    expect(await usageReader.hasAccountUsage(destAccountId)).toBe(true);
  });

  it('should detect voided historical transaction usage', async () => {
    const usageReader = new KyselyFinancialUsageReader(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Voided Book',
        `voided book ${v7().slice(0, 8)}`,
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
        'Voided Account',
        `voided account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, type, status, amount, currency, description, transaction_date, source, voided_at, void_reason, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        v7(),
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        accountId,
        'expense',
        'voided',
        '5.00',
        'BRL',
        'Voided transaction',
        '2026-01-15',
        'test',
        now,
        'test void reason',
        now,
        now,
      ],
    );

    expect(await usageReader.hasAccountUsage(accountId)).toBe(true);
  });

  it('should detect book usage', async () => {
    const usageReader = new KyselyFinancialUsageReader(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Book Usage Book',
        `book usage book ${v7().slice(0, 8)}`,
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
        'Book Usage Account',
        `book usage account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO transactions (id, human_ref, book_id, account_id, type, status, amount, currency, description, transaction_date, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        v7(),
        v7().replaceAll('-', '').slice(0, 16),
        bookId,
        accountId,
        'expense',
        'posted',
        '100.00',
        'BRL',
        'Book transaction',
        '2026-01-15',
        'test',
        now,
        now,
      ],
    );

    expect(await usageReader.hasBookUsage(bookId)).toBe(true);
  });

  it('should return false for unused account and book', async () => {
    const usageReader = new KyselyFinancialUsageReader(db);
    expect(await usageReader.hasAccountUsage(v7())).toBe(false);
    expect(await usageReader.hasBookUsage(v7())).toBe(false);
  });
});

describe('SenderDefaultReferenceReader Integration', () => {
  it('should detect book referenced as sender default', async () => {
    const senderReader = new KyselySenderDefaultReferenceReader(db);
    const bookId = v7();
    const senderId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Default Ref Book',
        `default ref book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO authorized_senders (id, channel, sender_reference, name, default_book_id, default_account_id, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        senderId,
        'whatsapp',
        `+551199999999${Math.floor(Math.random() * 1000)}`,
        'Test Sender',
        bookId,
        null,
        true,
        now,
        now,
      ],
    );

    expect(await senderReader.hasBookDefault(bookId)).toBe(true);
  });

  it('should detect account referenced as sender default', async () => {
    const senderReader = new KyselySenderDefaultReferenceReader(db);
    const accountId = v7();
    const bookId = v7();
    const senderId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Sender Book',
        `sender book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO accounts (id, book_id, name, normalized_name, type, currency, institution_name, notes, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        accountId,
        bookId,
        'Sender Account',
        `sender account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        null,
        null,
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO authorized_senders (id, channel, sender_reference, name, default_book_id, default_account_id, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        senderId,
        'email',
        `test-${v7().slice(0, 8)}@example.com`,
        'Email Sender',
        bookId,
        accountId,
        true,
        now,
        now,
      ],
    );

    expect(await senderReader.hasAccountDefault(accountId)).toBe(true);
  });

  it('should detect inactive sender default still blocks archive', async () => {
    const senderReader = new KyselySenderDefaultReferenceReader(db);
    const bookId = v7();
    const senderId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Inactive Sender Book',
        `inactive sender book ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO authorized_senders (id, channel, sender_reference, name, default_book_id, default_account_id, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        senderId,
        'telegram',
        `inactive-${v7().slice(0, 8)}`,
        'Inactive Sender',
        bookId,
        null,
        false,
        now,
        now,
      ],
    );

    expect(await senderReader.hasBookDefault(bookId)).toBe(true);
  });

  it('should return false for unreferenced book and account', async () => {
    const senderReader = new KyselySenderDefaultReferenceReader(db);
    expect(await senderReader.hasBookDefault(v7())).toBe(false);
    expect(await senderReader.hasAccountDefault(v7())).toBe(false);
  });
});

describe('ConfigurationLockPort Deterministic Ordering', () => {
  it('should lock books and accounts in ascending ID order without deadlock', async () => {
    const txPort = new KyselyTransactionPort(db);
    const bookRepo = new KyselyBookRepository(db);
    const id1 = v7();
    const id2 = v7();
    const sorted = [id1, id2].sort();
    const now = new Date();

    // Create two books
    for (const id of [id1, id2]) {
      await pool.query(
        `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          `Lock Book ${id.slice(0, 8)}`,
          `lock book ${id.slice(0, 8)}`,
          'BRL',
          'America/Sao_Paulo',
          true,
          null,
          now,
          now,
        ],
      );
    }

    // Two concurrent transactions locking same books in opposite order - should not deadlock
    const results = await Promise.allSettled([
      txPort.runInTransaction(async (ctx) => {
        // Intentionally pass unsorted order - adapter should sort
        await ctx.locks.acquireLocks({ books: [id2, id1] });
        await new Promise((r) => setTimeout(r, 50));
      }),
      txPort.runInTransaction(async (ctx) => {
        await ctx.locks.acquireLocks({ books: [id1, id2] });
        await new Promise((r) => setTimeout(r, 50));
      }),
    ]);

    // Both should succeed (deterministic ordering prevents deadlock)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle duplicate IDs without error', async () => {
    const txPort = new KyselyTransactionPort(db);
    const id = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        `Dedup Book ${id.slice(0, 8)}`,
        `dedup book ${id.slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    // Duplicate ID should be deduplicated before locking
    await txPort.runInTransaction(async (ctx) => {
      await ctx.locks.acquireLocks({ books: [id, id, id] });
    });
  });
});

describe('Concurrency and Race Conditions', { timeout: 30000 }, () => {
  it('Scenario A — CreateAccount obtains Book lock first: both operations succeed', async () => {
    const txPort = new KyselyTransactionPort(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Race Book A',
        `race book a ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    // Use real independent connections for proper isolation
    const pool2 = new Pool({ connectionString });
    const db2 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool2 }) });

    try {
      // Create a barrier: CreateAccount locks first and holds
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Start transaction 1: CreateAccount flow
        await client1.query('BEGIN');
        await client1.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
          bookId,
        ]);
        const bookBefore = await client1.query('SELECT active FROM books WHERE id = $1', [bookId]);
        expect(bookBefore.rows[0].active).toBe(true);

        // Start transaction 2: ArchiveBook tries to lock same book (will block)
        const archivePromise = (async () => {
          const client = (await pool2.connect()) as any;
          try {
            await client.query('BEGIN');
            // This will block until client1 commits
            const result = await Promise.race([
              client.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
                bookId,
              ]),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 5000)),
            ]);
            const book = await client.query('SELECT active FROM books WHERE id = $1', [bookId]);
            // After CreateAccount commits, book is still active so archive can proceed
            if (book.rows[0].active) {
              await client.query(
                'UPDATE books SET active=false, archived_at=$1, updated_at=$1 WHERE id=$2',
                [new Date(), bookId],
              );
            }
            await client.query('COMMIT');
            return 'archived';
          } catch (e) {
            try {
              await client.query('ROLLBACK');
            } catch {}
            throw e;
          } finally {
            client.release();
          }
        })();

        // Small delay to let archive transaction block
        await new Promise((r) => setTimeout(r, 200));

        // CreateAccount completes: insert account while holding lock
        await client1.query(
          `INSERT INTO accounts (id, book_id, name, normalized_name, type, currency, active, archived_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            accountId,
            bookId,
            'Race Account A',
            `race account a ${v7().slice(0, 8)}`,
            'checking',
            'BRL',
            true,
            null,
            now,
            now,
          ],
        );
        await client1.query('COMMIT');

        // Archive should now complete successfully
        const archiveResult = await archivePromise;

        // Verify final state: both Account and archived Book exist
        const account = await pool.query('SELECT id FROM accounts WHERE id = $1', [accountId]);
        expect(account.rows).toHaveLength(1);

        const book = await pool.query('SELECT active FROM books WHERE id = $1', [bookId]);
        expect(book.rows[0].active).toBe(false);
      } finally {
        try {
          await client1.query('ROLLBACK');
        } catch {}
        client1.release();
        try {
          await client2.query('ROLLBACK');
        } catch {}
        client2.release();
      }
    } finally {
      await db2.destroy();
      await pool2.end();
    }
  });

  it('Scenario B — ArchiveBook obtains Book lock first: CreateAccount fails deterministically', async () => {
    const txPort = new KyselyTransactionPort(db);
    const bookId = v7();
    const accountId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Race Book B',
        `race book b ${v7().slice(0, 8)}`,
        'BRL',
        'America/Sao_Paulo',
        true,
        null,
        now,
        now,
      ],
    );

    // Use independent connections
    const pool2 = new Pool({ connectionString });

    try {
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        // Archive transaction locks first
        await client1.query('BEGIN');
        await client1.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
          bookId,
        ]);
        await client1.query(
          'UPDATE books SET active=false, archived_at=$1, updated_at=$1 WHERE id=$2',
          [new Date(), bookId],
        );

        // CreateAccount transaction tries to lock (will block)
        const createPromise = (async () => {
          const client = (await pool2.connect()) as any;
          try {
            await client.query('BEGIN');
            await client.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
              bookId,
            ]);
            const book = await client.query('SELECT active FROM books WHERE id = $1', [bookId]);
            if (!book.rows[0].active) {
              await client.query('ROLLBACK');
              throw new ValidationError('Cannot create Account for inactive Book', 'bookId');
            }
            await client.query(
              `INSERT INTO accounts (id, book_id, name, normalized_name, type, currency, active, archived_at, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [
                accountId,
                bookId,
                'Race Account B',
                `race account b ${v7().slice(0, 8)}`,
                'checking',
                'BRL',
                true,
                null,
                now,
                now,
              ],
            );
            await client.query('COMMIT');
            return 'created';
          } catch (e) {
            try {
              await client.query('ROLLBACK');
            } catch {}
            throw e;
          } finally {
            client.release();
          }
        })();

        // Small delay to let create transaction block
        await new Promise((r) => setTimeout(r, 200));

        // Archive commits
        await client1.query('COMMIT');

        // CreateAccount should fail because book is now inactive
        await expect(createPromise).rejects.toThrow(ValidationError);

        // Verify no account was inserted
        const account = await pool.query('SELECT id FROM accounts WHERE id = $1', [accountId]);
        expect(account.rows).toHaveLength(0);

        // Verify book is archived
        const book = await pool.query('SELECT active FROM books WHERE id = $1', [bookId]);
        expect(book.rows[0].active).toBe(false);
      } finally {
        try {
          await client1.query('ROLLBACK');
        } catch {}
        client1.release();
        try {
          await client2.query('ROLLBACK');
        } catch {}
        client2.release();
      }
    } finally {
      await pool2.end();
    }
  });

  it('should handle transaction rollback on error', async () => {
    const txPort = new KyselyTransactionPort(db);
    const bookId = v7();
    const now = new Date();

    try {
      await txPort.runInTransaction(async (ctx) => {
        await ctx.books.create({
          id: bookId,
          name: 'Rollback Test',
          normalizedName: `rollback test ${v7().slice(0, 8)}`,
          currency: 'BRL',
          timezone: 'America/Sao_Paulo',
          active: true,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        throw new Error('Intentional failure');
      });
    } catch {
      // Expected
    }

    const found = await new KyselyBookRepository(db).findById(bookId);
    expect(found).toBeNull();
  });

  it('should prevent stale default assignment via Book/Account lock protocol', async () => {
    const bookId = v7();
    const accountId = v7();
    const senderId = v7();
    const now = new Date();

    await pool.query(
      `INSERT INTO books (id, name, normalized_name, currency, timezone, active, archived_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        bookId,
        'Default Race Book',
        `default race book ${v7().slice(0, 8)}`,
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
        'Default Race Account',
        `default race account ${v7().slice(0, 8)}`,
        'checking',
        'BRL',
        true,
        null,
        now,
        now,
      ],
    );

    await pool.query(
      `INSERT INTO authorized_senders (id, channel, sender_reference, name, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [senderId, 'test-race', `sender-${v7().slice(0, 8)}`, 'Race Sender', true, now, now],
    );

    const pool2 = new Pool({ connectionString });

    try {
      // Scenario: Archive account, then try to assign it as default (must lock Book/Account first)
      const client1 = await pool.connect();
      try {
        // Archive account first
        await client1.query('BEGIN');
        await client1.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
          bookId,
        ]);
        await client1.query('SELECT id FROM accounts WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
          accountId,
        ]);

        // Competing default assignment tries to lock same resources (will block)
        const defaultAssignPromise = (async () => {
          const client = (await pool2.connect()) as any;
          try {
            await client.query('BEGIN');
            await client.query('SELECT id FROM books WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
              bookId,
            ]);
            await client.query('SELECT id FROM accounts WHERE id = $1 ORDER BY id ASC FOR UPDATE', [
              accountId,
            ]);
            const account = await client.query('SELECT active FROM accounts WHERE id = $1', [
              accountId,
            ]);
            // Re-read after lock: if account is inactive, default assignment should fail
            if (!account.rows[0].active) {
              await client.query('ROLLBACK');
              throw new ValidationError(
                'Cannot assign inactive Account as default',
                'defaultAccountId',
              );
            }
            await client.query(
              'UPDATE authorized_senders SET default_book_id=$1, default_account_id=$2 WHERE id=$3',
              [bookId, accountId, senderId],
            );
            await client.query('COMMIT');
            return 'assigned';
          } catch (e) {
            try {
              await client.query('ROLLBACK');
            } catch {}
            throw e;
          } finally {
            client.release();
          }
        })();

        await new Promise((r) => setTimeout(r, 200));

        // Archive account
        await client1.query('UPDATE accounts SET active=false, archived_at=$1 WHERE id=$2', [
          new Date(),
          accountId,
        ]);
        await client1.query('COMMIT');

        // Default assignment should fail (saw archived state after acquiring lock)
        await expect(defaultAssignPromise).rejects.toThrow();

        // Verify account is archived and no default was assigned
        const account = await pool.query('SELECT active FROM accounts WHERE id = $1', [accountId]);
        expect(account.rows[0].active).toBe(false);

        const sender = await pool.query(
          'SELECT default_account_id FROM authorized_senders WHERE id = $1',
          [senderId],
        );
        expect(sender.rows[0].default_account_id).toBeNull();
      } finally {
        try {
          await client1.query('ROLLBACK');
        } catch {}
        client1.release();
      }
    } finally {
      await pool2.end();
    }
  });
});
