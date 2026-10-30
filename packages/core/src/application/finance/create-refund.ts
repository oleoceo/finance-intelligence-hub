import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import type { HumanRefGenerator } from '../../domain/finance/human-ref.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';
import {
  rejectInactiveAccount,
  rejectInactiveBook,
  validateMoneyAmount,
  validateTransactionDate,
  validateTransactionDateNotFuture,
} from '../../domain/finance/transaction-validation.js';
import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from '../ports/financial-transaction-port.js';
import type { TransactionRecord } from '../ports/transaction-ports.js';
import {
  canonicalJson,
  decideExistingIdempotency,
  IdempotencyInProgressRetryError,
  TRANSACTION_REFUND_SCOPE,
  validateIdempotencyKey,
} from './idempotency.js';
import { hydrateTransactionSnapshot, transactionSnapshot } from './create-transaction.js';

export interface CreateRefundInput {
  version: number;
  amount: string;
  accountId: string;
  transactionDate: string;
  description: string;
  notes?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ['version', 'amount', 'accountId', 'transactionDate', 'description', 'notes'];

export function validateRefundInput(input: CreateRefundInput): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !FIELDS.includes(field))
  )
    throw new FinancialValidationError('Invalid Refund input');
  if (!Number.isSafeInteger(input.version) || input.version < 1)
    throw new FinancialValidationError('Invalid original version', 'version');
  if (typeof input.accountId !== 'string' || !UUID.test(input.accountId))
    throw new FinancialValidationError('Invalid account', 'account_id');
  if (
    typeof input.description !== 'string' ||
    (input.notes !== undefined && input.notes !== null && typeof input.notes !== 'string')
  )
    throw new FinancialValidationError('Invalid Refund text');
  validateMoneyAmount(input.amount, 'BRL');
  validateTransactionDate(input.transactionDate);
}

export function fingerprintTransactionRefund(originalId: string, input: CreateRefundInput): string {
  validateRefundInput(input);
  return createHash('sha256')
    .update(
      canonicalJson({
        original_id: originalId,
        version: input.version,
        amount: validateMoneyAmount(input.amount, 'BRL').amount,
        account_id: input.accountId,
        transaction_date: input.transactionDate,
        description: input.description,
        notes: input.notes ?? null,
      }),
    )
    .digest('hex');
}

function cents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
}

type LockReceipt = {
  ctx: FinancialTransactionContext;
  originalId: string;
  bookId: string | null;
  accountId: string;
  originalAccountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchantId: string | null;
};
const receipts = new WeakMap<object, LockReceipt>();

/** Acquire the complete configuration set before idempotency or financial row locks. */
export async function prepareRefundLocks(
  ctx: FinancialTransactionContext,
  originalId: string,
  input: CreateRefundInput,
): Promise<object> {
  validateRefundInput(input);
  const discovered = await ctx.transactions.findById(originalId);
  if (discovered)
    await ctx.locks.acquireLocks({
      books: [discovered.bookId],
      accounts: [discovered.accountId, discovered.destinationAccountId, input.accountId].filter(
        (v): v is string => !!v,
      ),
      categories: discovered.categoryId ? [discovered.categoryId] : [],
      merchants: discovered.merchantId ? [discovered.merchantId] : [],
    });
  const receipt = Object.freeze({});
  receipts.set(receipt, {
    ctx,
    originalId,
    bookId: discovered?.bookId ?? null,
    accountId: input.accountId,
    originalAccountId: discovered?.accountId ?? null,
    destinationAccountId: discovered?.destinationAccountId ?? null,
    categoryId: discovered?.categoryId ?? null,
    merchantId: discovered?.merchantId ?? null,
  });
  return receipt;
}

export class CreateRefund {
  constructor(
    private readonly transactions: FinancialTransactionPort,
    private readonly humanRefGenerator: HumanRefGenerator,
    private readonly now: () => Date,
  ) {}

  async execute(
    originalId: string,
    input: CreateRefundInput,
    key: unknown,
    correlationId: string,
  ): Promise<TransactionRecord> {
    validateRefundInput(input);
    validateIdempotencyKey(key);
    return this.transactions.runInTransaction((ctx) =>
      this.executeInContext(originalId, input, key, correlationId, ctx),
    );
  }

