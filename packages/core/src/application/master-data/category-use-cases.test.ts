import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
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

describe('Category review regressions', () => {
  function fixture() {
    const ctx = createMockContext();
    const now = new Date('2026-01-01');
    const category = (id: string, parentCategoryId: string | null = null) => ({
      id,
      bookId: 'book-1',
      name: id,
      normalizedName: id,
      parentCategoryId,
      type: 'both',
      active: true,
      archivedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    });
    const rows = new Map(['a', 'b', 'c'].map((id) => [id, category(id)]));
    vi.mocked(ctx.categories.findById).mockImplementation(async (id) => rows.get(id) ?? null);
    vi.mocked(ctx.categories.update).mockImplementation(async (patch) => {
      const row = { ...rows.get(patch.id)!, ...patch };
      rows.set(row.id, row);
      return row;
    });
    return { ctx, rows, now };
  }
  it('reparents in active Book and applies archive, name and type together', async () => {
    const { ctx, rows, now } = fixture();
    const result = await updateCategory(
      { id: 'a', parentCategoryId: 'b', name: ' NEW  Name ', type: 'expense', active: false },
      ctx,
      now,
    );
    expect(result).toMatchObject({
      parentCategoryId: 'b',
      name: 'NEW  Name',
      normalizedName: 'new name',
      type: 'expense',
      active: false,
      archivedAt: now,
    });
    expect(rows.get('a')).toEqual(result);
    expect(ctx.categories.update).toHaveBeenCalledTimes(1);
    expect(ctx.categories.archive).not.toHaveBeenCalled();
  });
  it('rejects inactive Book after lock without any mutation', async () => {
    const { ctx, rows, now } = fixture();
    const before = { ...rows.get('a')! };
    const book = (await ctx.books.findById('book-1'))!;
    vi.mocked(ctx.locks.acquireLocks).mockImplementation(async () => {
      book.active = false;
    });
    await expect(
      updateCategory({ id: 'a', parentCategoryId: 'b', name: 'changed', active: false }, ctx, now),
    ).rejects.toMatchObject({ field: 'bookId' });
    expect(rows.get('a')).toEqual(before);
    expect(ctx.categories.update).not.toHaveBeenCalled();
    expect(ctx.categories.archive).not.toHaveBeenCalled();
  });
  it('allows ordinary name/type updates in inactive Book', async () => {
    const { ctx, now } = fixture();
    (await ctx.books.findById('book-1'))!.active = false;
    expect(
      await updateCategory({ id: 'a', name: 'changed', type: 'income' }, ctx, now),
    ).toMatchObject({ name: 'changed', type: 'income' });
  });
  it('preserves repeated archive timestamp and applies reactivation fields', async () => {
    const { ctx, now } = fixture();
    await updateCategory({ id: 'a', active: false }, ctx, now);
    expect(
      await updateCategory({ id: 'a', active: false, name: 'again' }, ctx, new Date('2026-02-01')),
    ).toMatchObject({ name: 'again', archivedAt: now });
    expect(
      await updateCategory({ id: 'a', active: true, name: 'back', type: 'income' }, ctx, now),
    ).toMatchObject({ name: 'back', type: 'income', active: true, archivedAt: null });
  });
  it('fails safely on pre-existing cyclic ancestry without mutation', async () => {
    const { ctx, rows, now } = fixture();
    rows.get('b')!.parentCategoryId = 'c';
    rows.get('c')!.parentCategoryId = 'b';
    await expect(
      updateCategory({ id: 'a', parentCategoryId: 'b' }, ctx, now),
    ).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' });
    expect(ctx.categories.update).not.toHaveBeenCalled();
    expect(rows.get('a')!.parentCategoryId).toBeNull();
  });
  it.each(['missing', 'cross-book'])('rejects %s ancestry without mutation', async (reason) => {
    const { ctx, rows, now } = fixture();
    rows.get('b')!.parentCategoryId = 'c';
    if (reason === 'missing') rows.delete('c');
    else rows.get('c')!.bookId = 'other';
    await expect(
      updateCategory({ id: 'a', parentCategoryId: 'b' }, ctx, now),
    ).rejects.toMatchObject({ field: 'parentCategoryId', code: 'VALIDATION_ERROR' });
    expect(ctx.categories.update).not.toHaveBeenCalled();
  });
  it.each(['create', 'update'])(
    'locks all discovered Books before Categories for cross-Book %s',
    async (operation) => {
      const { ctx, rows, now } = fixture();
      rows.get('b')!.bookId = 'book-0';
      await expect(
        operation === 'create'
          ? createCategory({ bookId: 'book-1', name: 'new', parentCategoryId: 'b' }, ctx, now)
          : updateCategory({ id: 'a', parentCategoryId: 'b' }, ctx, now),
      ).rejects.toMatchObject({ field: 'parentCategoryId' });
      expect(vi.mocked(ctx.locks.acquireLocks).mock.calls[0][0]).toEqual({
        books: ['book-0', 'book-1'],
      });
      expect(vi.mocked(ctx.locks.acquireLocks).mock.calls[1][0]).toEqual({
        categories: operation === 'create' ? ['b'] : ['a', 'b'],
      });
    },
  );
  it.each(['create', 'update'])(
    'requests transaction restart when %s discovery changes while waiting',
    async (operation) => {
      const { ctx, rows, now } = fixture();
      vi.mocked(ctx.locks.acquireLocks).mockImplementation(async () => {
        rows.get('b')!.bookId = 'new-book';
      });
      await expect(
        operation === 'create'
          ? createCategory({ bookId: 'book-1', name: 'new', parentCategoryId: 'b' }, ctx, now)
          : updateCategory({ id: 'a', parentCategoryId: 'b' }, ctx, now),
      ).rejects.toBeInstanceOf(ConfigurationLockSetChangedError);
      expect(ctx.locks.acquireLocks).toHaveBeenCalledTimes(1);
      expect(ctx.categories.update).not.toHaveBeenCalled();
      expect(ctx.categories.create).not.toHaveBeenCalled();
    },
  );
});
