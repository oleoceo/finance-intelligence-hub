import { v7 as uuidv7 } from 'uuid';
import { validateNonBlankName } from '../../domain/master-data/normalization.js';
import { MasterDataError } from '../../domain/master-data/errors.js';
import {
  ConfigurationLockSetChangedError,
  type MasterDataTransactionContextT04,
  type LockSpec,
} from '../ports/master-data-ports.js';
import {
  validateMatchType,
  validateAtLeastOneTarget,
  normalizePattern,
  validatePriority,
  type CreateClassificationRuleInput,
  type UpdateClassificationRuleInput,
  type ClassificationRuleRecord,
} from '../../domain/master-data/classification-rule.js';

type Targets = Pick<
  CreateClassificationRuleInput,
  'targetBookId' | 'targetAccountId' | 'targetCategoryId' | 'targetMerchantId'
>;
const ids = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((id): id is string => id != null))].sort();

// Discovery reads identify locks only. Policy is evaluated from fresh reads after all locks.
async function discover(
  targets: Targets[],
  ctx: MasterDataTransactionContextT04,
): Promise<LockSpec> {
  const books = targets.map((t) => t.targetBookId);
  const accounts = ids(targets.map((t) => t.targetAccountId));
  const categories = ids(targets.map((t) => t.targetCategoryId));
  for (const id of accounts) books.push((await ctx.accounts.findById(id))?.bookId);
  for (const id of categories) books.push((await ctx.categories.findById(id))?.bookId);
  return {
    books: ids(books),
    accounts,
    categories,
    merchants: ids(targets.map((t) => t.targetMerchantId)),
  };
}

async function validateTargets(
  target: Targets,
  locks: LockSpec,
  ctx: MasterDataTransactionContextT04,
) {
  const currentLocks = await discover([target], ctx);
  for (const kind of ['books', 'accounts', 'categories', 'merchants'] as const) {
    if (currentLocks[kind]?.some((id) => !locks[kind]?.includes(id)))
      throw new ConfigurationLockSetChangedError();
  }
  if ((currentLocks.books?.length ?? 0) > 1)
    throw new MasterDataError(
      'Rule targets must belong to the same Book',
      'RULE_TARGET_CONTEXT_MISMATCH',
    );
  for (const id of currentLocks.books ?? []) {
    const book = await ctx.books.findById(id);
    if (!book) throw new MasterDataError('Target Book not found', 'BOOK_NOT_FOUND');
    if (!book.active) throw new MasterDataError('Target Book must be active', 'BOOK_INACTIVE');
  }
  if (target.targetAccountId) {
    const account = await ctx.accounts.findById(target.targetAccountId);
    if (!account) throw new MasterDataError('Target Account not found', 'ACCOUNT_NOT_FOUND');
    if (!account.active)
      throw new MasterDataError('Target Account must be active', 'ACCOUNT_INACTIVE');
  }
  if (target.targetCategoryId) {
    const category = await ctx.categories.findById(target.targetCategoryId);
    if (!category) throw new MasterDataError('Target Category not found', 'CATEGORY_NOT_FOUND');
    if (!category.active)
      throw new MasterDataError('Target Category must be active', 'CATEGORY_INACTIVE');
  }
  if (target.targetMerchantId) {
    const merchant = await ctx.merchants.findById(target.targetMerchantId);
    if (!merchant) throw new MasterDataError('Target Merchant not found', 'MERCHANT_NOT_FOUND');
    if (!merchant.active)
      throw new MasterDataError('Target Merchant must be active', 'MERCHANT_INACTIVE');
  }
}

export async function createClassificationRule(
  input: CreateClassificationRuleInput,
  ctx: MasterDataTransactionContextT04,
  now: Date,
): Promise<ClassificationRuleRecord> {
  validatePriority(input.priority);
  validateMatchType(input.matchType);
  validateAtLeastOneTarget(input);
  validateNonBlankName(input.pattern);
  const locks = await discover([input], ctx);
  await ctx.locks.acquireLocks(locks);
  await validateTargets(input, locks, ctx);
  const record: ClassificationRuleRecord = {
    id: uuidv7(),
    priority: input.priority,
    active: true,
    matchType: input.matchType as 'exact' | 'contains',
    pattern: input.pattern,
    normalizedPattern: normalizePattern(input.pattern),
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
  const discovered = await ctx.classificationRules.findById(input.id);
  if (!discovered) throw new MasterDataError('Classification Rule not found', 'RULE_NOT_FOUND');
  const locks = await discover([discovered, input], ctx);
  await ctx.locks.acquireLocks({ ...locks, classificationRules: [input.id] });
  const current = await ctx.classificationRules.findById(input.id);
  if (!current) throw new MasterDataError('Classification Rule not found', 'RULE_NOT_FOUND');
  // Include the locked old references even if this PATCH removes them.
  const currentLocks = await discover([current], ctx);
  for (const kind of ['books', 'accounts', 'categories', 'merchants'] as const) {
    if (currentLocks[kind]?.some((id) => !locks[kind]?.includes(id)))
      throw new ConfigurationLockSetChangedError();
  }
  const effective = {
    ...current,
    priority: input.priority ?? current.priority,
    matchType: input.matchType ?? current.matchType,
    pattern: input.pattern ?? current.pattern,
    active: input.active ?? current.active,
    targetBookId: input.targetBookId === undefined ? current.targetBookId : input.targetBookId,
    targetAccountId:
      input.targetAccountId === undefined ? current.targetAccountId : input.targetAccountId,
    targetCategoryId:
      input.targetCategoryId === undefined ? current.targetCategoryId : input.targetCategoryId,
    targetMerchantId:
      input.targetMerchantId === undefined ? current.targetMerchantId : input.targetMerchantId,
  };
  validatePriority(effective.priority);
  validateMatchType(effective.matchType);
  validateNonBlankName(effective.pattern);
  validateAtLeastOneTarget(effective);
  await validateTargets(effective, locks, ctx);
  return ctx.classificationRules.update({
    ...effective,
    normalizedPattern: normalizePattern(effective.pattern),
    updatedAt: now,
  });
}
