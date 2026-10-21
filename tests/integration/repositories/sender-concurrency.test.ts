/**
 * PostgreSQL concurrency/race barrier tests for Authorized Senders (M03-T04).
 * Tests two-connection barriers for Sender assignment/removal vs Book/Account archive scenarios.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  KyselyAuthorizedSenderRepository,
  KyselyBookRepository,
  KyselyAccountRepository,
} from '@finance-hub/database';
import type { DB } from '../../database/src/db-types.js';
import { randomUUID } from 'node:crypto';

describe('Authorized Sender Concurrency Barriers', () => {
  let pool1: Pool;
  let pool2: Pool;
  let db1: Kysely<DB>;
  let db2: Kysely<DB>;
  let senderRepo1: KyselyAuthorizedSenderRepository;
  let bookRepo1: KyselyBookRepository;
  let accountRepo1: KyselyAccountRepository;
  let bookRepo2: KyselyBookRepository;
  let accountRepo2: KyselyAccountRepository;

  beforeEach(async () => {
    pool1 = new Pool({ connectionString: process.env.DATABASE_URL });
    pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
    db1 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool1 }) });
    db2 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool2 }) });
    senderRepo1 = new KyselyAuthorizedSenderRepository(db1);
    bookRepo1 = new KyselyBookRepository(db1);
    accountRepo1 = new KyselyAccountRepository(db1);
    bookRepo2 = new KyselyBookRepository(db2);
    accountRepo2 = new KyselyAccountRepository(db2);
  });

  afterEach(async () => {
    await pool1.end();
    await pool2.end();
  });

  it('archive-first blocks Sender assignment with inactive default', async () => {
    // Setup: Create Book and Account
    const now = new Date();
    const bookId = randomUUID();
    const accountId = randomUUID();
    await bookRepo1.create({
      id: bookId,
      name: 'Test Book',
      normalized_name: 'test_book',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    await accountRepo1.create({
      id: accountId,
      book_id: bookId,
      name: 'Test Account',
      normalized_name: 'test_account',
      type: 'checking',
      currency: 'BRL',
      institution_name: null,
      notes: null,
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });

    // Archive Book first (via connection 2)
    await bookRepo2.update({
      id: bookId,
      name: 'Archived Book',
      normalized_name: 'archived_book',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      updated_at: new Date(),
    });
    await bookRepo2.archive({
      id: bookId,
      active: false,
      archived_at: new Date(),
      updated_at: new Date(),
    });

    // Try to create Sender with archived Book as default (should fail CHECK/FK constraint)
    const senderId = randomUUID();
    await expect(
      senderRepo1.create({
        id: senderId,
        channel: 'whatsapp',
        sender_reference: '5511999999999',
        name: 'Test Sender',
        default_book_id: bookId,
        default_account_id: accountId,
        active: true,
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });

  it('sender-assignment-first permits later Book archive', async () => {
    // Setup: Create Book and Account
    const now = new Date();
    const bookId = randomUUID();
    const accountId = randomUUID();
    await bookRepo1.create({
      id: bookId,
      name: 'Test Book',
      normalized_name: 'test_book',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    await accountRepo1.create({
      id: accountId,
      book_id: bookId,
      name: 'Test Account',
      normalized_name: 'test_account',
      type: 'checking',
      currency: 'BRL',
      institution_name: null,
      notes: null,
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });

    // Create Sender with Book/Account defaults
    const senderId = randomUUID();
    await senderRepo1.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Test Sender',
      default_book_id: bookId,
      default_account_id: accountId,
      active: true,
      created_at: now,
      updated_at: now,
    });

    // Archive Book after Sender creation (should succeed - Sender preserves reference)
    await bookRepo1.archive({
      id: bookId,
      active: false,
      archived_at: new Date(),
      updated_at: new Date(),
    });

    // Verify Sender still exists with archived Book reference
    const sender = await senderRepo1.findById(senderId);
    expect(sender).not.toBeNull();
    expect(sender!.defaultBookId).toBe(bookId);
    expect(sender!.defaultAccountId).toBe(accountId);
  });

  it('removal-first permits Book archive', async () => {
    // Setup: Create Book, Account, and Sender with defaults
    const now = new Date();
    const bookId = randomUUID();
    const accountId = randomUUID();
    await bookRepo1.create({
      id: bookId,
      name: 'Test Book',
      normalized_name: 'test_book',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    await accountRepo1.create({
      id: accountId,
      book_id: bookId,
      name: 'Test Account',
      normalized_name: 'test_account',
      type: 'checking',
      currency: 'BRL',
      institution_name: null,
      notes: null,
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });

    const senderId = randomUUID();
    await senderRepo1.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Test Sender',
      default_book_id: bookId,
      default_account_id: accountId,
      active: true,
      created_at: now,
      updated_at: now,
    });

    // Remove defaults from Sender
    await senderRepo1.update({
      id: senderId,
      default_book_id: null,
      default_account_id: null,
      updated_at: new Date(),
    });

    // Archive Book after defaults removed (should succeed)
    await bookRepo1.archive({
      id: bookId,
      active: false,
      archived_at: new Date(),
      updated_at: new Date(),
    });

    // Verify Book is archived
    const book = await bookRepo1.findById(bookId);
    expect(book).not.toBeNull();
    expect(book!.active).toBe(false);
    expect(book!.archivedAt).not.toBeNull();
  });
});
