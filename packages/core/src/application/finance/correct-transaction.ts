import { v7 as uuidv7 } from 'uuid';
import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from '../ports/financial-transaction-port.js';
import type { CorrectionFields, TransactionRecord } from '../ports/transaction-ports.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';
import {
  validateMoneyAmount,
  validateTransactionDate,
  validateTransactionDateNotFuture,
  rejectInactiveBook,
  rejectInactiveAccount,
  rejectInactiveCategory,
  rejectInactiveMerchant,
  validateTransferAccountsDiffer,
} from '../../domain/finance/transaction-validation.js';
import { transactionSnapshot } from './create-transaction.js';

const MUTABLE = [
  'amount',
  'accountId',
  'categoryId',
  'merchantId',
  'description',
  'notes',
  'transactionDate',
] as const;
export type CorrectTransactionInput = CorrectionFields & { version: number };

function validateInput(input: CorrectTransactionInput): void {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new FinancialValidationError('Invalid correction');
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new FinancialValidationError('Invalid version', 'version');
  const keys = Object.keys(input);
  if (keys.some((key) => key !== 'version' && !(MUTABLE as readonly string[]).includes(key)))
    throw new FinancialValidationError('Immutable or unknown correction field');
  if (!keys.some((key) => key !== 'version'))
    throw new FinancialValidationError('Empty correction');
  if ('amount' in input) validateMoneyAmount(input.amount, 'BRL');
  if ('transactionDate' in input) validateTransactionDate(input.transactionDate);
  for (const field of ['accountId', 'description'] as const)
    if (field in input && typeof input[field] !== 'string')
      throw new FinancialValidationError(`Invalid ${field}`, field);
  for (const field of ['categoryId', 'merchantId', 'notes'] as const)
    if (field in input && input[field] !== null && typeof input[field] !== 'string')
      throw new FinancialValidationError(`Invalid ${field}`, field);
  for (const field of ['accountId', 'categoryId', 'merchantId'] as const)
    if (
      typeof input[field] === 'string' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input[field])
    )
      throw new FinancialValidationError(`Invalid ${field}`, field);
}

function cents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
}

function references(record: TransactionRecord, patch: CorrectionFields) {
  return {
    accounts: [record.accountId, record.destinationAccountId, patch.accountId].filter(
      (v): v is string => !!v,
    ),
    categories: [record.categoryId, patch.categoryId].filter((v): v is string => !!v),
    merchants: [record.merchantId, patch.merchantId].filter((v): v is string => !!v),
  };
}

function includesRefs(
  locked: ReturnType<typeof references>,
  current: ReturnType<typeof references>,
): boolean {
  return (['accounts', 'categories', 'merchants'] as const).every((kind) =>
    current[kind].every((id) => locked[kind].includes(id)),
  );
}

export class CorrectTransaction {
  constructor(
    private readonly transactions: FinancialTransactionPort,
    private readonly now: () => Date,
  ) {}

  async execute(
    id: string,
    input: CorrectTransactionInput,
    correlationId: string,
  ): Promise<TransactionRecord> {
    validateInput(input);
    return this.transactions.runInTransaction((ctx) =>
      this.executeInContext(id, input, correlationId, ctx),
    );
  }

