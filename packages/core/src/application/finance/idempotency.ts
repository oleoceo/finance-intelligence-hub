import { createHash } from 'node:crypto';
import { canonicalizeMoneyAmount } from '../../domain/finance/money.js';
import { FinancialError, FinancialValidationError } from '../../domain/finance/errors.js';
import type { CreateTransactionInput } from '../ports/transaction-ports.js';
import type {
  IdempotencyFingerprint,
  IdempotencyKeyRecord,
  IdempotencyScope,
} from '../ports/idempotency-ports.js';

export const TRANSACTION_CREATE_SCOPE: IdempotencyScope = 'transactions:create';

export function resolveTransactionCreateScope(): IdempotencyScope {
  return TRANSACTION_CREATE_SCOPE;
}

/** Keep the original key as its identity; trim is only used to detect blank input. */
export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || [...value].length > 255) {
    throw new FinancialValidationError('Invalid Idempotency-Key', 'idempotency_key');
  }
  // A lone UTF-16 surrogate cannot represent a UTF-8 character.
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new FinancialValidationError('Invalid Idempotency-Key', 'idempotency_key');
    }
  }
  return value;
}

/** Stable JSON for the bounded canonical command shape. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Undefined value in canonical JSON');
  return serialized;
}

export function canonicalTransactionCreate(input: CreateTransactionInput): Record<string, unknown> {
  const common = {
    type: input.type,
    book_id: input.bookId,
    account_id: input.accountId,
    amount: canonicalizeMoneyAmount(input.amount),
    description: input.description,
    transaction_date: input.transactionDate,
    notes: input.notes ?? null,
    source_reference: input.sourceReference ?? null,
  };
  if (input.type === 'transfer') {
    return { ...common, destination_account_id: input.destinationAccountId };
  }
  return {
    ...common,
    category_id: input.categoryId ?? null,
    merchant_id: input.merchantId ?? null,
  };
}

/** Input must already be validated by the generic-create boundary. */
export function fingerprintTransactionCreate(
  input: CreateTransactionInput,
): IdempotencyFingerprint {
  return createHash('sha256')
    .update(canonicalJson(canonicalTransactionCreate(input)))
    .digest('hex');
}

export type ExistingIdempotencyDecision =
  { kind: 'replay'; record: IdempotencyKeyRecord } | { kind: 'retry' };

/** T07 throws this signal to restart the entire outer transaction after a locked read. */
export class IdempotencyInProgressRetryError extends Error {
  constructor() {
    super('Idempotency key is still in progress');
    this.name = 'IdempotencyInProgressRetryError';
  }
}

export function decideExistingIdempotency(
  existing: IdempotencyKeyRecord,
  fingerprint: IdempotencyFingerprint,
): ExistingIdempotencyDecision {
  if (existing.requestHash !== fingerprint) {
    throw new FinancialError(
      'Idempotency key already used for another request',
      'IDEMPOTENCY_CONFLICT',
    );
  }
  if (existing.status === 'in_progress') return { kind: 'retry' };
  return { kind: 'replay', record: existing };
}
