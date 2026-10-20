/**
 * Unit tests for Book configuration use cases (M03-T02).
 *
 * Tests normalization, validation, immutability guards, and lifecycle behavior.
 * Uses fake repository implementations to isolate Core logic from Database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import {
  createBook,
  getBook,
  listBooks,
  updateBook,
  archiveBook,
  type CreateBookInput,
  type UpdateBookInput,
} from './book-use-cases.js';
import type {
  BookRepository,
  AccountRepository,
  FinancialUsageReader,
  SenderDefaultReferenceReader,
  ConfigurationLockPort,
  TransactionContext,
  BookRecord,
  AccountRecord,
} from '../../application/ports/master-data-ports.js';

// Fake in-memory BookRepository for unit testing
class FakeBookRepository implements BookRepository {
  private books: Map<string, BookRecord> = new Map();

  async findById(id: string): Promise<BookRecord | null> {
    return this.books.get(id) ?? null;
  }

  async findByName(normalizedName: string): Promise<BookRecord | null> {
    for (const book of this.books.values()) {
      if (book.normalizedName === normalizedName) {
        return book;
      }
    }
    return null;
  }

  async find(): Promise<BookRecord[]> {
    return Array.from(this.books.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async create(input: {
    id: string;
    name: string;
    normalizedName: string;
    currency: string;
    timezone: string;
    active: boolean;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<void> {
    this.books.set(input.id, {
      id: input.id,
      name: input.name,
      normalizedName: input.normalizedName,
      currency: input.currency,
      timezone: input.timezone,
      active: input.active,
      archivedAt: input.archivedAt,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
  }

  async update(input: {
    id: string;
    name: string;
    normalizedName: string;
    currency: string;
    timezone: string;
    updatedAt: Date;
  }): Promise<BookRecord> {
    const existing = this.books.get(input.id);
    if (!existing) {
      throw new Error('Book not found');
    }
    const updated: BookRecord = {
      ...existing,
      name: input.name,
      normalizedName: input.normalizedName,
      currency: input.currency,
      timezone: input.timezone,
      updatedAt: input.updatedAt,
    };
    this.books.set(input.id, updated);
    return updated;
  }

  async archive(input: {
    id: string;
    active: boolean;
    archivedAt: Date | null;
    updatedAt: Date;
  }): Promise<BookRecord> {
    const existing = this.books.get(input.id);
    if (!existing) {
      throw new Error('Book not found');
    }
    const archived: BookRecord = {
      ...existing,
      active: input.active,
      archivedAt: input.archivedAt,
      updatedAt: input.updatedAt,
    };
    this.books.set(input.id, archived);
    return archived;
  }
}

// Fake AccountRepository
class FakeAccountRepository implements AccountRepository {
  private accounts: Array<{ id: string; bookId: string }> = [];

  async findById(_id: string): Promise<AccountRecord | null> {
    return null;
  }

  async findByBookId(bookId: string): Promise<AccountRecord[]> {
    return this.accounts.filter((a) => a.bookId === bookId) as AccountRecord[];
  }

  async find(): Promise<AccountRecord[]> {
    return this.accounts as AccountRecord[];
  }

  async addAccount(id: string, bookId: string): Promise<void> {
    this.accounts.push({ id, bookId } as unknown as AccountRecord);
  }

  async create(_input: unknown): Promise<void> {}
  async update(_input: unknown): Promise<AccountRecord> {
    throw new Error('Not implemented');
  }
  async archive(_input: unknown): Promise<AccountRecord> {
    throw new Error('Not implemented');
  }
}

// Fake FinancialUsageReader
class FakeFinancialUsageReader implements FinancialUsageReader {
  private bookUsage: Set<string> = new Set();
  private accountUsage: Set<string> = new Set();

  async hasBookUsage(bookId: string): Promise<boolean> {
    return this.bookUsage.has(bookId);
  }

  async hasAccountUsage(accountId: string): Promise<boolean> {
    return this.accountUsage.has(accountId);
  }

  setBookUsage(bookId: string, hasUsage: boolean): void {
    if (hasUsage) {
      this.bookUsage.add(bookId);
    } else {
      this.bookUsage.delete(bookId);
    }
  }

  setAccountUsage(accountId: string, hasUsage: boolean): void {
    if (hasUsage) {
      this.accountUsage.add(accountId);
    } else {
      this.accountUsage.delete(accountId);
    }
  }
}

// Fake SenderDefaultReferenceReader
class FakeSenderDefaultReferenceReader implements SenderDefaultReferenceReader {
  private bookDefaults: Set<string> = new Set();
  private accountDefaults: Set<string> = new Set();

  async hasBookDefault(bookId: string): Promise<boolean> {
    return this.bookDefaults.has(bookId);
  }

  async hasAccountDefault(accountId: string): Promise<boolean> {
    return this.accountDefaults.has(accountId);
  }

  setBookDefault(bookId: string, hasDefault: boolean): void {
    if (hasDefault) {
      this.bookDefaults.add(bookId);
    } else {
      this.bookDefaults.delete(bookId);
    }
  }

  setAccountDefault(accountId: string, hasDefault: boolean): void {
    if (hasDefault) {
      this.accountDefaults.add(accountId);
    } else {
      this.accountDefaults.delete(accountId);
    }
  }
}

// Fake ConfigurationLockPort (no-op for unit tests)
class FakeConfigurationLockPort implements ConfigurationLockPort {
  async acquireLocks(): Promise<void> {}
}

function createTestContext(
  books: BookRepository,
  accounts: AccountRepository,
  financialUsage: FinancialUsageReader,
  senderDefaults: SenderDefaultReferenceReader,
): TransactionContext {
  return {
    books,
    accounts,
    categories: {
      findById: async () => null,
      findByBookId: async () => [],
      find: async () => [],
      findByIds: async () => [],
      create: async () => {},
      update: async () => ({} as never),
      archive: async () => ({} as never),
    } as never,
    merchants: {
      findById: async () => null,
      findByNormalizedName: async () => [],
      find: async () => [],
      findByIds: async () => [],
      create: async () => {},
      update: async () => ({} as never),
      archive: async () => ({} as never),
    } as never,
    locks: new FakeConfigurationLockPort(),
    financialUsage,
    senderDefaults,
  };
}

describe('Book Use Cases', () => {
  let books: FakeBookRepository;
  let accounts: FakeAccountRepository;
  let financialUsage: FakeFinancialUsageReader;
  let senderDefaults: FakeSenderDefaultReferenceReader;
  let ctx: TransactionContext;
  let now: Date;

  beforeEach(() => {
    books = new FakeBookRepository();
    accounts = new FakeAccountRepository();
    financialUsage = new FakeFinancialUsageReader();
    senderDefaults = new FakeSenderDefaultReferenceReader();
    ctx = createTestContext(books, accounts, financialUsage, senderDefaults);
    now = new Date('2026-10-20T12:00:00Z');
  });

  describe('CreateBook', () => {
    it('should create a book with normalized name and preserve raw name', async () => {
      const input: CreateBookInput = {
        name: '  My Test Book  ',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
      };

      const result = await createBook(input, ctx, now);

      expect(result.name).toBe('My Test Book');
      expect(result.normalizedName).toBe('my test book');
      expect(result.currency).toBe('BRL');
      expect(result.timezone).toBe('America/Sao_Paulo');
      expect(result.active).toBe(true);
      expect(result.archivedAt).toBeNull();
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should reject blank name', async () => {
      const input: CreateBookInput = {
        name: '   ',
        currency: 'BRL',
      };

      await expect(createBook(input, ctx, now)).rejects.toThrow('Name cannot be blank');
    });

    it('should reject invalid currency format', async () => {
      const input: CreateBookInput = {
        name: 'Test Book',
        currency: 'brl', // lowercase
      };

      await expect(createBook(input, ctx, now)).rejects.toThrow(
        'Currency must be exactly 3 uppercase letters',
      );
    });

    it('should reject currency with wrong length', async () => {
      const input: CreateBookInput = {
        name: 'Test Book',
        currency: 'BR',
      };

      await expect(createBook(input, ctx, now)).rejects.toThrow(
        'Currency must be exactly 3 uppercase letters',
      );
    });

    it('should use default timezone when not provided', async () => {
      const input: CreateBookInput = {
        name: 'Test Book',
        currency: 'USD',
      };

      const result = await createBook(input, ctx, now);
      expect(result.timezone).toBe('America/Sao_Paulo');
    });

    it('should reject invalid timezone characters', async () => {
      const input: CreateBookInput = {
        name: 'Test Book',
        currency: 'USD',
        timezone: 'Invalid/Timezone!',
      };

      await expect(createBook(input, ctx, now)).rejects.toThrow('Invalid IANA timezone');
    });
  });

  describe('GetBook', () => {
    it('should return null for non-existent book', async () => {
      const result = await getBook('non-existent-id', ctx);
      expect(result).toBeNull();
    });

    it('should return existing book', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await getBook(bookId, ctx);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Book');
    });
  });

  describe('ListBooks', () => {
    it('should return empty array when no books exist', async () => {
      const result = await listBooks(ctx);
      expect(result).toEqual([]);
    });

    it('should return all books ordered by creation date', async () => {
      const earlier = new Date('2026-10-19T12:00:00Z');
      const later = new Date('2026-10-20T12:00:00Z');

      await books.create({
        id: uuidv7(),
        name: 'Second Book',
        normalizedName: 'second book',
        currency: 'USD',
        timezone: 'America/New_York',
        active: true,
        archivedAt: null,
        createdAt: later,
        updatedAt: later,
      });

      await books.create({
        id: uuidv7(),
        name: 'First Book',
        normalizedName: 'first book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: earlier,
        updatedAt: earlier,
      });

      const result = await listBooks(ctx);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('First Book');
      expect(result[1].name).toBe('Second Book');
    });
  });

  describe('UpdateBook', () => {
    it('should update book name with normalization', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Original Name',
        normalizedName: 'original name',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const input: UpdateBookInput = {
        id: bookId,
        name: '  New Name  ',
      };

      const result = await updateBook(input, ctx, now);
      expect(result.name).toBe('New Name');
      expect(result.normalizedName).toBe('new name');
    });

    it('should allow currency change when no accounts or transactions exist', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const input: UpdateBookInput = {
        id: bookId,
        currency: 'USD',
      };

      const result = await updateBook(input, ctx, now);
      expect(result.currency).toBe('USD');
    });

    it('should allow no-op currency change even with accounts', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await accounts.addAccount(uuidv7(), bookId);

      const input: UpdateBookInput = {
        id: bookId,
        currency: 'BRL', // same currency
      };

      const result = await updateBook(input, ctx, now);
      expect(result.currency).toBe('BRL');
    });

    it('should block currency change when accounts exist', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await accounts.addAccount(uuidv7(), bookId);

      const input: UpdateBookInput = {
        id: bookId,
        currency: 'USD',
      };

      await expect(updateBook(input, ctx, now)).rejects.toThrow(
        'Book currency cannot be changed after Accounts or Transactions exist',
      );
    });

    it('should block currency change when transactions exist', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      financialUsage.setBookUsage(bookId, true);

      const input: UpdateBookInput = {
        id: bookId,
        currency: 'USD',
      };

      await expect(updateBook(input, ctx, now)).rejects.toThrow(
        'Book currency cannot be changed after Accounts or Transactions exist',
      );
    });

    it('should update timezone', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const input: UpdateBookInput = {
        id: bookId,
        timezone: 'America/New_York',
      };

      const result = await updateBook(input, ctx, now);
      expect(result.timezone).toBe('America/New_York');
    });

    it('should reject update for non-existent book', async () => {
      const input: UpdateBookInput = {
        id: 'non-existent',
        name: 'New Name',
      };

      await expect(updateBook(input, ctx, now)).rejects.toThrow('Book not found');
    });
  });

  describe('ArchiveBook', () => {
    it('should archive an active book', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await archiveBook(bookId, ctx, now);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(now);
    });

    it('should preserve archived_at timestamp on repeated archive', async () => {
      const originalArchiveDate = new Date('2026-10-19T12:00:00Z');
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: false,
        archivedAt: originalArchiveDate,
        createdAt: now,
        updatedAt: now,
      });

      const laterNow = new Date('2026-10-21T12:00:00Z');
      const result = await archiveBook(bookId, ctx, laterNow);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(originalArchiveDate);
    });

    it('should block archive when book is referenced as sender default', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      senderDefaults.setBookDefault(bookId, true);

      await expect(archiveBook(bookId, ctx, now)).rejects.toThrow(
        'Cannot archive Book referenced as Authorized Sender default',
      );
    });

    it('should reject archive for non-existent book', async () => {
      await expect(archiveBook('non-existent', ctx, now)).rejects.toThrow('Book not found');
    });
  });
});
