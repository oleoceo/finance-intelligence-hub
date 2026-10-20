/**
 * Category configuration use cases (M03-T03).
 *
 * Implements CreateCategory, GetCategory, ListCategories, UpdateCategory, ArchiveCategory.
 * Core logic only; no Database/Kysely/pg/Fastify imports.
 */

import { v7 as uuidv7 } from 'uuid';
import { normalizeName, validateNonBlankName } from '../../domain/master-data/normalization.js';
import { archiveEntity } from '../../domain/master-data/lifecycle.js';
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

  // Lock Book first (per-Book hierarchy mutex) before any validation
  await ctx.locks.acquireLocks({ books: [bookId] });

  // If parent specified, also lock the parent category after Book lock
  // Following lock order: Books -> Categories
  if (parentCategoryId !== null) {
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

  // Lock Book first (per-Book hierarchy mutex), then affected Categories in UUID order
  await ctx.locks.acquireLocks({ books: [bookId] });

  // Lock affected categories
  const sortedCategoryIds = [...new Set(categoryIds)].sort();
  await ctx.locks.acquireLocks({ categories: sortedCategoryIds });

  // Re-read category after lock
  const current = await ctx.categories.findById(input.id);
  if (!current) {
    throw new Error('Category not found');
  }

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
  if (hasParentChange) {
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

      if (parent.bookId !== current.bookId) {
        throw new ValidationError('Parent Category must belong to the same Book', 'parentCategoryId');
      }

      if (!parent.active) {
        throw new ValidationError('Parent Category must be active', 'parentCategoryId');
      }

      // Ancestor cycle detection: walk parent's ancestor chain
      const visited = new Set<string>();
      let ancestorId: string | null = proposedParentId;

      while (ancestorId !== null) {
        if (ancestorId === input.id) {
          throw new ValidationError('Category cycle detected', 'parentCategoryId');
        }

        if (visited.has(ancestorId)) {
          // Corrupt data - stop traversal
          break;
        }

        visited.add(ancestorId);

        const ancestor = await ctx.categories.findById(ancestorId);
        if (!ancestor) {
          break;
        }

        ancestorId = ancestor.parentCategoryId;
      }
    }

    newParentCategoryId = proposedParentId;
  }

  // Handle lifecycle changes through update (active field)
  // If active is being set, validate against lifecycle
  if (input.active !== undefined) {
    if (input.active === false && current.active === true) {
      // Archive through update - use archive logic
      const lifecycleState = archiveEntity(
        { active: current.active, archivedAt: current.archivedAt },
        now,
      );
      // This will be handled as an archive operation
      const archived = await ctx.categories.archive({
        id: input.id,
        active: lifecycleState.active,
        archivedAt: lifecycleState.archivedAt,
        updatedAt: now,
      });
      return archived;
    }
    if (input.active === true && current.active === false) {
      // Reactivation through update
      await ctx.categories.update({
        id: input.id,
        normalizedName: newNormalizedName,
        name: newName,
        type: newType,
        parentCategoryId: newParentCategoryId,
        updatedAt: now,
      });
      // Now need to reactivate: set active=true, archivedAt=null
      const reactivatedRecord = await ctx.categories.archive({
        id: input.id,
        active: true,
        archivedAt: null,
        updatedAt: now,
      });
      return reactivatedRecord;
    }
  }

  const updated = await ctx.categories.update({
    id: input.id,
    name: newName,
    normalizedName: newNormalizedName,
    type: newType,
    parentCategoryId: newParentCategoryId,
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