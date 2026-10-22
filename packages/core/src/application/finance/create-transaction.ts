import { v7 as uuidv7 } from 'uuid';
import type { HumanRefGenerator } from '../../domain/finance/human-ref.js';
import { FinancialValidationError } from '../../domain/finance/errors.js';
import type {
  FinancialTransactionContext,
  FinancialTransactionPort,
} from '../ports/financial-transaction-port.js';
import type { CreateTransactionInput, TransactionRecord } from '../ports/transaction-ports.js';
import { createExpense } from './create-expense.js';
import { createOrdinaryIncome } from './create-income.js';
import { createTransfer } from './create-transfer.js';
import {
  decideExistingIdempotency,
  fingerprintTransactionCreate,
  IdempotencyInProgressRetryError,
  resolveTransactionCreateScope,
  validateIdempotencyKey,
} from './idempotency.js';

export interface FinancialRequestContext {
  correlationId: string;
}

export interface GenericCreateDependencies {
  humanRefGenerator: HumanRefGenerator;
  now: () => Date;
  generateTransactionId?: () => string;
  generateIdempotencyId?: () => string;
  generateAuditId?: () => string;
  executeExpense?: typeof createExpense;
  executeIncome?: typeof createOrdinaryIncome;
  executeTransfer?: typeof createTransfer;
}

/** One JSON-safe logical representation for Audit and idempotency replay. */
export function transactionSnapshot(record: TransactionRecord): Record<string, unknown> {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    voidedAt: record.voidedAt?.toISOString() ?? null,
  };
}

function hydrateTransactionSnapshot(body: Record<string, unknown> | null): TransactionRecord {
  if (
    !body ||
    typeof body.id !== 'string' ||
    typeof body.humanRef !== 'string' ||
    typeof body.amount !== 'string' ||
    typeof body.createdAt !== 'string' ||
    typeof body.updatedAt !== 'string' ||
    !(body.voidedAt === null || typeof body.voidedAt === 'string')
  ) {
    throw new Error('Invalid persisted idempotency Transaction result');
  }
  const createdAt = new Date(body.createdAt);
  const updatedAt = new Date(body.updatedAt);
  const voidedAt = body.voidedAt === null ? null : new Date(body.voidedAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    Number.isNaN(updatedAt.getTime()) ||
    (voidedAt && Number.isNaN(voidedAt.getTime()))
  ) {
    throw new Error('Invalid persisted idempotency Transaction timestamp');
  }
  return { ...body, createdAt, updatedAt, voidedAt } as unknown as TransactionRecord;
}

/** Sole production generic-create owner of the outer financial transaction. */
export class GenericCreateTransaction {
  constructor(
    private readonly financialTransactions: FinancialTransactionPort,
    private readonly deps: GenericCreateDependencies,
  ) {}

  async execute(
    input: CreateTransactionInput,
    idempotencyKey: unknown,
    requestContext: FinancialRequestContext,
  ): Promise<TransactionRecord> {
    if (!input || !['expense', 'income', 'transfer'].includes(input.type)) {
      throw new FinancialValidationError('Invalid Transaction type', 'type');
    }
    const key = validateIdempotencyKey(idempotencyKey);
    const scope = resolveTransactionCreateScope();
    const fingerprint = fingerprintTransactionCreate(input);

    return this.financialTransactions.runInTransaction(async (ctx) => {
      const claim = await ctx.idempotencyKeys.create({
        id: (this.deps.generateIdempotencyId ?? uuidv7)(),
        idempotencyKey: key,
        scope,
        requestHash: fingerprint,
        createdAt: this.deps.now(),
      });

      if (!claim) {
        const existing = await ctx.idempotencyKeys.findByKeyAndScopeForUpdate(key, scope);
        if (!existing) throw new IdempotencyInProgressRetryError();
        const decision = decideExistingIdempotency(existing, fingerprint);
        if (decision.kind === 'retry') throw new IdempotencyInProgressRetryError();
        if (
          decision.record.responseStatus !== 201 ||
          decision.record.resourceType !== 'transaction'
        ) {
          throw new Error('Invalid persisted idempotency completion');
        }
        const replay = hydrateTransactionSnapshot(decision.record.responseBody);
        if (replay.id !== decision.record.resourceId) {
          throw new Error('Idempotency result resource mismatch');
        }
        return replay;
      }

      const executorDeps = {
        humanRefGenerator: this.deps.humanRefGenerator,
        now: this.deps.now(),
        generateId: this.deps.generateTransactionId ?? uuidv7,
      };
      const record = await this.dispatch(input, ctx, executorDeps);
      const snapshot = transactionSnapshot(record);
      await ctx.audit.write({
        id: (this.deps.generateAuditId ?? uuidv7)(),
        createdAt: this.deps.now(),
        entityType: 'transaction',
        entityId: record.id,
        action: 'TRANSACTION_CREATED',
        source: 'direct_api',
        actorReference: null,
        oldData: null,
        newData: snapshot,
        correlationId: requestContext.correlationId,
      });
      await ctx.idempotencyKeys.complete({
        id: claim.id,
        resourceType: 'transaction',
        resourceId: record.id,
        responseStatus: 201,
        responseBody: snapshot,
        completedAt: this.deps.now(),
      });
      return record;
    });
  }

  private dispatch(
    input: CreateTransactionInput,
    ctx: FinancialTransactionContext,
    deps: { humanRefGenerator: HumanRefGenerator; now: Date; generateId: () => string },
  ): Promise<TransactionRecord> {
    switch (input.type) {
      case 'expense':
        return (this.deps.executeExpense ?? createExpense)(input, ctx, deps);
      case 'income':
        return (this.deps.executeIncome ?? createOrdinaryIncome)(input, ctx, deps);
      case 'transfer':
        return (this.deps.executeTransfer ?? createTransfer)(input, ctx, deps);
    }
  }
}
