/**
 * Unit tests for Account configuration use cases (M03-T02).
 *
 * Tests normalization, validation, immutability guards, and lifecycle behavior.
 * Uses fake repository implementations to isolate Core logic from Database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  archiveAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './account-use-cases.js';
import type {
  BookRepository,
  AccountRepository,
  FinancialUsageReader,
  SenderDefaultReferenceReader,
  ConfigurationLockPort,
  TransactionContext,
  AccountRecord,
  BookRecord,
} from '../../application/ports/master-data-ports.js';

// Fake in-memory repositories
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

  async create(input: BookRecord): Promise<void> {
    this.books.set(input.id, input);
  }

  async update(_input: Partial<BookRecord>): Promise<BookRecord> {
    throw new Error('Not implemented');
  }
  async archive(_input: Partial<BookRecord>): Promise<BookRecord> {
    throw new Error('Not implemented');
  }
}

class FakeAccountRepository implements AccountRepository {
  private accounts: Map<string, AccountRecord> = new Map();

  async findById(id: string): Promise<AccountRecord | null> {
    return this.accounts.get(id) ?? null;
  }

  async findByBookId(bookId: string): Promise<AccountRecord[]> {
    const result: AccountRecord[] = [];
    for (const account of this.accounts.values()) {
      if (account.bookId === bookId) {
        result.push(account);
      }
    }
    return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async find(): Promise<AccountRecord[]> {
    return Array.from(this.accounts.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async create(input: AccountRecord): Promise<void> {
    this.accounts.set(input.id, input);
  }

  async update(input: {
    id: string;
    name: string;
    normalizedName: string;
    updatedAt: Date;
  }): Promise<AccountRecord> {
    const existing = this.accounts.get(input.id);
    if (!existing) {
      throw new Error('Account not found');
    }
    const updated: AccountRecord = {
      ...existing,
      name: input.name,
      normalizedName: input.normalizedName,
      updatedAt: input.updatedAt,
    };
    this.accounts.set(input.id, updated);
    return updated;
  }

  async archive(input: {
    id: string;
    active: boolean;
    archivedAt: Date | null;
    updatedAt: Date;
  }): Promise<AccountRecord> {
    const existing = this.accounts.get(input.id);
    if (!existing) {
      throw new Error('Account not found');
    }
    const archived: AccountRecord = {
      ...existing,
      active: input.active,
      archivedAt: input.archivedAt,
      updatedAt: input.updatedAt,
    };
    this.accounts.set(input.id, archived);
    return archived;
  }
}

class FakeFinancialUsageReader implements FinancialUsageReader {
  private accountUsage: Set<string> = new Set();

  async hasBookUsage(_bookId: string): Promise<boolean> {
    return false;
  }

  async hasAccountUsage(accountId: string): Promise<boolean> {
    return this.accountUsage.has(accountId);
  }

  setAccountUsage(accountId: string, hasUsage: boolean): void {
    if (hasUsage) {
      this.accountUsage.add(accountId);
    } else {
      this.accountUsage.delete(accountId);
    }
  }
}

class FakeSenderDefaultReferenceReader implements SenderDefaultReferenceReader {
  private accountDefaults: Set<string> = new Set();

  async hasBookDefault(_bookId: string): Promise<boolean> {
    return false;
  }

  async hasAccountDefault(accountId: string): Promise<boolean> {
    return this.accountDefaults.has(accountId);
  }

  setAccountDefault(accountId: string, hasDefault: boolean): void {
    if (hasDefault) {
      this.accountDefaults.add(accountId);
    } else {
      this.accountDefaults.delete(accountId);
    }
  }
}

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
    locks: new FakeConfigurationLockPort(),
    financialUsage,
    senderDefaults,
  };
}

describe('Account Use Cases', () => {
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

  describe('CreateAccount', () => {
    it('should create an account with normalized name', async () => {
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

      const input: CreateAccountInput = {
        name: ' My Test Account ',
        bookId,
        type: 'checking',
      };

      const result = await createAccount(input, ctx, now);

      expect(result.name).toBe('My Test Account');
      expect(result.normalizedName).toBe('my test account');
      expect(result.bookId).toBe(bookId);
      expect(result.currency).toBe('BRL');
      expect(result.active).toBe(true);
      expect(result.archivedAt).toBeNull();
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should reject blank name', async () => {
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

      const input: CreateAccountInput = {
        name: '   ',
        bookId,
        type: 'checking',
      };

      await expect(createAccount(input, ctx, now)).rejects.toThrow('Name cannot be blank');
    });

    it('should reject creation for inactive book', async () => {
      const bookId = uuidv7();
      await books.create({
        id: bookId,
        name: 'Test Book',
        normalizedName: 'test book',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        active: false,
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const input: CreateAccountInput = {
        name: 'Test Account',
        bookId,
        type: 'checking',
      };

      await expect(createAccount(input, ctx, now)).rejects.toThrow(
        'Cannot create Account for inactive Book',
      );
    });

    it('should reject creation for non-existent book', async () => {
      const input: CreateAccountInput = {
        name: 'Test Account',
        bookId: 'non-existent',
        type: 'checking',
      };

      await expect(createAccount(input, ctx, now)).rejects.toThrow('Book not found');
    });
  });

  describe('GetAccount', () => {
    it('should return null for non-existent account', async () => {
      const result = await getAccount('non-existent-id', ctx);
      expect(result).toBeNull();
    });

    it('should return existing account', async () => {
      const accountId = uuidv7();
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
      await accounts.create({
        id: accountId,
        name: 'Test Account',
        normalizedName: 'test account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await getAccount(accountId, ctx);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Account');
    });
  });

  describe('ListAccounts', () => {
    it('should return empty array when no accounts exist', async () => {
      const result = await listAccounts(ctx);
      expect(result).toEqual([]);
    });

    it('should return all accounts ordered by creation date', async () => {
      const earlier = new Date('2026-10-19T12:00:00Z');
      const later = new Date('2026-10-20T12:00:00Z');
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

      await accounts.create({
        id: uuidv7(),
        name: 'Second Account',
        normalizedName: 'second account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: later,
        updatedAt: later,
      });

      await accounts.create({
        id: uuidv7(),
        name: 'First Account',
        normalizedName: 'first account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: earlier,
        updatedAt: earlier,
      });

      const result = await listAccounts(ctx);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('First Account');
      expect(result[1].name).toBe('Second Account');
    });
  });

  describe('UpdateAccount', () => {
    it('should update account name with normalization', async () => {
      const accountId = uuidv7();
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
      await accounts.create({
        id: accountId,
        name: 'Original Name',
        normalizedName: 'original name',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const input: UpdateAccountInput = {
        id: accountId,
        name: ' New Name ',
      };

      const result = await updateAccount(input, ctx, now);
      expect(result.name).toBe('New Name');
      expect(result.normalizedName).toBe('new name');
    });

    it('should reject update for non-existent account', async () => {
      const input: UpdateAccountInput = {
        id: 'non-existent',
        name: 'New Name',
      };

      await expect(updateAccount(input, ctx, now)).rejects.toThrow('Account not found');
    });
  });

  describe('ArchiveAccount', () => {
    it('should archive an active account', async () => {
      const accountId = uuidv7();
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
      await accounts.create({
        id: accountId,
        name: 'Test Account',
        normalizedName: 'test account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await archiveAccount(accountId, ctx, now);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(now);
    });

    it('should preserve archived_at timestamp on repeated archive', async () => {
      const originalArchiveDate = new Date('2026-10-19T12:00:00Z');
      const accountId = uuidv7();
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
      await accounts.create({
        id: accountId,
        name: 'Test Account',
        normalizedName: 'test account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: false,
        archivedAt: originalArchiveDate,
        createdAt: now,
        updatedAt: now,
      });

      const laterNow = new Date('2026-10-21T12:00:00Z');
      const result = await archiveAccount(accountId, ctx, laterNow);
      expect(result.active).toBe(false);
      expect(result.archivedAt).toEqual(originalArchiveDate);
    });

    it('should block archive when account is referenced as sender default', async () => {
      const accountId = uuidv7();
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
      await accounts.create({
        id: accountId,
        name: 'Test Account',
        normalizedName: 'test account',
        bookId,
        currency: 'BRL',
        type: 'checking',
        institutionName: null,
        notes: null,
        active: true,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      senderDefaults.setAccountDefault(accountId, true);

      await expect(archiveAccount(accountId, ctx, now)).rejects.toThrow(
        'Cannot archive Account referenced as Authorized Sender default',
      );
    });

    it('should reject archive for non-existent account', async () => {
      await expect(archiveAccount('non-existent', ctx, now)).rejects.toThrow('Account not found');
    });
  });
});
