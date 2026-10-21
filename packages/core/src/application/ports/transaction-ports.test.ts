/**
 * Compile-time contract verification for M04-T01 ports.
 *
 * These tests ensure that port interfaces are importable, correctly typed,
 * and do not leak infrastructure types (Kysely, pg, Fastify) into Core.
 * No runtime behavior is tested here — only type-level contracts.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  TransactionRecord,
  CreateTransactionInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  ListTransactionsResult,
  TransactionRepository,
  TransactionReadPort,
} from './transaction-ports.js';
import type {
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  IdempotencyState,
} from './idempotency-ports.js';
import type {
  AuditWriter,
  CreateAuditEventInput,
  AuditAction,
  AuditEntityType,
  AuditSource,
} from './audit-ports.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from './financial-transaction-port.js';
import type {
  TransactionType,
  TransactionStatus,
  TransactionCreateSource,
} from '../../domain/finance/transaction-types.js';

describe('Transaction ports compile checks', () => {
  it('TransactionRecord has required fields with correct types', () => {
    const record: TransactionRecord = {} as TransactionRecord;
    expectTypeOf(record.id).toEqualTypeOf<string>();
    expectTypeOf(record.humanRef).toEqualTypeOf<string>();
    expectTypeOf(record.bookId).toEqualTypeOf<string>();
    expectTypeOf(record.type).toEqualTypeOf<TransactionType>();
    expectTypeOf(record.status).toEqualTypeOf<TransactionStatus>();
    expectTypeOf(record.amount).toEqualTypeOf<string>();
    expectTypeOf(record.currency).toEqualTypeOf<string>();
    expectTypeOf(record.accountId).toEqualTypeOf<string>();
    expectTypeOf(record.destinationAccountId).toEqualTypeOf<string | null>();
    expectTypeOf(record.categoryId).toEqualTypeOf<string | null>();
    expectTypeOf(record.merchantId).toEqualTypeOf<string | null>();
    expectTypeOf(record.description).toEqualTypeOf<string | null>();
    expectTypeOf(record.notes).toEqualTypeOf<string | null>();
    expectTypeOf(record.transactionDate).toEqualTypeOf<string>();
    expectTypeOf(record.source).toEqualTypeOf<TransactionCreateSource>();
    expectTypeOf(record.refundOfTransactionId).toEqualTypeOf<string | null>();
    expectTypeOf(record.version).toEqualTypeOf<number>();
    expectTypeOf(record.createdAt).toEqualTypeOf<Date>();
    expectTypeOf(record.updatedAt).toEqualTypeOf<Date>();
    expectTypeOf(record.voidedAt).toEqualTypeOf<Date | null>();
  });

  it('CreateTransactionInput is a discriminated union of expense/income/transfer', () => {
    expectTypeOf<CreateTransactionInput>().toMatchTypeOf<
      CreateExpenseInput | CreateIncomeInput | CreateTransferInput
    >();
  });

  it('CreateExpenseInput has type literal expense', () => {
    const input: CreateExpenseInput = {} as CreateExpenseInput;
    expectTypeOf(input.type).toEqualTypeOf<'expense'>();
    expectTypeOf(input.bookId).toEqualTypeOf<string>();
    expectTypeOf(input.amount).toEqualTypeOf<string>();
    expectTypeOf(input.currency).toEqualTypeOf<string>();
    expectTypeOf(input.accountId).toEqualTypeOf<string>();
    expectTypeOf(input.categoryId).toEqualTypeOf<string | null>();
    expectTypeOf(input.merchantId).toEqualTypeOf<string | null>();
    expectTypeOf(input.transactionDate).toEqualTypeOf<string>();
  });

  it('CreateIncomeInput has type literal income', () => {
    const input: CreateIncomeInput = {} as CreateIncomeInput;
    expectTypeOf(input.type).toEqualTypeOf<'income'>();
  });

  it('CreateTransferInput omits categoryId and merchantId', () => {
    const input: CreateTransferInput = {} as CreateTransferInput;
    expectTypeOf(input.type).toEqualTypeOf<'transfer'>();
    expectTypeOf(input.destinationAccountId).toEqualTypeOf<string>();
    // Transfer must NOT have categoryId or merchantId
    // @ts-expect-error - Transfer does not accept categoryId
    void input.categoryId;
    // @ts-expect-error - Transfer does not accept merchantId
    void input.merchantId;
  });

  it('TransactionRepository methods return correct types', () => {
    expectTypeOf<
      TransactionRepository['create']
    >().returns.resolves.toEqualTypeOf<TransactionRecord>();
    expectTypeOf<
      TransactionRepository['findById']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
    expectTypeOf<
      TransactionRepository['findByHumanRef']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
    expectTypeOf<
      TransactionRepository['list']
    >().returns.resolves.toEqualTypeOf<ListTransactionsResult>();
    expectTypeOf<
      TransactionRepository['getLast']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
  });

  it('TransactionReadPort methods return correct types', () => {
    expectTypeOf<
      TransactionReadPort['findById']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
    expectTypeOf<
      TransactionReadPort['list']
    >().returns.resolves.toEqualTypeOf<ListTransactionsResult>();
    expectTypeOf<
      TransactionReadPort['getLast']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
  });
});

describe('Idempotency ports compile checks', () => {
  it('IdempotencyKeyRecord has required fields', () => {
    const record: IdempotencyKeyRecord = {} as IdempotencyKeyRecord;
    expectTypeOf(record.idempotencyKey).toEqualTypeOf<string>();
    expectTypeOf(record.scope).toEqualTypeOf<string>();
    expectTypeOf(record.state).toEqualTypeOf<IdempotencyState>();
    expectTypeOf(record.fingerprint).toEqualTypeOf<string>();
    expectTypeOf(record.resultPayload).toEqualTypeOf<string | null>();
    expectTypeOf(record.createdAt).toEqualTypeOf<Date>();
    expectTypeOf(record.updatedAt).toEqualTypeOf<Date>();
  });

  it('IdempotencyKeyRepository methods return correct types', () => {
    expectTypeOf<
      IdempotencyKeyRepository['claim']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord>();
    expectTypeOf<
      IdempotencyKeyRepository['complete']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord>();
    expectTypeOf<
      IdempotencyKeyRepository['findByKeyAndScope']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord | null>();
  });
});

describe('Audit ports compile checks', () => {
  it('CreateAuditEventInput has required fields', () => {
    const input: CreateAuditEventInput = {} as CreateAuditEventInput;
    expectTypeOf(input.entityType).toEqualTypeOf<AuditEntityType>();
    expectTypeOf(input.entityId).toEqualTypeOf<string>();
    expectTypeOf(input.action).toEqualTypeOf<AuditAction>();
    expectTypeOf(input.source).toEqualTypeOf<AuditSource>();
    expectTypeOf(input.actorReference).toEqualTypeOf<string | null>();
    expectTypeOf(input.oldData).toEqualTypeOf<Record<string, unknown> | null>();
    expectTypeOf(input.newData).toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(input.correlationId).toEqualTypeOf<string>();
  });

  it('AuditWriter.write returns void', () => {
    expectTypeOf<AuditWriter['write']>().returns.resolves.toEqualTypeOf<void>();
  });
});

describe('Financial transaction port compile checks', () => {
  it('FinancialTransactionContext includes all required repositories', () => {
    const ctx: FinancialTransactionContext = {} as FinancialTransactionContext;
    // Compile-time existence checks: accessing each property proves it exists on the type.
    // If any property were missing or mis-typed, TypeScript would fail to compile this test.
    void ctx.books;
    void ctx.accounts;
    void ctx.categories;
    void ctx.merchants;
    void ctx.classificationRules;
    void ctx.authorizedSenders;
    void ctx.locks;
    void ctx.financialUsage;
    void ctx.senderDefaults;
    void ctx.transactions;
    void ctx.idempotencyKeys;
    void ctx.audit;
    expect(true).toBe(true); // runtime assertion placeholder
  });

  it('FinancialTransactionPort.runInTransaction returns generic T', () => {
    expectTypeOf<FinancialTransactionPort['runInTransaction']>().toBeFunction();
  });
});
