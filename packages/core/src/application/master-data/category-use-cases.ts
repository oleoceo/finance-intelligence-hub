/**
 * Category configuration use cases (M03-T03).
 *
 * Implements CreateCategory, GetCategory, ListCategories, UpdateCategory, ArchiveCategory.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */

import { v7 as uuidv7 } from 'uuid';
import { normalizeName, validateNonBlankName } from '../../domain/master-data/normalization.js';
import { archiveEntity } from '../../domain/master-data/lifecycle.js';
import {
  CategoryCycleDetector,
  CategoryCycleError,
} from '../../domain/master-data/category-cycle-detector.js';
import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
import { ValidationError } from '../../domain/master-data/errors.js';
import type { MasterDataTransactionContext, CategoryRecord } from '../ports/master-data-ports.js';

const VALID_CATEGORY_TYPES = ['expense', 'income', 'both'] as const;

function validateCategoryType(type: string): void {
  if (!VALID_CATEGORY_TYPES.includes(type as (typeof VALID_CATEGORY_TYPES)[number])) {
    throw new ValidationError(
      `Category type must be one of: ${VALID_CATEGORY_TYPES.join(', ')}`,
      'type',
    );
  }
}

export interface CreateCategoryInput {
  bookId: string;
  name: string;
  type?: string; // defaults to 'both'
  parentCategoryId?: string | null;
}

