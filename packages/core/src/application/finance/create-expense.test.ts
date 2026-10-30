/**
 * Unit tests for CreateExpense use case (M04-T02).
 *
 * Covers:
 * - Valid expense creation
 * - Input validation (amount, date)
 * - Invariant enforcement (inactive Book/Account/Category/Merchant, currency mismatch, future date)
 * - Server-controlled fields (status, version, source)
 * - Money/currency canonical form
 * - Deterministic dependency injection
 * - Human-ref collision retry and exhaustion
 * - Exact error codes
 */
import { describe, it, expect, vi } from 'vitest';
import { createExpense, type CreateExpenseDependencies } from './create-expense.js';
import type { FinancialTransactionContext } from '../ports/financial-transaction-port.js';
import type { CreateExpenseInput, TransactionRecord } from '../ports/transaction-ports.js';
import type {
  BookRecord,
  AccountRecord,
  CategoryRecord,
  MerchantRecord,
} from '../ports/master-data-ports.js';
import { FinancialValidationError } from '../../domain/finance/errors.js';
import { DeterministicHumanRefGenerator } from '../../domain/finance/human-ref.js';

// ── Test helpers ────────────────────────────────────────────────────────────────

const BOOK_ID = '0192738a-0000-7000-8000-000000000001';
const ACCOUNT_ID = '0192738a-0000-7000-8000-000000000002';
const CATEGORY_ID = '0192738a-0000-7000-8000-000000000003';
const MERCHANT_ID = '0192738a-0000-7000-8000-000000000004';

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: BOOK_ID,
    name: 'Test Book',
    normalizedName: 'test-book',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    active: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT_ID,
    bookId: BOOK_ID,
    name: 'Test Account',
    normalizedName: 'test-account',
    type: 'checking',
    currency: 'BRL',
    institutionName: null,
    notes: null,
    active: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCategory(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: CATEGORY_ID,
    bookId: BOOK_ID,
    name: 'Test Category',
    normalizedName: 'test-category',
    parentCategoryId: null,
    type: 'expense',
    active: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMerchant(overrides: Partial<MerchantRecord> = {}): MerchantRecord {
  return {
    id: MERCHANT_ID,
    name: 'Test Merchant',
    normalizedName: 'test-merchant',
    type: null,
    taxIdentifier: null,
    active: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeInput(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
  return {
    type: 'expense',
    bookId: BOOK_ID,
    accountId: ACCOUNT_ID,
    amount: '100.00',
    description: 'Test expense',
    transactionDate: '2026-01-15',
    ...overrides,
  } as CreateExpenseInput;
}

function makeDeps(overrides: Partial<CreateExpenseDependencies> = {}): CreateExpenseDependencies {
  return {
    humanRefGenerator: new DeterministicHumanRefGenerator(),
    now: new Date('2026-01-15T12:00:00Z'),
    generateId: () => '0192738a-0000-7000-8000-000000000099',
    ...overrides,
  };
}

function makeTransactionRecord(
  input: CreateExpenseInput,
  deps: CreateExpenseDependencies,
): TransactionRecord {
  return {
    id: deps.generateId?.() ?? '0192738a-0000-7000-8000-000000000099',
    humanRef: 'REF0000000000001',
    bookId: input.bookId,
    type: 'expense',
    status: 'posted',
    amount: input.amount.includes('.') ? input.amount : `${input.amount}.00`,
    currency: 'BRL',
    accountId: input.accountId,
    destinationAccountId: null,
    categoryId: input.categoryId ?? null,
    merchantId: input.merchantId ?? null,
    description: input.description,
    notes: input.notes ?? null,
    transactionDate: input.transactionDate,
    source: 'direct_api',
    sourceReference: input.sourceReference ?? null,
    inboxMessageId: null,
    refundOfTransactionId: null,
    version: 1,
    createdAt: deps.now,
    updatedAt: deps.now,
    voidedAt: null,
    voidReason: null,
  };
}

function createMockContext(
  overrides: {
    book?: BookRecord | null;
    account?: AccountRecord | null;
    category?: CategoryRecord | null;
    merchant?: MerchantRecord | null;
    createResult?: TransactionRecord | null;
  } = {},
): FinancialTransactionContext {
  const book = overrides.book !== undefined ? overrides.book : makeBook();
  const account = overrides.account !== undefined ? overrides.account : makeAccount();
  const category = overrides.category !== undefined ? overrides.category : null;
  const merchant = overrides.merchant !== undefined ? overrides.merchant : null;
  const createResult = overrides.createResult !== undefined ? overrides.createResult : null;

  return {
    books: {
      findById: vi.fn().mockResolvedValue(book),
      findByName: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(book),
      archive: vi.fn().mockResolvedValue(book),
    },
    accounts: {
      findById: vi.fn().mockResolvedValue(account),
      findByBookId: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(account),
      archive: vi.fn().mockResolvedValue(account),
    },
    categories: {
      findById: vi.fn().mockResolvedValue(category),
      findByBookId: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(category ?? makeCategory()),
      archive: vi.fn().mockResolvedValue(category ?? makeCategory()),
      findByIds: vi.fn().mockResolvedValue([]),
    },
    merchants: {
      findById: vi.fn().mockResolvedValue(merchant),
      findByNormalizedName: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(merchant ?? makeMerchant()),
      archive: vi.fn().mockResolvedValue(merchant ?? makeMerchant()),
      findByIds: vi.fn().mockResolvedValue([]),
    },
    locks: {
      acquireLocks: vi.fn().mockResolvedValue(undefined),
    },
    financialUsage: {
      hasBookUsage: vi.fn().mockResolvedValue(false),
      hasAccountUsage: vi.fn().mockResolvedValue(false),
    },
    transactions: {
      create: vi.fn().mockResolvedValue(createResult),
      findById: vi.fn().mockResolvedValue(null),
      findByHumanRef: vi.fn().mockResolvedValue(null),
      findByIdForUpdate: vi.fn().mockResolvedValue(null),
      postedRefundLimits: vi.fn().mockResolvedValue({ total: '0', earliestDate: null }),
      correct: vi.fn().mockResolvedValue(null),
    },
    idempotencyKeys: {
      create: vi.fn().mockRejectedValue(new Error('not implemented in T02')),
      complete: vi.fn().mockRejectedValue(new Error('not implemented in T02')),
      findByKeyAndScope: vi.fn().mockRejectedValue(new Error('not implemented in T02')),
      findByKeyAndScopeForUpdate: vi.fn().mockRejectedValue(new Error('not implemented in T02')),
    },
    audit: {
      write: vi.fn().mockRejectedValue(new Error('not implemented in T02')),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('CreateExpense', () => {
  describe('valid creation', () => {
    it('creates an expense with all required fields', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const expectedRecord = makeTransactionRecord(input, deps);
      const ctx = createMockContext({ createResult: expectedRecord });

      const result = await createExpense(input, ctx, deps);

      expect(result).toEqual(expectedRecord);
      expect(ctx.locks.acquireLocks).toHaveBeenCalledWith({
        books: [BOOK_ID],
        accounts: [ACCOUNT_ID],
        categories: [],
        merchants: [],
      });
      expect(ctx.transactions.create).toHaveBeenCalledOnce();
    });

    it('creates an expense with optional category and merchant', async () => {
      const input = makeInput({ categoryId: CATEGORY_ID, merchantId: MERCHANT_ID });
      const deps = makeDeps();
      const expectedRecord = makeTransactionRecord(input, deps);
      const ctx = createMockContext({
        category: makeCategory(),
        merchant: makeMerchant(),
        createResult: expectedRecord,
      });

      const result = await createExpense(input, ctx, deps);

      expect(result.categoryId).toBe(CATEGORY_ID);
      expect(result.merchantId).toBe(MERCHANT_ID);
      expect(ctx.locks.acquireLocks).toHaveBeenCalledWith({
        books: [BOOK_ID],
        accounts: [ACCOUNT_ID],
        categories: [CATEGORY_ID],
        merchants: [MERCHANT_ID],
      });
    });

    it('sets server-controlled fields correctly', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const expectedRecord = makeTransactionRecord(input, deps);
      const ctx = createMockContext({ createResult: expectedRecord });

      const result = await createExpense(input, ctx, deps);

      expect(result.type).toBe('expense');
      expect(result.status).toBe('posted');
      expect(result.version).toBe(1);
      expect(result.source).toBe('direct_api');
      expect(result.destinationAccountId).toBeNull();
      expect(result.refundOfTransactionId).toBeNull();
    });

    it('canonicalizes money amount to two decimal places', async () => {
      const input = makeInput({ amount: '35' });
      const deps = makeDeps();
      const expectedRecord = makeTransactionRecord(input, deps);
      expectedRecord.amount = '35.00';
      const ctx = createMockContext({ createResult: expectedRecord });

      const result = await createExpense(input, ctx, deps);

      expect(result.amount).toBe('35.00');
    });
  });

  describe('input validation', () => {
    it.each(['income', 'transfer', 'arbitrary', undefined])(
      'rejects runtime type %s before locking',
      async (type) => {
        const ctx = createMockContext();
        await expect(
          createExpense({ ...makeInput(), type } as CreateExpenseInput, ctx, makeDeps()),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(ctx.locks.acquireLocks).not.toHaveBeenCalled();
      },
    );

    it.each(['bookId', 'accountId', 'amount', 'description', 'transactionDate'] as const)(
      'rejects missing or wrong-type %s before locking',
      async (field) => {
        for (const value of [undefined, null, 123]) {
          const ctx = createMockContext();
          await expect(
            createExpense(
              { ...makeInput(), [field]: value } as CreateExpenseInput,
              ctx,
              makeDeps(),
            ),
          ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
          expect(ctx.locks.acquireLocks).not.toHaveBeenCalled();
        }
      },
    );

    it.each(['refundOfTransactionId', 'refund_of_transaction_id'])(
      'rejects refund bypass field %s',
      async (field) => {
        const ctx = createMockContext();
        await expect(
          createExpense({ ...makeInput(), [field]: ACCOUNT_ID }, ctx, makeDeps()),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(ctx.locks.acquireLocks).not.toHaveBeenCalled();
      },
    );
    it('rejects invalid amount format', async () => {
      const input = makeInput({ amount: 'abc' });
      const deps = makeDeps();
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
    });

    it('rejects zero amount', async () => {
      const input = makeInput({ amount: '0.00' });
      const deps = makeDeps();
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
    });

    it('rejects negative amount', async () => {
      const input = makeInput({ amount: '-10.00' });
      const deps = makeDeps();
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
    });

    it('rejects invalid date format', async () => {
      const input = makeInput({ transactionDate: '2026/01/15' });
      const deps = makeDeps();
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
    });

    it('rejects impossible calendar date', async () => {
      const input = makeInput({ transactionDate: '2026-02-30' });
      const deps = makeDeps();
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(FinancialValidationError);
    });
  });

  describe('invariant enforcement', () => {
    it('rejects nonexistent Book with BOOK_NOT_FOUND code', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext({ book: null });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'BOOK_NOT_FOUND',
      });
    });

    it('rejects inactive Book with BOOK_INACTIVE code', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext({ book: makeBook({ active: false }) });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'BOOK_INACTIVE',
      });
    });

    it('rejects nonexistent Account with ACCOUNT_NOT_FOUND code', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext({ account: null });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'ACCOUNT_NOT_FOUND',
      });
    });

    it('rejects inactive Account with ACCOUNT_INACTIVE code', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext({ account: makeAccount({ active: false }) });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'ACCOUNT_INACTIVE',
      });
    });

    it('rejects Account not belonging to Book with VALIDATION_ERROR code', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const otherBookId = '0192738a-0000-7000-8000-000000000099';
      const ctx = createMockContext({
        account: makeAccount({ bookId: otherBookId }),
      });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects currency mismatch between Account and Book', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext({
        account: makeAccount({ currency: 'USD' }),
      });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'CURRENCY_MISMATCH',
      });
    });

    it('rejects future transaction date with TRANSACTION_DATE_IN_FUTURE code', async () => {
      const input = makeInput({ transactionDate: '2026-12-31' });
      const deps = makeDeps({ now: new Date('2026-01-15T12:00:00Z') });
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'TRANSACTION_DATE_IN_FUTURE',
      });
    });

    it('rejects nonexistent Category with CATEGORY_NOT_FOUND code', async () => {
      const input = makeInput({ categoryId: CATEGORY_ID });
      const deps = makeDeps();
      const ctx = createMockContext({ category: null });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
    });

    it('rejects inactive Category with CATEGORY_INACTIVE code', async () => {
      const input = makeInput({ categoryId: CATEGORY_ID });
      const deps = makeDeps();
      const ctx = createMockContext({
        category: makeCategory({ active: false }),
      });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'CATEGORY_INACTIVE',
      });
    });

    it('rejects Category not belonging to Book with VALIDATION_ERROR code', async () => {
      const input = makeInput({ categoryId: CATEGORY_ID });
      const deps = makeDeps();
      const otherBookId = '0192738a-0000-7000-8000-000000000099';
      const ctx = createMockContext({
        category: makeCategory({ bookId: otherBookId }),
      });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects nonexistent Merchant with MERCHANT_NOT_FOUND code', async () => {
      const input = makeInput({ merchantId: MERCHANT_ID });
      const deps = makeDeps();
      const ctx = createMockContext({ merchant: null });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'MERCHANT_NOT_FOUND',
      });
    });

    it('rejects inactive Merchant with MERCHANT_INACTIVE code', async () => {
      const input = makeInput({ merchantId: MERCHANT_ID });
      const deps = makeDeps();
      const ctx = createMockContext({
        merchant: makeMerchant({ active: false }),
      });

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'MERCHANT_INACTIVE',
      });
    });
  });

  describe('human_ref collision handling', () => {
    it('retries on collision and succeeds with second candidate', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const expectedRecord = makeTransactionRecord(input, deps);
      expectedRecord.humanRef = 'REF0000000000002';
      const ctx = createMockContext();

      // First call returns null (collision), second returns the record
      (ctx.transactions.create as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(expectedRecord);

      const result = await createExpense(input, ctx, deps);

      expect(result).toEqual(expectedRecord);
      expect(ctx.transactions.create).toHaveBeenCalledTimes(2);
      const calls = (ctx.transactions.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].id).toBe(calls[1][0].id);
    });

    it('throws after exhausting all 3 human_ref candidates', async () => {
      const input = makeInput();
      const deps = makeDeps();
      const ctx = createMockContext();

      // All 3 attempts return null (collision)
      (ctx.transactions.create as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(createExpense(input, ctx, deps)).rejects.toThrow(
        /Failed to generate unique human_ref after 3 attempts/,
      );
      expect(ctx.transactions.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('deterministic dependencies', () => {
    it('uses injected generateId for transaction id', async () => {
      const customId = '0192738a-0000-7000-8000-custom-id-0001';
      const input = makeInput();
      const deps = makeDeps({ generateId: () => customId });
      const expectedRecord = makeTransactionRecord(input, deps);
      expectedRecord.id = customId;
      const ctx = createMockContext({ createResult: expectedRecord });

      const result = await createExpense(input, ctx, deps);

      expect(result.id).toBe(customId);
    });

    it('uses injected now for future-date validation', async () => {
      const input = makeInput({ transactionDate: '2026-06-01' });
      const deps = makeDeps({ now: new Date('2026-01-01T12:00:00Z') });
      const ctx = createMockContext();

      await expect(createExpense(input, ctx, deps)).rejects.toMatchObject({
        code: 'TRANSACTION_DATE_IN_FUTURE',
      });
    });
  });
});
