/**
* PostgreSQL concurrency/race barrier tests for Classification Rules (M03-T04).
* Tests two-connection barriers for Rule configuration vs target archive scenarios.
*/
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import {
 KyselyClassificationRuleRepository,
 KyselyBookRepository,
 KyselyAccountRepository,
} from '@finance-hub/database';
import type { DB } from '../../database/src/db-types.js';
import { randomUUID } from 'node:crypto';

describe('Classification Rule Concurrency Barriers', () => {
 let pool1: Pool;
 let pool2: Pool;
 let db1: Kysely<DB>;
 let db2: Kysely<DB>;
 let ruleRepo1: KyselyClassificationRuleRepository;
 let bookRepo1: KyselyBookRepository;
 let accountRepo1: KyselyAccountRepository;
 let bookRepo2: KyselyBookRepository;

 beforeEach(async () => {
 pool1 = new Pool({ connectionString: process.env.DATABASE_URL });
 pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
 db1 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool1 }) });
 db2 = new Kysely<DB>({ dialect: new PostgresDialect({ pool: pool2 }) });
 ruleRepo1 = new KyselyClassificationRuleRepository(db1);
 bookRepo1 = new KyselyBookRepository(db1);
 accountRepo1 = new KyselyAccountRepository(db1);
 bookRepo2 = new KyselyBookRepository(db2);
 });

 afterEach(async () => {
 await pool1.end();
 await pool2.end();
 });

 it('archive-first blocks new Rule configuration with inactive target', async () => {
 // Setup: Create Book
 const now = new Date();
 const bookId = randomUUID();
 await bookRepo1.create({
 id: bookId,
 name: 'Test Book',
 normalizedName: 'test_book',
 currency: 'BRL',
 timezone: 'America/Sao_Paulo',
 active: true,
 archivedAt: null,
 createdAt: now,
 updatedAt: now,
 });

 // Archive Book first (via connection 2)
 await bookRepo2.update({
 id: bookId,
 name: 'Archived Book',
 normalizedName: 'archived_book',
 currency: 'BRL',
 timezone: 'America/Sao_Paulo',
 updatedAt: new Date(),
 });
 await bookRepo2.archive({
 id: bookId,
 active: false,
 archivedAt: new Date(),
 updatedAt: new Date(),
 });

 // Try to create Rule with archived Book (should fail in Core validation)
 const ruleInput = {
 priority: 10,
 matchType: 'exact' as const,
 pattern: 'test',
 targetBookId: bookId,
 };

 // This should fail because the Book is inactive
 await expect(
 ruleRepo1.create({
 id: randomUUID(),
 priority: ruleInput.priority,
 active: true,
 matchType: ruleInput.matchType,
 pattern: ruleInput.pattern,
 normalizedPattern: ruleInput.pattern.toLowerCase(),
 targetBookId: ruleInput.targetBookId,
 targetAccountId: null,
 targetCategoryId: null,
 targetMerchantId: null,
 source: 'manual',
 createdAt: now,
 updatedAt: now,
 }),
 ).rejects.toThrow();
 });

 it('rule-creation-first permits later target archive', async () => {
 // Setup: Create Book
 const now = new Date();
 const bookId = randomUUID();
 await bookRepo1.create({
 id: bookId,
 name: 'Test Book',
 normalizedName: 'test_book',
 currency: 'BRL',
 timezone: 'America/Sao_Paulo',
 active: true,
 archivedAt: null,
 createdAt: now,
 updatedAt: now,
 });

 // Create Rule with Book target
 const ruleId = randomUUID();
 await ruleRepo1.create({
 id: ruleId,
 priority: 10,
 active: true,
 matchType: 'exact',
 pattern: 'test',
 normalizedPattern: 'test',
 targetBookId: bookId,
 targetAccountId: null,
 targetCategoryId: null,
 targetMerchantId: null,
 source: 'manual',
 createdAt: now,
 updatedAt: now,
 });

 // Archive Book after Rule creation (should succeed - Rule preserves reference)
 await bookRepo1.archive({
 id: bookId,
 active: false,
 archivedAt: new Date(),
 updatedAt: new Date(),
 });

 // Verify Rule still exists with archived Book reference
 const rule = await ruleRepo1.findById(ruleId);
 expect(rule).not.toBeNull();
 expect(rule!.targetBookId).toBe(bookId);
 });
});