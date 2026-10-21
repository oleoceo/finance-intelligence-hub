/**
 * Classification Rule configuration use cases (M03-T04).
 *
 * Implements CreateClassificationRule, GetClassificationRule, ListClassificationRules, UpdateClassificationRule.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */

import { v7 as uuidv7 } from 'uuid';
import { validateNonBlankName } from '../../domain/master-data/normalization.js';
import type { MasterDataTransactionContextT04 } from '../ports/master-data-ports.js';
import {
  validateMatchType,
  validateAtLeastOneTarget,
  normalizePattern,
  validatePriority,
  type CreateClassificationRuleInput,
  type UpdateClassificationRuleInput,
  type ClassificationRuleRecord,
} from '../../domain/master-data/classification-rule.js';

export async function createClassificationRule(
  input: CreateClassificationRuleInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<ClassificationRuleRecord> {
  // Validate inputs
  validatePriority(input.priority);
  validateMatchType(input.matchType);
  validateAtLeastOneTarget(input);

  const trimmedPattern = validateNonBlankName(input.pattern);
  const normalizedPattern = normalizePattern(input.pattern);

  // Discover and lock referenced entities in total order
  const bookIds: string[] = [];
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  const merchantIds: string[] = [];

  if (input.targetBookId) bookIds.push(input.targetBookId);
  if (input.targetAccountId) accountIds.push(input.targetAccountId);
  if (input.targetCategoryId) categoryIds.push(input.targetCategoryId);
  if (input.targetMerchantId) merchantIds.push(input.targetMerchantId);

  // Discover additional Book contexts from Account/Category
  if (input.targetAccountId) {
    const account = await ctx.accounts.findById(input.targetAccountId);
    if (account && !bookIds.includes(account.bookId)) {
      bookIds.push(account.bookId);
    }
  }
  if (input.targetCategoryId) {
    const category = await ctx.categories.findById(input.targetCategoryId);
    if (category && !bookIds.includes(category.bookId)) {
      bookIds.push(category.bookId);
    }
  }

  // Sort all IDs for deterministic locking
  bookIds.sort();
  accountIds.sort();
  categoryIds.sort();
  merchantIds.sort();

  // Acquire locks in total entity rank order: Books > Accounts > Categories > Merchants > Rules
  await ctx.locks.acquireLocks({ books: bookIds });

  // Re-read after locking to verify lock set hasn't changed
  const reReadBookIds: string[] = [];
  if (input.targetBookId) {
    const book = await ctx.books.findById(input.targetBookId);
    if (!book) throw new Error('Target Book not found');
    if (!book.active) throw new Error('Target Book must be active');
    reReadBookIds.push(input.targetBookId);
  }
  if (input.targetAccountId) {
    const account = await ctx.accounts.findById(input.targetAccountId);
    if (!account) throw new Error('Target Account not found');
    if (!account.active) throw new Error('Target Account must be active');
    if (!reReadBookIds.includes(account.bookId)) reReadBookIds.push(account.bookId);
  }
  if (input.targetCategoryId) {
    const category = await ctx.categories.findById(input.targetCategoryId);
    if (!category) throw new Error('Target Category not found');
    if (!category.active) throw new Error('Target Category must be active');
    if (!reReadBookIds.includes(category.bookId)) reReadBookIds.push(category.bookId);
  }
  if (input.targetMerchantId) {
    const merchant = await ctx.merchants.findById(input.targetMerchantId);
    if (!merchant) throw new Error('Target Merchant not found');
    if (!merchant.active) throw new Error('Target Merchant must be active');
  }

  // Verify all discovered Book contexts agree
  reReadBookIds.sort();
  await ctx.locks.acquireLocks({
    books: reReadBookIds,
    accounts: accountIds,
    categories: categoryIds,
    merchants: merchantIds,
  });

  // Generate UUIDv7
  const id = uuidv7();

  const record: ClassificationRuleRecord = {
    id,
    priority: input.priority,
    active: true,
    matchType: input.matchType as 'exact' | 'contains',
    pattern: trimmedPattern,
    normalizedPattern,
    targetBookId: input.targetBookId ?? null,
    targetAccountId: input.targetAccountId ?? null,
    targetCategoryId: input.targetCategoryId ?? null,
    targetMerchantId: input.targetMerchantId ?? null,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };

  await ctx.classificationRules.create(record);
  return record;
}

export async function getClassificationRule(
  id: string,
  ctx: MasterDataTransactionContextT04,
): Promise<ClassificationRuleRecord | null> {
  return ctx.classificationRules.findById(id);
}

export async function listClassificationRules(
  ctx: MasterDataTransactionContextT04,
): Promise<ClassificationRuleRecord[]> {
  return ctx.classificationRules.find();
}

export async function updateClassificationRule(
  input: UpdateClassificationRuleInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<ClassificationRuleRecord> {
  // First get rule to determine which targets need locking
  const existing = await ctx.classificationRules.findById(input.id);
  if (!existing) {
    throw new Error('Classification Rule not found');
  }

  // Determine which targets need locking (current + proposed)
  const bookIds: string[] = [];
  const accountIds: string[] = [];
  const categoryIds: string[] = [];
  const merchantIds: string[] = [];

  // Current targets
  if (existing.targetBookId) bookIds.push(existing.targetBookId);
  if (existing.targetAccountId) accountIds.push(existing.targetAccountId);
  if (existing.targetCategoryId) categoryIds.push(existing.targetCategoryId);
  if (existing.targetMerchantId) merchantIds.push(existing.targetMerchantId);

  // Proposed targets
  if (
    input.targetBookId !== undefined &&
    input.targetBookId !== null &&
    !bookIds.includes(input.targetBookId)
  ) {
    bookIds.push(input.targetBookId);
  }
  if (
    input.targetAccountId !== undefined &&
    input.targetAccountId !== null &&
    !accountIds.includes(input.targetAccountId)
  ) {
    accountIds.push(input.targetAccountId);
  }
  if (
    input.targetCategoryId !== undefined &&
    input.targetCategoryId !== null &&
    !categoryIds.includes(input.targetCategoryId)
  ) {
    categoryIds.push(input.targetCategoryId);
  }
  if (
    input.targetMerchantId !== undefined &&
    input.targetMerchantId !== null &&
    !merchantIds.includes(input.targetMerchantId)
  ) {
    merchantIds.push(input.targetMerchantId);
  }

  // Discover additional Book contexts from Account/Category
  const allTargetAccountIds = [
    ...(input.targetAccountId ? [input.targetAccountId] : []),
    ...(existing.targetAccountId ? [existing.targetAccountId] : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const allTargetCategoryIds = [
    ...(input.targetCategoryId ? [input.targetCategoryId] : []),
    ...(existing.targetCategoryId ? [existing.targetCategoryId] : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const accountId of allTargetAccountIds) {
    const account = await ctx.accounts.findById(accountId);
    if (account && !bookIds.includes(account.bookId)) {
      bookIds.push(account.bookId);
    }
  }
  for (const categoryId of allTargetCategoryIds) {
    const category = await ctx.categories.findById(categoryId);
    if (category && !bookIds.includes(category.bookId)) {
      bookIds.push(category.bookId);
    }
  }

  // Sort all IDs for deterministic locking
  bookIds.sort();
  accountIds.sort();
  categoryIds.sort();
  merchantIds.sort();

  // Acquire locks in total entity rank order
  await ctx.locks.acquireLocks({ books: bookIds });

  // Re-read after locking
  const lockedCurrent = await ctx.classificationRules.findById(input.id);
  if (!lockedCurrent) throw new Error('Classification Rule not found');

  await ctx.locks.acquireLocks({
    books: bookIds,
    accounts: accountIds,
    categories: categoryIds,
    merchants: merchantIds,
  });

  // Re-read all targets after locking to validate active state
  const proposedBookId =
    input.targetBookId !== undefined ? input.targetBookId : existing.targetBookId;
  const proposedAccountId =
    input.targetAccountId !== undefined ? input.targetAccountId : existing.targetAccountId;
  const proposedCategoryId =
    input.targetCategoryId !== undefined ? input.targetCategoryId : existing.targetCategoryId;
  const proposedMerchantId =
    input.targetMerchantId !== undefined ? input.targetMerchantId : existing.targetMerchantId;

  if (proposedBookId) {
    const book = await ctx.books.findById(proposedBookId);
    if (!book) throw new Error('Target Book not found');
    if (!book.active) throw new Error('Target Book must be active');
  }
  if (proposedAccountId) {
    const account = await ctx.accounts.findById(proposedAccountId);
    if (!account) throw new Error('Target Account not found');
    if (!account.active) throw new Error('Target Account must be active');
  }
  if (proposedCategoryId) {
    const category = await ctx.categories.findById(proposedCategoryId);
    if (!category) throw new Error('Target Category not found');
    if (!category.active) throw new Error('Target Category must be active');
  }
  if (proposedMerchantId) {
    const merchant = await ctx.merchants.findById(proposedMerchantId);
    if (!merchant) throw new Error('Target Merchant not found');
    if (!merchant.active) throw new Error('Target Merchant must be active');
  }

  // Validate at least one target remains
  const hasTarget =
    proposedBookId != null ||
    proposedAccountId != null ||
    proposedCategoryId != null ||
    proposedMerchantId != null;
  if (!hasTarget) {
    throw new Error('Classification rule must have at least one target');
  }

  // Build update input
  let newPriority = existing.priority;
  let newMatchType = existing.matchType;
  let newPattern = existing.pattern;
  let newNormalizedPattern = existing.normalizedPattern;

  if (input.priority !== undefined) {
    validatePriority(input.priority);
    newPriority = input.priority;
  }
  if (input.matchType !== undefined) {
    validateMatchType(input.matchType);
    newMatchType = input.matchType as 'exact' | 'contains';
  }
  if (input.pattern !== undefined) {
    validateNonBlankName(input.pattern);
    newPattern = validateNonBlankName(input.pattern);
    newNormalizedPattern = normalizePattern(input.pattern);
  }

  const updated = await ctx.classificationRules.update({
    id: input.id,
    priority: newPriority,
    matchType: newMatchType,
    pattern: newPattern,
    normalizedPattern: newNormalizedPattern,
    targetBookId: proposedBookId,
    targetAccountId: proposedAccountId,
    targetCategoryId: proposedCategoryId,
    targetMerchantId: proposedMerchantId,
    active: input.active !== undefined ? input.active : existing.active,
    updatedAt: now,
  });

  return updated;
}