  async executeInContext(
    originalId: string,
    input: CreateRefundInput,
    key: unknown,
    correlationId: string,
    ctx: FinancialTransactionContext,
    provenance?: { senderReference: string; sourceReference: string; inboxMessageId: string },
    lockReceipt?: object,
  ): Promise<TransactionRecord> {
    validateRefundInput(input);
    const validKey = validateIdempotencyKey(key);
    const prepared = lockReceipt ? receipts.get(lockReceipt) : undefined;
    if (
      lockReceipt &&
      (!prepared ||
        prepared.ctx !== ctx ||
        prepared.originalId !== originalId ||
        prepared.accountId !== input.accountId)
    )
      throw new ConfigurationLockSetChangedError();
    if (
      provenance &&
      (!provenance.senderReference || !provenance.sourceReference || !provenance.inboxMessageId)
    )
      throw new FinancialValidationError('Invalid trusted provenance');
    const receipt = lockReceipt ?? (await prepareRefundLocks(ctx, originalId, input));
    const locks = receipts.get(receipt)!;
    const fingerprint = fingerprintTransactionRefund(originalId, input);
    const claim = await ctx.idempotencyKeys.create({
      id: uuidv7(),
      idempotencyKey: validKey,
      scope: TRANSACTION_REFUND_SCOPE,
      requestHash: fingerprint,
      createdAt: this.now(),
    });
    if (!claim) {
      const existing = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(
        validKey,
        TRANSACTION_REFUND_SCOPE,
      );
      if (!existing) throw new IdempotencyInProgressRetryError();
      const decision = decideExistingIdempotency(existing, fingerprint);
      if (decision.kind === 'retry') throw new IdempotencyInProgressRetryError();
      if (decision.record.responseStatus !== 201 || decision.record.resourceType !== 'transaction')
        throw new Error('Invalid persisted Refund completion');
      const replay = hydrateTransactionSnapshot(decision.record.responseBody);
      if (replay.id !== decision.record.resourceId)
        throw new Error('Refund replay resource mismatch');
      return replay;
    }
    const original = await ctx.transactions.findByIdForUpdate(originalId);
    if (!original) throw new FinancialError('Transaction not found', 'TRANSACTION_NOT_FOUND');
    if (
      original.bookId !== locks.bookId ||
      original.accountId !== locks.originalAccountId ||
      original.destinationAccountId !== locks.destinationAccountId ||
      original.categoryId !== locks.categoryId ||
      original.merchantId !== locks.merchantId
    )
      throw new ConfigurationLockSetChangedError();
    if (
      original.type !== 'expense' ||
      original.status !== 'posted' ||
      original.refundOfTransactionId
    )
      throw new FinancialError('Invalid Refund target', 'REFUND_INVALID_TARGET');
    if (original.version !== input.version)
      throw new FinancialError('Stale Expense version', 'VERSION_CONFLICT');
    const book = await ctx.books.findById(original.bookId);
    if (!book) throw new FinancialError('Book not found', 'BOOK_NOT_FOUND');
    rejectInactiveBook(book);
    if (book.currency !== original.currency)
      throw new FinancialError('Expense currency differs from Book', 'CURRENCY_MISMATCH');
    const account = await ctx.accounts.findById(input.accountId);
    if (!account) throw new FinancialError('Account not found', 'ACCOUNT_NOT_FOUND');
    rejectInactiveAccount(account);
    if (account.bookId !== book.id)
      throw new FinancialError('Account does not belong to Book', 'VALIDATION_ERROR');
    if (account.currency !== book.currency)
      throw new FinancialError('Account currency differs from Book', 'CURRENCY_MISMATCH');
    const amount = validateMoneyAmount(input.amount, book.currency).amount;
    if (input.transactionDate < original.transactionDate)
      throw new FinancialError('Refund date precedes Expense', 'REFUND_DATE_INVALID');
    validateTransactionDateNotFuture(input.transactionDate, this.now(), book.timezone);
    const posted = await ctx.transactions.postedRefundLimits(originalId);
    if (cents(posted.total) + cents(amount) > cents(original.amount))
      throw new FinancialError('Refund amount exceeds remaining balance', 'REFUND_AMOUNT_EXCEEDED');
    const id = uuidv7();
    let record: TransactionRecord | null = null;
    for (let attempt = 0; attempt < 3 && !record; attempt++)
      record = await ctx.transactions.createRefund({
        id,
        humanRef: this.humanRefGenerator.generate(),
        originalId,
        bookId: book.id,
        currency: book.currency,
        amount,
        accountId: input.accountId,
        transactionDate: input.transactionDate,
        description: input.description,
        notes: input.notes ?? null,
        source: provenance ? 'whatsapp' : 'direct_api',
        sourceReference: provenance?.sourceReference ?? null,
        inboxMessageId: provenance?.inboxMessageId ?? null,
      });
    if (!record) throw new Error('Refund human reference collision exhausted');
    const snapshot = transactionSnapshot(record);
    await ctx.audit.write({
      id: uuidv7(),
      createdAt: this.now(),
      entityType: 'transaction',
      entityId: record.id,
      action: 'TRANSACTION_REFUND_CREATED',
      source: provenance ? 'whatsapp' : 'direct_api',
      actorReference: provenance?.senderReference ?? null,
      oldData: null,
      newData: snapshot,
      correlationId,
    });
    await ctx.idempotencyKeys.complete({
      id: claim.id,
      resourceType: 'transaction',
      resourceId: record.id,
      responseStatus: 201,
      responseBody: snapshot,
      completedAt: this.now(),
    });
    return record;
  }
}
