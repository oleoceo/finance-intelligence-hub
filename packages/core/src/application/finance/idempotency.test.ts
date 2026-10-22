import { describe, expect, it } from 'vitest';
import type { CreateTransactionInput, IdempotencyKeyRecord } from '../../index.js';
import {
  canonicalJson,
  canonicalTransactionCreate,
  decideExistingIdempotency,
  fingerprintTransactionCreate,
  resolveTransactionCreateScope,
  validateIdempotencyKey,
} from './idempotency.js';

const expense: CreateTransactionInput = {
  type: 'expense',
  bookId: 'book',
  accountId: 'account',
  amount: '35',
  description: 'payment note',
  transactionDate: '2026-10-21',
};

const record: IdempotencyKeyRecord = {
  id: 'id',
  idempotencyKey: 'key',
  scope: 'transactions:create',
  requestHash: 'hash',
  status: 'completed',
  resourceType: 'transaction',
  resourceId: 'resource',
  responseStatus: 201,
  responseBody: { data: { id: 'resource' } },
  createdAt: new Date('2026-10-21T00:00:00Z'),
  completedAt: new Date('2026-10-21T00:00:01Z'),
};

describe('M04-T06 canonical direct create fingerprint', () => {
  it('uses the one fixed scope', () => {
    expect(resolveTransactionCreateScope()).toBe('transactions:create');
  });

  it('sorts object keys recursively without changing array order or strings', () => {
    expect(canonicalJson({ z: [{ b: 1, a: ' x ' }], a: null })).toBe(
      canonicalJson({ a: null, z: [{ a: ' x ', b: 1 }] }),
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('canonicalizes Money without currency or floating point', () => {
    expect(fingerprintTransactionCreate(expense)).toBe(
      fingerprintTransactionCreate({ ...expense, amount: '35.0' }),
    );
    expect(fingerprintTransactionCreate(expense)).toBe(
      fingerprintTransactionCreate({ ...expense, amount: '35.00' }),
    );
    expect(canonicalTransactionCreate(expense).amount).toBe('35.00');
    expect(fingerprintTransactionCreate(expense)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves semantic whitespace in description and notes', () => {
    const hash = fingerprintTransactionCreate(expense);
    expect(fingerprintTransactionCreate({ ...expense, description: 'payment  note' })).not.toBe(hash);
    expect(fingerprintTransactionCreate({ ...expense, description: ' payment note' })).not.toBe(hash);
    expect(fingerprintTransactionCreate({ ...expense, notes: ' x' })).not.toBe(
      fingerprintTransactionCreate({ ...expense, notes: 'x' }),
    );
  });

  it.each(['categoryId', 'merchantId', 'notes', 'sourceReference'] as const)(
    'treats omitted %s and explicit null equally',
    (field) => {
      expect(fingerprintTransactionCreate(expense)).toBe(
        fingerprintTransactionCreate({ ...expense, [field]: null }),
      );
    },
  );

  it.each([
    { type: 'income' },
    { bookId: 'another-book' },
    { accountId: 'another-account' },
    { amount: '36' },
    { transactionDate: '2026-10-20' },
    { description: 'another payment' },
  ])('changes hash for changed required field %j', (change) => {
    expect(fingerprintTransactionCreate({ ...expense, ...change } as CreateTransactionInput)).not.toBe(
      fingerprintTransactionCreate(expense),
    );
  });

  it('includes destination for Transfer and omits category/merchant keys', () => {
    const transfer: CreateTransactionInput = {
      type: 'transfer',
      bookId: 'book',
      accountId: 'account',
      destinationAccountId: 'destination',
      amount: '35',
      description: 'move',
      transactionDate: '2026-10-21',
    };
    const shape = canonicalTransactionCreate(transfer);
    expect(shape).not.toHaveProperty('category_id');
    expect(shape).not.toHaveProperty('merchant_id');
    expect(fingerprintTransactionCreate(transfer)).not.toBe(
      fingerprintTransactionCreate({ ...transfer, destinationAccountId: 'other' }),
    );
  });
});

describe('M04-T06 key and existing decision', () => {
  it('preserves valid keys and accepts 255 Unicode code points', () => {
    expect(validateIdempotencyKey(' key ')).toBe(' key ');
    expect(validateIdempotencyKey('😀'.repeat(255))).toBe('😀'.repeat(255));
  });

  it.each(['', '  \t ', 'a'.repeat(256), '😀'.repeat(256), null, 3])(
    'rejects invalid key %j with VALIDATION_ERROR',
    (value) => {
      expect(() => validateIdempotencyKey(value)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    },
  );

  it('replays completed, retries matching in-progress, and conflicts on different hash', () => {
    expect(decideExistingIdempotency(record, 'hash')).toEqual({ kind: 'replay', record });
    expect(decideExistingIdempotency({ ...record, status: 'in_progress' }, 'hash')).toEqual({
      kind: 'retry',
    });
    expect(() => decideExistingIdempotency(record, 'different')).toThrow(
      expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    );
  });
});
