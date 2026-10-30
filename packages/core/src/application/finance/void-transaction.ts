import { v7 as uuidv7 } from 'uuid';
import { createHash } from 'node:crypto';
import { ConfigurationLockSetChangedError } from '../ports/master-data-ports.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from '../ports/financial-transaction-port.js';
import type { TransactionRecord } from '../ports/transaction-ports.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';
import {
  canonicalJson,
  decideExistingIdempotency,
  IdempotencyInProgressRetryError,
  validateIdempotencyKey,
  TRANSACTION_VOID_SCOPE,
} from './idempotency.js';
import { hydrateTransactionSnapshot, transactionSnapshot } from './create-transaction.js';

export interface VoidTransactionInput {
  version: number;
  reason: string;
}

export function validateVoidInput(input: VoidTransactionInput): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(',') !== 'reason,version' ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    typeof input.reason !== 'string' ||
    !input.reason.trim()
  )
    throw new FinancialValidationError('Invalid Void input');
}

export function fingerprintTransactionVoid(id: string, input: VoidTransactionInput): string {
  return createHash('sha256')
    .update(canonicalJson({ target_id: id, version: input.version, reason: input.reason }))
    .digest('hex');
}

type Prepared = {
  ctx: FinancialTransactionContext;
  id: string;
  bookId: string | null;
  originalId: string | null;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchantId: string | null;
};
const receipts = new WeakMap<object, Prepared>();

/** Configuration locks precede idempotency and financial row locks. */
export async function prepareVoidLocks(
  ctx: FinancialTransactionContext,
  id: string,
  input: VoidTransactionInput,
): Promise<object> {
  validateVoidInput(input);
  const target = await ctx.transactions.findById(id);
  if (target)
    await ctx.locks.acquireLocks({
      books: [target.bookId],
      accounts: [target.accountId, target.destinationAccountId].filter(
        (value): value is string => !!value,
      ),
      categories: target.categoryId ? [target.categoryId] : [],
      merchants: target.merchantId ? [target.merchantId] : [],
    });
  const receipt = Object.freeze({});
  receipts.set(receipt, {
    ctx,
    id,
    bookId: target?.bookId ?? null,
    originalId: target?.refundOfTransactionId ?? null,
    accountId: target?.accountId ?? null,
    destinationAccountId: target?.destinationAccountId ?? null,
    categoryId: target?.categoryId ?? null,
    merchantId: target?.merchantId ?? null,
  });
  return receipt;
}

export class VoidTransaction {
  constructor(
    private readonly transactions: FinancialTransactionPort,
    private readonly now: () => Date,
  ) {}

  async execute(
    id: string,
    input: VoidTransactionInput,
    key: unknown,
    correlationId: string,
  ): Promise<TransactionRecord> {
    validateVoidInput(input);
    validateIdempotencyKey(key);
    return this.transactions.runInTransaction((ctx) =>
      this.executeInContext(id, input, key, correlationId, ctx),
    );
  }

  async executeInContext(
    id: string,
    input: VoidTransactionInput,
    key: unknown,
    correlationId: string,
    ctx: FinancialTransactionContext,
    provenance?: { senderReference: string },
    lockReceipt?: object,
  ): Promise<TransactionRecord> {
    validateVoidInput(input);
    const validKey = validateIdempotencyKey(key);
    const prepared = lockReceipt ? receipts.get(lockReceipt) : undefined;
    if (lockReceipt && (!prepared || prepared.ctx !== ctx || prepared.id !== id))
      throw new ConfigurationLockSetChangedError();
    if (
      provenance &&
      (!provenance.senderReference || typeof provenance.senderReference !== 'string')
    )
      throw new FinancialValidationError('Invalid trusted sender reference');
    const receipt = lockReceipt ?? (await prepareVoidLocks(ctx, id, input));
    const locks = receipts.get(receipt)!;
    const fingerprint = fingerprintTransactionVoid(id, input);
    const claim = await ctx.idempotencyKeys.create({
      id: uuidv7(),
      idempotencyKey: validKey,
      scope: TRANSACTION_VOID_SCOPE,
      requestHash: fingerprint,
      createdAt: this.now(),
    });
    if (!claim) {
      const existing = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(
        validKey,
        TRANSACTION_VOID_SCOPE,
      );
      if (!existing) throw new IdempotencyInProgressRetryError();
      const decision = decideExistingIdempotency(existing, fingerprint);
      if (decision.kind === 'retry') throw new IdempotencyInProgressRetryError();
      if (decision.record.responseStatus !== 200 || decision.record.resourceType !== 'transaction')
        throw new Error('Invalid persisted Void completion');
      const replay = hydrateTransactionSnapshot(decision.record.responseBody);
      if (replay.id !== decision.record.resourceId)
        throw new Error('Void replay resource mismatch');
      return replay;
    }
    if (locks.originalId) {
      const original = await ctx.transactions.findByIdForUpdate(locks.originalId);
      if (!original) throw new ConfigurationLockSetChangedError();
    }
    const before = await ctx.transactions.findByIdForUpdate(id);
    if (!before) throw new FinancialError('Transaction not found', 'TRANSACTION_NOT_FOUND');
    if (
      before.bookId !== locks.bookId ||
      before.refundOfTransactionId !== locks.originalId ||
      before.accountId !== locks.accountId ||
      before.destinationAccountId !== locks.destinationAccountId ||
      before.categoryId !== locks.categoryId ||
      before.merchantId !== locks.merchantId
    )
      throw new ConfigurationLockSetChangedError();
    if (before.status === 'voided')
      throw new FinancialError('Transaction already voided', 'TRANSACTION_ALREADY_VOIDED');
    if (before.version !== input.version)
      throw new FinancialError('Stale Transaction version', 'VERSION_CONFLICT');
    if (before.type === 'expense') {
      const refunds = await ctx.transactions.postedRefundLimits(id);
      if (BigInt(refunds.total.replace('.', '')) > 0n)
        throw new FinancialError('Expense has posted Refunds', 'TRANSACTION_HAS_POSTED_REFUNDS');
    }
    const after = await ctx.transactions.void(id, input.version, input.reason, this.now());
    if (!after) throw new FinancialError('Stale Transaction version', 'VERSION_CONFLICT');
    const snapshot = transactionSnapshot(after);
    await ctx.audit.write({
      id: uuidv7(),
      createdAt: this.now(),
      entityType: 'transaction',
      entityId: id,
      action: 'TRANSACTION_VOIDED',
      source: provenance ? 'whatsapp' : 'direct_api',
      actorReference: provenance?.senderReference ?? null,
      oldData: transactionSnapshot(before),
      newData: snapshot,
      correlationId,
    });
    await ctx.idempotencyKeys.complete({
      id: claim.id,
      resourceType: 'transaction',
      resourceId: id,
      responseStatus: 200,
      responseBody: snapshot,
      completedAt: this.now(),
    });
    return after;
  }
}
