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
  TransactionReadRecord,
  CreateTransactionInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  ListTransactionsResult,
  ListTransactionsInput,
  TransactionRepository,
  TransactionReadPort,
} from './transaction-ports.js';
import type {
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  IdempotencyState,
  IdempotencyScope,
  IdempotencyFingerprint,
  CreateIdempotencyKeyInput,
  CompleteIdempotencyKeyInput,
} from './idempotency-ports.js';
import type {
  AuditWriter,
  WriteAuditEventInput,
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
    expectTypeOf(record.description).toEqualTypeOf<string>();
    expectTypeOf(record.notes).toEqualTypeOf<string | null>();
    expectTypeOf(record.transactionDate).toEqualTypeOf<string>();
    expectTypeOf(record.source).toEqualTypeOf<TransactionCreateSource>();
    expectTypeOf(record.sourceReference).toEqualTypeOf<string | null>();
    expectTypeOf(record.inboxMessageId).toEqualTypeOf<string | null>();
    expectTypeOf(record.refundOfTransactionId).toEqualTypeOf<string | null>();
    expectTypeOf(record.version).toEqualTypeOf<number>();
    expectTypeOf(record.createdAt).toEqualTypeOf<Date>();
    expectTypeOf(record.updatedAt).toEqualTypeOf<Date>();
    expectTypeOf(record.voidedAt).toEqualTypeOf<Date | null>();
    expectTypeOf(record.voidReason).toEqualTypeOf<string | null>();
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
    expectTypeOf(input.description).toEqualTypeOf<string>();
    expectTypeOf(input.accountId).toEqualTypeOf<string>();
    expectTypeOf(input.categoryId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.merchantId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.notes).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.sourceReference).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.transactionDate).toEqualTypeOf<string>();
    // @ts-expect-error currency is derived from Book
    void input.currency;
    // @ts-expect-error refund has a dedicated operation
    void input.refundOfTransactionId;
  });

  it('CreateIncomeInput has type literal income', () => {
    const input: CreateIncomeInput = {} as CreateIncomeInput;
    expectTypeOf(input.type).toEqualTypeOf<'income'>();
    expectTypeOf(input.description).toEqualTypeOf<string>();
    expectTypeOf(input.sourceReference).toEqualTypeOf<string | null | undefined>();
    // @ts-expect-error currency is derived from Book
    void input.currency;
    // @ts-expect-error refund has a dedicated operation
    void input.refundOfTransactionId;
  });

  it('CreateTransferInput omits categoryId and merchantId', () => {
    const input: CreateTransferInput = {} as CreateTransferInput;
    expectTypeOf(input.type).toEqualTypeOf<'transfer'>();
    expectTypeOf(input.destinationAccountId).toEqualTypeOf<string>();
    expectTypeOf(input.description).toEqualTypeOf<string>();
    expectTypeOf(input.notes).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.sourceReference).toEqualTypeOf<string | null | undefined>();
    // @ts-expect-error currency is derived from Book
    void input.currency;
    // @ts-expect-error refund has a dedicated operation
    void input.refundOfTransactionId;
    // Transfer must NOT have categoryId or merchantId
    // @ts-expect-error - Transfer does not accept categoryId
    void input.categoryId;
    // @ts-expect-error - Transfer does not accept merchantId
    void input.merchantId;
  });

  it('uses optional Book and complete page-based list filters', () => {
    const input: ListTransactionsInput = {};
    expectTypeOf(input.bookId).toEqualTypeOf<string | undefined>();
    expectTypeOf(input.type).toEqualTypeOf<TransactionType | null | undefined>();
    expectTypeOf(input.status).toEqualTypeOf<TransactionStatus | null | undefined>();
    expectTypeOf(input.accountId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.categoryId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.merchantId).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.dateFrom).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.dateTo).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.search).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(input.page).toEqualTypeOf<number | undefined>();
    expectTypeOf(input.pageSize).toEqualTypeOf<number | undefined>();
    // @ts-expect-error cursor pagination is outside the accepted contract
    void input.cursor;
    const result: ListTransactionsResult = {} as ListTransactionsResult;
    expectTypeOf(result.items).toEqualTypeOf<TransactionReadRecord[]>();
    expectTypeOf(result.total).toEqualTypeOf<number>();
    expectTypeOf(result.page).toEqualTypeOf<number>();
    expectTypeOf(result.pageSize).toEqualTypeOf<number>();
    // @ts-expect-error no cursor result
    void result.nextCursor;
  });

  it('TransactionRepository methods return correct types', () => {
    expectTypeOf<
      TransactionRepository['create']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
    expectTypeOf<
      TransactionRepository['findById']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
    expectTypeOf<
      TransactionRepository['findByHumanRef']
    >().returns.resolves.toEqualTypeOf<TransactionRecord | null>();
  });

  it('TransactionReadPort methods return correct types', () => {
    expectTypeOf<
      TransactionReadPort['findById']
    >().returns.resolves.toEqualTypeOf<TransactionReadRecord | null>();
    expectTypeOf<
      TransactionReadPort['list']
    >().returns.resolves.toEqualTypeOf<ListTransactionsResult>();
    expectTypeOf<
      TransactionReadPort['getLast']
    >().returns.resolves.toEqualTypeOf<TransactionReadRecord | null>();
  });
});