export async function createCategory(
  input: CreateCategoryInput,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<CategoryRecord> {
  // Validate type (defaults to 'both')
  const type = input.type ?? 'both';
  validateCategoryType(type);

  // Validate name
  const trimmedRaw = validateNonBlankName(input.name);
  const normalizedName = normalizeName(input.name);

  const bookId = input.bookId;
  const parentCategoryId = input.parentCategoryId ?? null;

  const discoveredParent = parentCategoryId
    ? await ctx.categories.findById(parentCategoryId)
    : null;
  const bookIds = [
    ...new Set([bookId, ...(discoveredParent ? [discoveredParent.bookId] : [])]),
  ].sort();
  await ctx.locks.acquireLocks({ books: bookIds });
  if (parentCategoryId !== null) {
    const parent = await ctx.categories.findById(parentCategoryId);
    if (parent && !bookIds.includes(parent.bookId)) throw new ConfigurationLockSetChangedError();
    await ctx.locks.acquireLocks({ categories: [parentCategoryId] });
  }

  // Re-read Book state after lock
  const book = await ctx.books.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  if (!book.active) {
    throw new ValidationError('Cannot create Category for inactive Book', 'bookId');
  }

  // If parent specified, validate it
  if (parentCategoryId !== null) {
    const parent = await ctx.categories.findById(parentCategoryId);
    if (!parent) {
      throw new ValidationError('Parent Category not found', 'parentCategoryId');
    }

    if (!bookIds.includes(parent.bookId)) throw new ConfigurationLockSetChangedError();
    if (parent.bookId !== bookId) {
      throw new ValidationError('Parent Category must belong to the same Book', 'parentCategoryId');
    }

    if (!parent.active) {
      throw new ValidationError('Parent Category must be active', 'parentCategoryId');
    }
  }

  // Generate UUIDv7
  const id = uuidv7();

  const record: CategoryRecord = {
    id,
    bookId,
    name: trimmedRaw,
    normalizedName,
    parentCategoryId,
    type,
    active: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.categories.create(record);
  return record;
}

export async function getCategory(
  id: string,
  ctx: MasterDataTransactionContext,
): Promise<CategoryRecord | null> {
  return ctx.categories.findById(id);
}

export async function listCategories(
  ctx: MasterDataTransactionContext,
  bookId?: string,
): Promise<CategoryRecord[]> {
  if (bookId !== undefined) {
    return ctx.categories.findByBookId(bookId);
  }
  return ctx.categories.find();
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  type?: string;
  parentCategoryId?: string | null; // null means detach to root, undefined means no change
  active?: boolean; // lifecycle changes
}

export async function updateCategory(
  input: UpdateCategoryInput,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<CategoryRecord> {
  // First get category to determine which Book to lock
  const existing = await ctx.categories.findById(input.id);
  if (!existing) {
    throw new Error('Category not found');
  }

  const bookId = existing.bookId;
  const hasParentChange = input.parentCategoryId !== undefined;

  // Determine which categories need locking
  const categoryIds: string[] = [input.id];

  if (hasParentChange && input.parentCategoryId !== null && input.parentCategoryId !== undefined) {
    // Will lock the new parent
    categoryIds.push(input.parentCategoryId);
  }

  const discoveredParent = input.parentCategoryId
    ? await ctx.categories.findById(input.parentCategoryId)
    : null;
  const bookIds = [
    ...new Set([bookId, ...(discoveredParent ? [discoveredParent.bookId] : [])]),
  ].sort();
  await ctx.locks.acquireLocks({ books: bookIds });
  const lockedCurrent = await ctx.categories.findById(input.id);
  const lockedParent = input.parentCategoryId
    ? await ctx.categories.findById(input.parentCategoryId)
    : null;
  if (
    (lockedCurrent && lockedCurrent.bookId !== bookId) ||
    (lockedParent && !bookIds.includes(lockedParent.bookId))
  )
    throw new ConfigurationLockSetChangedError();
  await ctx.locks.acquireLocks({ categories: [...new Set(categoryIds)].sort() });
  const current = await ctx.categories.findById(input.id);
  if (!current) throw new Error('Category not found');
  if (current.bookId !== bookId) throw new ConfigurationLockSetChangedError();

  let newName = current.name;
  let newNormalizedName = current.normalizedName;
  let newType = current.type;
  let newParentCategoryId = current.parentCategoryId;

  // Handle name update
  if (input.name !== undefined) {
    validateNonBlankName(input.name);
    newName = validateNonBlankName(input.name);
    newNormalizedName = normalizeName(input.name);
  }

  // Handle type update
  if (input.type !== undefined) {
    validateCategoryType(input.type);
    newType = input.type;
  }

  // Handle parent change (including explicit null detachment)
  if (hasParentChange && input.parentCategoryId !== current.parentCategoryId) {
    const book = await ctx.books.findById(bookId);
    if (!book || !book.active)
      throw new ValidationError('Cannot reparent Category in inactive Book', 'bookId');
    const proposedParentId = input.parentCategoryId!; // explicitly provided, could be null

    // Self-parent check
    if (proposedParentId !== null && proposedParentId === input.id) {
      throw new ValidationError('Category cannot be its own parent', 'parentCategoryId');
    }

    if (proposedParentId !== null) {
      const parent = await ctx.categories.findById(proposedParentId);
      if (!parent) {
        throw new ValidationError('Parent Category not found', 'parentCategoryId');
      }

      if (!bookIds.includes(parent.bookId)) throw new ConfigurationLockSetChangedError();
      if (parent.bookId !== current.bookId) {
        throw new ValidationError(
          'Parent Category must belong to the same Book',
          'parentCategoryId',
        );
      }

      if (!parent.active) {
        throw new ValidationError('Parent Category must be active', 'parentCategoryId');
      }

      if (
        await new CategoryCycleDetector().wouldCreateCycle(
          input.id,
          proposedParentId,
          async (id) => {
            const ancestor = await ctx.categories.findById(id);
            if (!ancestor)
              throw new ValidationError('Parent Category not found', 'parentCategoryId');
            if (ancestor.bookId !== bookId)
              throw new ValidationError(
                'Parent Category must belong to the same Book',
                'parentCategoryId',
              );
            return ancestor;
          },
        )
      ) {
        throw new CategoryCycleError();
      }
    }

    newParentCategoryId = proposedParentId;
  }

  const lifecycle =
    input.active === false
      ? archiveEntity(current, now)
      : input.active === true
        ? { active: true, archivedAt: null }
        : { active: current.active, archivedAt: current.archivedAt };

  const updated = await ctx.categories.update({
    id: input.id,
    name: newName,
    normalizedName: newNormalizedName,
    type: newType,
    parentCategoryId: newParentCategoryId,
    ...lifecycle,
    updatedAt: now,
  });

  return updated;
}

export async function archiveCategory(
  id: string,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<CategoryRecord> {
  // First get category to determine which Book to lock
  const existing = await ctx.categories.findById(id);
  if (!existing) {
    throw new Error('Category not found');
  }

  // Lock Book first, then Category (deterministic order)
  await ctx.locks.acquireLocks({ books: [existing.bookId], categories: [id] });

  // Re-read category after lock
  const current = await ctx.categories.findById(id);
  if (!current) {
    throw new Error('Category not found');
  }

  const lifecycleState = archiveEntity(
    { active: current.active, archivedAt: current.archivedAt },
    now,
  );

  const archived = await ctx.categories.archive({
    id,
    active: lifecycleState.active,
    archivedAt: lifecycleState.archivedAt,
    updatedAt: now,
  });

  return archived;
}

export async function reactivateCategory(
  id: string,
  ctx: MasterDataTransactionContext,
  now: Date,
): Promise<CategoryRecord> {
  // First get category to determine which Book to lock
  const existing = await ctx.categories.findById(id);
  if (!existing) {
    throw new Error('Category not found');
  }

  // Lock Book first, then Category
  await ctx.locks.acquireLocks({ books: [existing.bookId], categories: [id] });

  // Re-read after lock
  const current = await ctx.categories.findById(id);
  if (!current) {
    throw new Error('Category not found');
  }

  const archived = await ctx.categories.archive({
    id,
    active: true,
    archivedAt: null,
    updatedAt: now,
  });

  return archived;
}