  /** Reuses a caller-owned financial transaction; no nested commit. */
  async executeInContext(
    id: string,
    input: CorrectTransactionInput,
    correlationId: string,
    ctx: FinancialTransactionContext,
  ): Promise<TransactionRecord> {
    validateInput(input);
    const discovered = await ctx.transactions.findById(id);
    if (!discovered) throw new FinancialError('Transaction not found', 'TRANSACTION_NOT_FOUND');
    const lockedRefs = references(discovered, input);
    await ctx.locks.acquireLocks({ books: [discovered.bookId], ...lockedRefs });
    const before = await ctx.transactions.findByIdForUpdate(id);
    if (!before) throw new FinancialError('Transaction not found', 'TRANSACTION_NOT_FOUND');
    if (before.bookId !== discovered.bookId || !includesRefs(lockedRefs, references(before, input)))
      throw new ConfigurationLockSetChangedError();
    if (before.version !== input.version)
      throw new FinancialError('Stale Transaction version', 'VERSION_CONFLICT');
    if (before.refundOfTransactionId)
      throw new FinancialError('Refund cannot be corrected', 'REFUND_IMMUTABLE');
    if (before.status !== 'posted')
      throw new FinancialError('Voided Transaction cannot be corrected', 'VALIDATION_ERROR');

    const book = await ctx.books.findById(before.bookId);
    if (!book) throw new FinancialError('Book not found', 'BOOK_NOT_FOUND');
    rejectInactiveBook(book);
    if (book.currency !== before.currency)
      throw new FinancialError('Transaction currency differs from Book', 'CURRENCY_MISMATCH');
    const amount = validateMoneyAmount(input.amount ?? before.amount, book.currency).amount;
    const accountId = input.accountId ?? before.accountId;
    const account = await ctx.accounts.findById(accountId);
    if (!account) throw new FinancialError('Account not found', 'ACCOUNT_NOT_FOUND');
    rejectInactiveAccount(account);
    if (account.bookId !== book.id)
      throw new FinancialError('Account does not belong to Book', 'VALIDATION_ERROR');
    if (account.currency !== book.currency)
      throw new FinancialError('Account currency does not match Book', 'CURRENCY_MISMATCH');
    if (before.type === 'transfer') {
      if ('categoryId' in input || 'merchantId' in input)
        throw new FinancialValidationError('Transfer has no category or merchant');
      const destinationId = before.destinationAccountId;
      if (!destinationId) throw new FinancialValidationError('Transfer destination missing');
      validateTransferAccountsDiffer(accountId, destinationId);
      const destination = await ctx.accounts.findById(destinationId);
      if (!destination)
        throw new FinancialError('Destination Account not found', 'ACCOUNT_NOT_FOUND');
      rejectInactiveAccount(destination);
      if (destination.bookId !== book.id)
        throw new FinancialError('Destination Account does not belong to Book', 'VALIDATION_ERROR');
      if (destination.currency !== book.currency)
        throw new FinancialError(
          'Destination Account currency does not match Book',
          'CURRENCY_MISMATCH',
        );
    }
    const categoryId = input.categoryId === undefined ? before.categoryId : input.categoryId;
    if (categoryId) {
      const category = await ctx.categories.findById(categoryId);
      if (!category) throw new FinancialError('Category not found', 'CATEGORY_NOT_FOUND');
      rejectInactiveCategory(category);
      if (category.bookId !== book.id)
        throw new FinancialError('Category does not belong to Book', 'VALIDATION_ERROR');
    }
    const merchantId = input.merchantId === undefined ? before.merchantId : input.merchantId;
    if (merchantId) {
      const merchant = await ctx.merchants.findById(merchantId);
      if (!merchant) throw new FinancialError('Merchant not found', 'MERCHANT_NOT_FOUND');
      rejectInactiveMerchant(merchant);
    }
    const transactionDate = input.transactionDate ?? before.transactionDate;
    validateTransactionDateNotFuture(transactionDate, this.now(), book.timezone);
    if (before.type === 'expense') {
      const refunds = await ctx.transactions.postedRefundLimits(before.id);
      if (cents(amount) < cents(refunds.total))
        throw new FinancialError('Amount below posted Refunds', 'VALIDATION_ERROR');
      if (refunds.earliestDate && transactionDate > refunds.earliestDate)
        throw new FinancialError('Date after posted Refund', 'VALIDATION_ERROR');
    }
    const result = await ctx.transactions.correct(
      before.id,
      input.version,
      {
        amount,
        accountId,
        categoryId,
        merchantId,
        description: input.description ?? before.description,
        notes: input.notes === undefined ? before.notes : input.notes,
        transactionDate,
      },
      this.now(),
    );
    if (!result) throw new FinancialError('Stale Transaction version', 'VERSION_CONFLICT');
    await ctx.audit.write({
      id: uuidv7(),
      createdAt: this.now(),
      entityType: 'transaction',
      entityId: result.id,
      action: 'TRANSACTION_UPDATED',
      source: 'direct_api',
      actorReference: null,
      oldData: transactionSnapshot(before),
      newData: transactionSnapshot(result),
      correlationId,
    });
    return result;
  }
}
