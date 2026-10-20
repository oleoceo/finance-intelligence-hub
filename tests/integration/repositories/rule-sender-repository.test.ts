/**
* PostgreSQL integration tests for Classification Rules (M03-T04).
* Tests CRUD, target FKs/CHECKs, active validation, and archive race scenarios.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
  KyselyClassificationRuleRepository,
  KyselyBookRepository,
  KyselyAccountRepository,
  KyselyCategoryRepository,
  KyselyMerchantRepository,
} from '@finance-hub/database';
import type { DB } from '../../database/src/db-types.js';
import { randomUUID } from 'node:crypto';

let db: Kysely<DB>;
let ruleRepo: KyselyClassificationRuleRepository;
let bookRepo: KyselyBookRepository;
let accountRepo: KyselyAccountRepository;
let categoryRepo: KyselyCategoryRepository;
let merchantRepo: KyselyMerchantRepository;

beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  ruleRepo = new KyselyClassificationRuleRepository(db);
  bookRepo = new KyselyBookRepository(db);
  accountRepo = new KyselyAccountRepository(db);
  categoryRepo = new KyselyCategoryRepository(db);
  merchantRepo = new KyselyMerchantRepository(db);
});

describe('Classification Rule PostgreSQL Integration', () => {
  let bookId: string;
  let accountId: string;
  let categoryId: string;
  let merchantId: string;

  beforeEach(async () => {
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

    categoryId = randomUUID();
    await categoryRepo.create({
      id: categoryId,
      book_id: bookId,
      name: 'Test Category',
      normalized_name: 'test_category',
      parent_category_id: null,
      type: 'both',
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });

    merchantId = randomUUID();
    await merchantRepo.create({
      id: merchantId,
      name: 'Test Merchant',
      normalized_name: 'test_merchant',
      type: null,
      tax_identifier: null,
      active: true,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
  });

  it('creates a rule with all targets', async () => {
    const now = new Date();
    const ruleId = randomUUID();
    await ruleRepo.create({
      id: ruleId,
      priority: 10,
      active: true,
      match_type: 'contains',
      pattern: 'google ads',
      normalized_pattern: 'google ads',
      target_book_id: bookId,
      target_account_id: accountId,
      target_category_id: categoryId,
      target_merchant_id: merchantId,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    const found = await ruleRepo.findById(ruleId);
    expect(found).not.toBeNull();
    expect(found!.targetBookId).toBe(bookId);
    expect(found!.targetAccountId).toBe(accountId);
    expect(found!.targetCategoryId).toBe(categoryId);
    expect(found!.targetMerchantId).toBe(merchantId);
  });

  it('creates a rule with only targetBookId', async () => {
    const now = new Date();
    const ruleId = randomUUID();
    await ruleRepo.create({
      id: ruleId,
      priority: 50,
      active: true,
      match_type: 'exact',
      pattern: 'test',
      normalized_pattern: 'test',
      target_book_id: bookId,
      target_account_id: null,
      target_category_id: null,
      target_merchant_id: null,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    const found = await ruleRepo.findById(ruleId);
    expect(found).not.toBeNull();
    expect(found!.targetBookId).toBe(bookId);
    expect(found!.targetAccountId).toBeNull();
  });

  it('rejects rule with no targets (CHECK constraint)', async () => {
    const now = new Date();
    const ruleId = randomUUID();
    await expect(
      ruleRepo.create({
        id: ruleId,
        priority: 10,
        active: true,
        match_type: 'exact',
        pattern: 'test',
        normalized_pattern: 'test',
        target_book_id: null,
        target_account_id: null,
        target_category_id: null,
        target_merchant_id: null,
        source: 'manual',
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow();
  });

  it('updates rule priority and pattern', async () => {
    const now = new Date();
    const ruleId = randomUUID();
    await ruleRepo.create({
      id: ruleId,
      priority: 10,
      active: true,
      match_type: 'exact',
      pattern: 'old',
      normalized_pattern: 'old',
      target_book_id: bookId,
      target_account_id: null,
      target_category_id: null,
      target_merchant_id: null,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    const updated = await ruleRepo.update({
      id: ruleId,
      priority: 20,
      pattern: 'new',
      normalized_pattern: 'new',
      updated_at: new Date(),
    });
    expect(updated.priority).toBe(20);
    expect(updated.pattern).toBe('new');
  });

  it('deactivates rule (active=false)', async () => {
    const now = new Date();
    const ruleId = randomUUID();
    await ruleRepo.create({
      id: ruleId,
      priority: 10,
      active: true,
      match_type: 'exact',
      pattern: 'test',
      normalized_pattern: 'test',
      target_book_id: bookId,
      target_account_id: null,
      target_category_id: null,
      target_merchant_id: null,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    const updated = await ruleRepo.update({
      id: ruleId,
      active: false,
      updated_at: new Date(),
    });
    expect(updated.active).toBe(false);
  });

  it('lists rules ordered by priority ASC, created_at ASC', async () => {
    const now = new Date();
    await ruleRepo.create({
      id: randomUUID(),
      priority: 20,
      active: true,
      match_type: 'exact',
      pattern: 'b',
      normalized_pattern: 'b',
      target_book_id: bookId,
      target_account_id: null,
      target_category_id: null,
      target_merchant_id: null,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });
    await ruleRepo.create({
      id: randomUUID(),
      priority: 10,
      active: true,
      match_type: 'exact',
      pattern: 'a',
      normalized_pattern: 'a',
      target_book_id: bookId,
      target_account_id: null,
      target_category_id: null,
      target_merchant_id: null,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    const rules = await ruleRepo.find();
    expect(rules.length).toBe(2);
    expect(rules[0].priority).toBe(10);
    expect(rules[1].priority).toBe(20);
  });
});