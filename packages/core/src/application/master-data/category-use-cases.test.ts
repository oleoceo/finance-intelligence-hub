/**
 * Core unit tests for Category configuration (M03-T03).
 *
 * Tests:
 * - Normalization, type vocabulary
 * - Create root/child categories
 * - Same-Book parent succeeds, cross-Book rejected
 * - Self-parent and multi-level ancestor cycle
 * - Valid reparent and detach to null
 * - Archive/reactivate semantics
 * - Lifecycle and immutability
 */

import { describe, it, expect, vi, type MockedObject } from 'vitest';
import {
  createCategory,
  updateCategory,
  archiveCategory,
  getCategory,
  listCategories,
} from './category-use-cases.js';
import { ValidationError } from '../../domain/master-data/errors.js';
import type {
  MasterDataTransactionContext,
  BookRepository,
  CategoryRepository,
} from '../ports/master-data-ports.js';

type MockBookRepo = MockedObject<BookRepository>;
type MockCategoryRepo = MockedObject<CategoryRepository>;

function createMockContext(
  overrides?: Partial<MasterDataTransactionContext>,
): MasterDataTransactionContext {
  const defaultBook = {
    id: 'book-1',
    name: 'Book',
    normalizedName: 'book',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    active: true,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBooks = {
    findById: vi.fn(async (id: string) => (id === 'book-1' ? defaultBook : null)),
    findByName: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  } as unknown as MockBookRepo;

  const mockCategories = {
    findById: vi.fn(),
    findByBookId: vi.fn(),
    find: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  } as unknown as MockCategoryRepo;

  const mockLocks = {
    acquireLocks: vi.fn(),
  };

  const base: MasterDataTransactionContext = {
    books: mockBooks as unknown as BookRepository,
    accounts: {
      findById: vi.fn(),
      findByBookId: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    } as never,
    categories: mockCategories as unknown as CategoryRepository,
    merchants: {
      findById: vi.fn(),
      findByNormalizedName: vi.fn(),
      find: vi.fn(),
      findByIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    } as never,
    locks: mockLocks as never,
    financialUsage: {
      hasBookUsage: vi.fn(),
      hasAccountUsage: vi.fn(),
    } as never,
    senderDefaults: {
      hasBookDefault: vi.fn(),
      hasAccountDefault: vi.fn(),
    } as never,
  };

  return { ...base, ...overrides } as MasterDataTransactionContext;
}

describe('Category Use Cases - Unit', () => {
  describe('createCategory', () => {
    it('should create a root category', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createCategory({ bookId: 'book-1', name: 'Root Category' }, ctx, now);

      expect(result.name).toBe('Root Category');
      expect(result.normalizedName).toBe('root category');
      expect(result.parentCategoryId).toBeNull();
      expect(result.bookId).toBe('book-1');
      expect(result.type).toBe('both');
      expect(result.active).toBe(true);
    });

    it('should create a child category with valid parent', async () => {
      const parentId = 'parent-1';
      const parentCategory = {
        id: parentId,
        bookId: 'book-1',
        name: 'Parent',
        normalizedName: 'parent',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => (id === parentId ? parentCategory : null)),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const now = new Date();
      const result = await createCategory(
        { bookId: 'book-1', name: 'Child', parentCategoryId: parentId },
        ctx,
        now,
      );

      expect(result.parentCategoryId).toBe(parentId);
    });

    it('should create category with explicit type', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createCategory(
        { bookId: 'book-1', name: 'Expense Only', type: 'expense' },
        ctx,
        now,
      );
      expect(result.type).toBe('expense');
    });

    it('should reject invalid category type', async () => {
      const ctx = createMockContext();

      await expect(
        createCategory({ bookId: 'book-1', name: 'Bad Type', type: 'invalid' }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should normalize name deterministically', async () => {
      const ctx = createMockContext();
      const now = new Date();

      const result = await createCategory({ bookId: 'book-1', name: ' My Category ' }, ctx, now);
      expect(result.normalizedName).toBe('my category');
      expect(result.name).toBe('My Category');
    });

    it('should reject creation for inactive Book', async () => {
      const ctx = createMockContext({
        books: {
          findById: vi.fn(async () => ({
            id: 'book-1',
            name: 'Inactive',
            normalizedName: 'inactive',
            currency: 'BRL',
            timezone: 'America/Sao_Paulo',
            active: false,
            archivedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
          findByName: vi.fn(),
          find: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        createCategory({ bookId: 'book-1', name: 'Child' }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should reject cross-Book parent', async () => {
      const otherParentId = 'other-parent-1';
      const otherParent = {
        id: otherParentId,
        bookId: 'book-2',
        name: 'Other Book Parent',
        normalizedName: 'other book parent',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => (id === otherParentId ? otherParent : null)),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        createCategory(
          { bookId: 'book-1', name: 'Cross Book Child', parentCategoryId: otherParentId },
          ctx,
          new Date(),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should reject inactive parent', async () => {
      const inactiveParentId = 'inactive-parent-1';
      const inactiveParent = {
        id: inactiveParentId,
        bookId: 'book-1',
        name: 'Inactive Parent',
        normalizedName: 'inactive parent',
        parentCategoryId: null,
        type: 'both',
        active: false,
        archivedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => (id === inactiveParentId ? inactiveParent : null)),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        createCategory(
          { bookId: 'book-1', name: 'Child', parentCategoryId: inactiveParentId },
          ctx,
          new Date(),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should reject missing parent', async () => {
      const ctx = createMockContext();

      await expect(
        createCategory(
          { bookId: 'book-1', name: 'Child', parentCategoryId: 'non-existent' },
          ctx,
          new Date(),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('updateCategory', () => {
    it('should reject self-parent', async () => {
      const catId = 'cat-self';
      const existing = {
        id: catId,
        bookId: 'book-1',
        name: 'Self',
        normalizedName: 'self',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async () => existing),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        updateCategory({ id: catId, parentCategoryId: catId }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should reject multi-level ancestor cycle (A -> B -> C -> A)', async () => {
      const catA = 'cat-a';
      const catB = 'cat-b';
      const catC = 'cat-c';

      const categories = new Map<string, Record<string, unknown>>([
        [
          catA,
          {
            id: catA,
            bookId: 'book-1',
            name: 'A',
            normalizedName: 'a',
            parentCategoryId: null,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          catB,
          {
            id: catB,
            bookId: 'book-1',
            name: 'B',
            normalizedName: 'b',
            parentCategoryId: catA,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          catC,
          {
            id: catC,
            bookId: 'book-1',
            name: 'C',
            normalizedName: 'c',
            parentCategoryId: catB,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => categories.get(id) ?? null),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        updateCategory({ id: catA, parentCategoryId: catC }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should reject 2-level cycle (A -> B, try B -> A successor)', async () => {
      const catA = 'cat-a-2';
      const catB = 'cat-b-2';

      const categories = new Map<string, Record<string, unknown>>([
        [
          catA,
          {
            id: catA,
            bookId: 'book-1',
            name: 'A',
            normalizedName: 'a',
            parentCategoryId: null,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          catB,
          {
            id: catB,
            bookId: 'book-1',
            name: 'B',
            normalizedName: 'b',
            parentCategoryId: catA,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => categories.get(id) ?? null),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        updateCategory({ id: catA, parentCategoryId: catB }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('should allow valid reparent', async () => {
      const catA = 'cat-a-valid';
      const catB = 'cat-b-valid';
      const catC = 'cat-c-valid';

      const categories = new Map<string, Record<string, unknown>>([
        [
          catA,
          {
            id: catA,
            bookId: 'book-1',
            name: 'A',
            normalizedName: 'a',
            parentCategoryId: null,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          catB,
          {
            id: catB,
            bookId: 'book-1',
            name: 'B',
            normalizedName: 'b',
            parentCategoryId: catA,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          catC,
          {
            id: catC,
            bookId: 'book-1',
            name: 'C',
            normalizedName: 'c',
            parentCategoryId: null,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => categories.get(id) ?? null),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(
            async (input: {
              id: string;
              name?: string;
              normalizedName?: string;
              parentCategoryId?: string | null;
              type?: string;
              updatedAt: Date;
            }) => ({
              id: catB,
              name: input.name ?? 'B',
              normalizedName: input.normalizedName ?? 'b',
              bookId: 'book-1',
              parentCategoryId: input.parentCategoryId ?? catA,
              type: input.type ?? 'both',
              active: true,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
          archive: vi.fn(),
        } as never,
      });

      // Move B from A to C - no cycle
      const result = await updateCategory({ id: catB, parentCategoryId: catC }, ctx, new Date());
      expect(result.parentCategoryId).toBe(catC);
    });

    it('should allow explicit detach to null', async () => {
      const catId = 'cat-detach';
      const parentId = 'parent-detach';

      const categories = new Map<string, Record<string, unknown>>([
        [
          catId,
          {
            id: catId,
            bookId: 'book-1',
            name: 'Child',
            normalizedName: 'child',
            parentCategoryId: parentId,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          parentId,
          {
            id: parentId,
            bookId: 'book-1',
            name: 'Parent',
            normalizedName: 'parent',
            parentCategoryId: null,
            type: 'both',
            active: true,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async (id: string) => categories.get(id) ?? null),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(
            async (input: {
              id: string;
              name?: string;
              normalizedName?: string;
              parentCategoryId?: string | null;
              type?: string;
              updatedAt: Date;
            }) => ({
              id: catId,
              name: input.name ?? 'Child',
              normalizedName: input.normalizedName ?? 'child',
              bookId: 'book-1',
              parentCategoryId: input.parentCategoryId ?? null,
              type: input.type ?? 'both',
              active: true,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
          archive: vi.fn(),
        } as never,
      });

      const result = await updateCategory({ id: catId, parentCategoryId: null }, ctx, new Date());
      expect(result.parentCategoryId).toBeNull();
    });

    it('should allow name update', async () => {
      const catId = 'cat-name-update';
      const existing = {
        id: catId,
        bookId: 'book-1',
        name: 'Old Name',
        normalizedName: 'old name',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async () => existing),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(
            async (input: {
              id: string;
              name?: string;
              normalizedName?: string;
              parentCategoryId?: string | null;
              type?: string;
              updatedAt: Date;
            }) => ({
              id: catId,
              name: input.name ?? 'Old Name',
              normalizedName: input.normalizedName ?? 'old name',
              bookId: 'book-1',
              parentCategoryId: input.parentCategoryId ?? null,
              type: input.type ?? 'both',
              active: true,
              archivedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          ),
          archive: vi.fn(),
        } as never,
      });

      const result = await updateCategory({ id: catId, name: 'New Name' }, ctx, new Date());
      expect(result.name).toBe('New Name');
      expect(result.normalizedName).toBe('new name');
    });

    it('should reject type change to invalid type', async () => {
      const catId = 'cat-type-bad';
      const existing = {
        id: catId,
        bookId: 'book-1',
        name: 'Cat',
        normalizedName: 'cat',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async () => existing),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      await expect(
        updateCategory({ id: catId, type: 'invalid' }, ctx, new Date()),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('archiveCategory', () => {
    it('should archive an active category', async () => {
      const catId = 'cat-archive-1';
      const existing = {
        id: catId,
        bookId: 'book-1',
        name: 'Archivable',
        normalizedName: 'archivable',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const now = new Date();

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async () => existing),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(
            async (input: {
              id: string;
              active: boolean;
              archivedAt: Date | null;
              updatedAt: Date;
            }) => ({
              ...existing,
              active: input.active,
              archivedAt: input.archivedAt,
              updatedAt: input.updatedAt,
            }),
          ),
        } as never,
      });

      const result = await archiveCategory(catId, ctx, now);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(now);
    });
  });

  describe('getCategory and listCategories', () => {
    it('should get category by id', async () => {
      const catId = 'cat-get-1';
      const category = {
        id: catId,
        bookId: 'book-1',
        name: 'Get Me',
        normalizedName: 'get me',
        parentCategoryId: null,
        type: 'both',
        active: true,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(async () => category),
          findByBookId: vi.fn(),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await getCategory(catId, ctx);
      expect(result?.id).toBe(catId);
    });

    it('should list categories', async () => {
      const categories = [
        {
          id: 'c1',
          bookId: 'book-1',
          name: 'A',
          normalizedName: 'a',
          parentCategoryId: null,
          type: 'both',
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'c2',
          bookId: 'book-1',
          name: 'B',
          normalizedName: 'b',
          parentCategoryId: null,
          type: 'both',
          active: true,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const ctx = createMockContext({
        categories: {
          findById: vi.fn(),
          findByBookId: vi.fn(async () => categories),
          find: vi.fn(async () => categories),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await listCategories(ctx);
      expect(result).toHaveLength(2);
    });

    it('should list categories by bookId', async () => {
      const ctx = createMockContext({
        categories: {
          findById: vi.fn(),
          findByBookId: vi.fn(async (bookId: string) =>
            bookId === 'book-1'
              ? [
                  {
                    id: 'c1',
                    bookId: 'book-1',
                    name: 'A',
                    normalizedName: 'a',
                    parentCategoryId: null,
                    type: 'both',
                    active: true,
                    archivedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]
              : [],
          ),
          find: vi.fn(),
          findByIds: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          archive: vi.fn(),
        } as never,
      });

      const result = await listCategories(ctx, 'book-1');
      expect(result).toHaveLength(1);
    });
  });
});