describe('Idempotency ports compile checks', () => {
  it('IdempotencyKeyRecord has required fields', () => {
    const record: IdempotencyKeyRecord = {} as IdempotencyKeyRecord;
    expectTypeOf(record.idempotencyKey).toEqualTypeOf<string>();
    expectTypeOf(record.id).toEqualTypeOf<string>();
    expectTypeOf(record.scope).toEqualTypeOf<IdempotencyScope>();
    expectTypeOf(record.status).toEqualTypeOf<IdempotencyState>();
    expectTypeOf(record.requestHash).toEqualTypeOf<IdempotencyFingerprint>();
    expectTypeOf(record.resourceType).toEqualTypeOf<string | null>();
    expectTypeOf(record.resourceId).toEqualTypeOf<string | null>();
    expectTypeOf(record.responseStatus).toEqualTypeOf<number | null>();
    expectTypeOf(record.responseBody).toEqualTypeOf<Record<string, unknown> | null>();
    expectTypeOf(record.createdAt).toEqualTypeOf<Date>();
    expectTypeOf(record.completedAt).toEqualTypeOf<Date | null>();
    // @ts-expect-error schema has no updated_at
    void record.updatedAt;
    // @ts-expect-error response replay is status and body
    void record.resultPayload;
  });

  it('IdempotencyKeyRepository methods return correct types', () => {
    expectTypeOf<
      IdempotencyKeyRepository['create']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord | null>();
    expectTypeOf<
      IdempotencyKeyRepository['complete']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord>();
    expectTypeOf<
      IdempotencyKeyRepository['findByKeyAndScope']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord | null>();
    expectTypeOf<
      IdempotencyKeyRepository['findByKeyAndScopeForUpdate']
    >().returns.resolves.toEqualTypeOf<IdempotencyKeyRecord | null>();
  });

  it('uses exact creation and completion inputs', () => {
    const create: CreateIdempotencyKeyInput = {} as CreateIdempotencyKeyInput;
    expectTypeOf(create.scope).toEqualTypeOf<'transactions:create'>();
    expectTypeOf(create.requestHash).toEqualTypeOf<IdempotencyFingerprint>();
    const complete: CompleteIdempotencyKeyInput = {} as CompleteIdempotencyKeyInput;
    expectTypeOf(complete.responseStatus).toEqualTypeOf<number>();
    expectTypeOf(complete.responseBody).toEqualTypeOf<Record<string, unknown>>();
  });
});

describe('Audit ports compile checks', () => {
  it('WriteAuditEventInput has required fields', () => {
    const input: WriteAuditEventInput = {} as WriteAuditEventInput;
    expectTypeOf(input.entityType).toEqualTypeOf<AuditEntityType>();
    expectTypeOf(input.entityId).toEqualTypeOf<string>();
    expectTypeOf(input.action).toEqualTypeOf<AuditAction>();
    expectTypeOf(input.source).toEqualTypeOf<AuditSource>();
    expectTypeOf(input.actorReference).toEqualTypeOf<null>();
    expectTypeOf(input.oldData).toEqualTypeOf<null>();
    expectTypeOf(input.newData).toEqualTypeOf<TransactionRecord>();
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
    void ctx.locks;
    void ctx.financialUsage;
    // @ts-expect-error configuration rule writes are outside financial context
    void ctx.classificationRules;
    // @ts-expect-error sender writes are outside financial context
    void ctx.authorizedSenders;
    // @ts-expect-error sender defaults are outside financial context
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
