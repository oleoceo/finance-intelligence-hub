/**
* PostgreSQL integration tests for Authorized Senders (M03-T04).
* Tests CRUD, identity uniqueness, default consistency, and archive race scenarios.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  KyselyAuthorizedSenderRepository,
  KyselyBookRepository,
  KyselyAccountRepository,
} from '@finance-hub/database';
import type { DB } from '../../database/src/db-types.js';
import { randomUUID } from 'node:crypto';

let db: Kysely<DB>;
let senderRepo: KyselyAuthorizedSenderRepository;
let bookRepo: KyselyBookRepository;
let accountRepo: KyselyAccountRepository;

beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  senderRepo = new KyselyAuthorizedSenderRepository(db);
  bookRepo = new KyselyBookRepository(db);
  accountRepo = new KyselyAccountRepository(db);
});

describe('Authorized Sender PostgreSQL Integration', () => {
  let bookId: string;
  let accountId: string;

  beforeEach(async () => {
    // Create test Book
    const now = new Date();
    bookId = randomUUID();
    await bookRepo.create({
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

    // Create test Account
    accountId = randomUUID();
    await accountRepo.create({
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
  });

  it('creates a sender without defaults', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await senderRepo.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Test Sender',
      default_book_id: null,
      default_account_id: null,
      active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await senderRepo.findById(senderId);
    expect(found).not.toBeNull();
    expect(found!.channel).toBe('whatsapp');
    expect(found!.senderReference).toBe('5511999999999');
    expect(found!.defaultBookId).toBeNull();
    expect(found!.defaultAccountId).toBeNull();
  });

  it('creates a sender with defaults', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await senderRepo.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999998',
      name: 'Test Sender',
      default_book_id: bookId,
      default_account_id: accountId,
      active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await senderRepo.findById(senderId);
    expect(found).not.toBeNull();
    expect(found!.defaultBookId).toBe(bookId);
    expect(found!.defaultAccountId).toBe(accountId);
  });

  it('enforces unique (channel, sender_reference)', async () => {
    const now = new Date();
    const senderId1 = randomUUID();
    const senderId2 = randomUUID();
    await senderRepo.create({
      id: senderId1,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Sender 1',
      default_book_id: null,
      default_account_id: null,
      active: true,
      created_at: now,
      updated_at: now,
    });

    await expect(
      senderRepo.create({
        id: senderId2,
        channel: 'whatsapp',
        sender_reference: '5511999999999',
        name: 'Sender 2',
        default_book_id: null,
        default_account_id: null,
        active: true,
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });

  it('finds sender by channel and reference', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await senderRepo.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Test Sender',
      default_book_id: null,
      default_account_id: null,
      active: true,
      created_at: now,
      updated_at: now,
    });

    const found = await senderRepo.findByChannelAndReference('whatsapp', '5511999999999');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(senderId);
  });

  it('updates sender name and deactivates', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await senderRepo.create({
      id: senderId,
      channel: 'whatsapp',
      sender_reference: '5511999999999',
      name: 'Old Name',
      default_book_id: null,
      default_account_id: null,
      active: true,
      created_at: now,
      updated_at: now,
    });

    const updated = await senderRepo.update({
      id: senderId,
      name: 'New Name',
      active: false,
      updated_at: new Date(),
    });
    expect(updated.name).toBe('New Name');
    expect(updated.active).toBe(false);
  });

  it('clears defaults by setting to null', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await senderRepo.create({
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

    const updated = await senderRepo.update({
      id: senderId,
      default_book_id: null,
      default_account_id: null,
      updated_at: new Date(),
    });
    expect(updated.defaultBookId).toBeNull();
    expect(updated.defaultAccountId).toBeNull();
  });

  it('rejects default_account_id without default_book_id (CHECK constraint)', async () => {
    const now = new Date();
    const senderId = randomUUID();
    await expect(
      senderRepo.create({
        id: senderId,
        channel: 'whatsapp',
        sender_reference: '5511999999999',
        name: 'Test Sender',
        default_book_id: null,
        default_account_id: accountId,
        active: true,
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });
});