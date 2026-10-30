import type { CorrectTransaction } from '../finance/correct-transaction.js';
import { prepareCorrectionLocks } from '../finance/correct-transaction.js';
import type { VoidTransaction } from '../finance/void-transaction.js';
import { prepareVoidLocks } from '../finance/void-transaction.js';
import type { CreateRefund } from '../finance/create-refund.js';
import { prepareRefundLocks } from '../finance/create-refund.js';
import { FinancialError } from '../../domain/finance/errors.js';
import type { ConfirmationOwner } from '../ports/confirmation-ports.js';
import type { InboxProcessingContext } from '../ports/financial-transaction-port.js';
import type { InboxClaim, InboxMessage } from '../ports/inbox-ports.js';
import type { Interpretation } from '../ports/interpretation-ports.js';
import type { InboxProcessingResult } from './process-message.js';
import { resolveInterpretation } from './resolve-interpretation.js';
import {
  resolveMutation,
  type MutationIntent,
  type MutationProposal,
} from './transaction-mutation.js';

export interface MutationDependencies {
  correction: Pick<CorrectTransaction, 'executeInContext'>;
  voidTransaction: Pick<VoidTransaction, 'executeInContext'>;
  refund: Pick<CreateRefund, 'executeInContext'>;
}

type Stored = {
  intent: MutationIntent;
  targetId: string;
  targetVersion: number;
  humanRef: string;
  amount: string;
  currency: string;
  description: string;
  accountId?: string;
  accountName?: string;
  transactionDate?: string;
};
type Option = { number: '1' | '2'; id: string; name: string; version?: number };

function stored(proposal: MutationProposal): Stored {
  return {
    intent: proposal.intent,
    targetId: proposal.target.id,
    targetVersion: proposal.target.version,
    humanRef: proposal.target.humanRef,
    amount: proposal.target.amount,
    currency: proposal.target.currency,
    description: proposal.target.description,
    ...(proposal.accountId ? { accountId: proposal.accountId } : {}),
    ...(proposal.accountName ? { accountName: proposal.accountName } : {}),
    ...(proposal.transactionDate ? { transactionDate: proposal.transactionDate } : {}),
  };
}

function claimFields(claim: InboxClaim) {
  if (!claim.processingStartedAt) throw new Error('Inbox claim timestamp missing');
  return { attemptCount: claim.attemptCount, processingStartedAt: claim.processingStartedAt };
}

async function finish(
  ctx: InboxProcessingContext,
  claim: InboxClaim,
  now: Date,
  status: 'processed' | 'needs_confirmation',
) {
  const row = await ctx.inbox.transition({
    id: claim.message.id,
    ...claimFields(claim),
    status,
    now,
  });
  if (!row) throw new Error('Inbox claim became stale');
}

async function lockConfiguration(ctx: InboxProcessingContext, senderReference: string, now: Date) {
  await resolveInterpretation(
    {
      interpretation: { kind: 'query_last' },
      channel: 'whatsapp',
      senderReference,
      receivedAt: now,
      now,
    },
    { runInTransaction: async (fn) => fn(ctx) },
  );
}

function proposalAction(intent: MutationIntent): string {
  return `confirm_${intent.action}`;
}
function key(original: InboxMessage, action: string) {
  return `inbox:${original.id}:${action}`;
}

export class RefundRevalidationRequiredError extends Error {
  constructor(readonly sessionId: string) {
    super('Refund confirmation requires revalidation');
  }
}

async function staleTarget(
  ctx: InboxProcessingContext,
  claim: InboxClaim,
  owner: ConfirmationOwner,
  now: Date,
): Promise<InboxProcessingResult> {
  await ctx.confirmations.supersede({ ...owner, now });
  await finish(ctx, claim, now, 'processed');
  return { type: 'stale_target', inboxMessageId: claim.message.id, status: 'processed' };
}

/** Called only after the rejected financial transaction has fully rolled back. */
export async function resolveRejectedRefund(
  ctx: InboxProcessingContext,
  claim: InboxClaim,
  owner: ConfirmationOwner,
  sessionId: string,
  now: Date,
): Promise<InboxProcessingResult> {
  await lockConfiguration(ctx, claim.message.senderReference, now);
  const reply = await ctx.confirmations.resolveReply({
    ...owner,
    resolverInboxMessageId: claim.message.id,
    ...claimFields(claim),
    reply: 'yes',
    now,
  });
  if (reply.kind === 'stale_claim')
    return { type: 'stale_claim', inboxMessageId: claim.message.id };
  if (reply.kind === 'none')
    return { type: 'ignored', inboxMessageId: claim.message.id, status: 'ignored' };
  if (reply.kind === 'expired' || reply.kind === 'cancelled')
    return { type: reply.kind, inboxMessageId: claim.message.id, status: 'processed' };
  if (reply.session.id !== sessionId) throw new Error('Refund confirmation changed during retry');
  return staleTarget(ctx, claim, owner, now);
}

async function prepare(ctx: InboxProcessingContext, value: Stored) {
  const { intent, targetId, targetVersion } = value;
  if (intent.action === 'correction')
    return prepareCorrectionLocks(ctx, targetId, {
      version: targetVersion,
      amount: intent.amount!,
    });
  if (intent.action === 'void')
    return prepareVoidLocks(ctx, targetId, {
      version: targetVersion,
      reason: 'Cancelled by WhatsApp sender',
    });
  return prepareRefundLocks(ctx, targetId, {
    version: targetVersion,
    amount: intent.amount!,
    accountId: value.accountId!,
    transactionDate: value.transactionDate!,
    description: `Estorno da compra ${value.humanRef}`,
  });
}

async function execute(
  ctx: InboxProcessingContext,
  value: Stored,
  original: InboxMessage,
  correlationId: string,
  deps: MutationDependencies,
  receipt: object,
) {
  const { intent, targetId, targetVersion } = value;
  if (intent.action === 'correction') {
    const transaction = await deps.correction.executeInContext(
      targetId,
      { version: targetVersion, amount: intent.amount! },
      correlationId,
      ctx,
      { senderReference: original.senderReference },
      receipt,
    );
    return { transaction, action: 'TRANSACTION_UPDATED' as const };
  }
  if (intent.action === 'void') {
    const transaction = await deps.voidTransaction.executeInContext(
      targetId,
      { version: targetVersion, reason: 'Cancelled by WhatsApp sender' },
      key(original, 'void'),
      correlationId,
      ctx,
      { senderReference: original.senderReference },
      receipt,
    );
    return { transaction, action: 'TRANSACTION_VOIDED' as const };
  }
  const transaction = await deps.refund.executeInContext(
    targetId,
    {
      version: targetVersion,
      amount: intent.amount!,
      accountId: value.accountId!,
      transactionDate: value.transactionDate!,
      description: `Estorno da compra ${value.humanRef}`,
    },
    key(original, 'refund'),
    correlationId,
    ctx,
    {
      senderReference: original.senderReference,
      sourceReference: original.sourceMessageId,
      inboxMessageId: original.id,
    },
    receipt,
  );
  return { transaction, action: 'TRANSACTION_REFUND_CREATED' as const };
}

/** Handles only P05 intents and their pending replies; other Inbox paths remain with the existing processor. */
export async function processTransactionMutation(
  ctx: InboxProcessingContext,
  parsed: Interpretation,
  claim: InboxClaim,
  owner: ConfirmationOwner,
  correlationId: string,
  now: Date,
  id: () => string,
  deps: MutationDependencies,
): Promise<InboxProcessingResult | null> {
  const message = claim.message;
  const preview = await ctx.previewPending(owner);
  const pending = preview?.payload as
    | { mutation?: Stored; accountTarget?: Stored; intent?: MutationIntent; options?: Option[] }
    | undefined;
  const isMutationReply = parsed.kind === 'reply' && !!pending?.intent;
  if (parsed.kind !== 'transaction_mutation' && !isMutationReply) return null;
  // Every configuration row is locked before Sender/Session/Inbox rows.
  await lockConfiguration(ctx, message.senderReference, now);
  const sender = await ctx.authorizedSenders.findByChannelAndReference(
    'whatsapp',
    message.senderReference,
  );
  if (!sender?.active || sender.id !== message.authorizedSenderId)
    throw new Error('Sender is no longer authorized');
  const current = await ctx.inbox.findById(message.id);
  if (
    !current ||
    current.status !== 'processing' ||
    current.attemptCount !== claim.attemptCount ||
    current.processingStartedAt?.getTime() !== claim.processingStartedAt?.getTime()
  )
    throw new Error('Inbox claim became stale');
  await ctx.interpretations.create({
    id: id(),
    inboxMessageId: message.id,
    attemptNumber: claim.attemptCount,
    interpretation: parsed,
    now,
  });

  if (parsed.kind === 'transaction_mutation') {
    const resolved = await resolveMutation(ctx, parsed, message.senderReference, now);
    const direct =
      resolved.kind === 'proposal' && parsed.action === 'correction'
        ? stored(resolved.value)
        : null;
    const directReceipt = direct ? await prepare(ctx, direct) : null;
    await ctx.confirmations.supersede({ ...owner, now });
    if (resolved.kind === 'proposal') {
      const value = stored(resolved.value);
      if (parsed.action === 'correction') {
        const result = await execute(ctx, value, message, correlationId, deps, directReceipt!);
        await finish(ctx, claim, now, 'processed');
        return {
          type: 'transaction_mutated',
          inboxMessageId: message.id,
          status: 'processed',
          transaction: result.transaction,
          action: parsed.action,
        };
      }
      await finish(ctx, claim, now, 'needs_confirmation');
      const session = await ctx.confirmations.create({
        ...owner,
        id: id(),
        inboxMessageId: message.id,
        action: proposalAction(parsed),
        payload: { intent: parsed, mutation: value },
        targetEntityType: 'transaction',
        targetEntityId: value.targetId,
        targetVersion: value.targetVersion,
        now,
      });
      return {
        type: 'confirmation_required',
        inboxMessageId: message.id,
        status: 'needs_confirmation',
        confirmation: {
          id: session.id,
          action: session.action,
          expiresAt: session.expiresAt,
          proposal: value,
        },
      };
    }
    await finish(ctx, claim, now, 'needs_confirmation');
    const options: Option[] =
      resolved.kind === 'choice'
        ? resolved.options.map((row, index) => ({
            number: index === 0 ? '1' : '2',
            id: row.id,
            name: row.humanRef,
            version: row.version,
          }))
        : resolved.kind === 'account_choice'
          ? resolved.options.map((row, index) => ({
              number: index === 0 ? '1' : '2',
              id: row.id,
              name: row.name,
            }))
          : [];
    const action =
      resolved.kind === 'account_choice'
        ? 'select_refund_account'
        : options.length
          ? 'select_transaction'
          : 'clarify_transaction';
    const accountTarget: Stored | undefined =
      resolved.kind === 'account_choice'
        ? {
            intent: parsed,
            targetId: resolved.target.id,
            targetVersion: resolved.target.version,
            humanRef: resolved.target.humanRef,
            amount: resolved.target.amount,
            currency: resolved.target.currency,
            description: resolved.target.description,
            transactionDate: resolved.transactionDate,
          }
        : undefined;
    const session = await ctx.confirmations.create({
      ...owner,
      id: id(),
      inboxMessageId: message.id,
      action,
      payload: { intent: parsed, options, ...(accountTarget ? { accountTarget } : {}) },
      ...(accountTarget
        ? {
            targetEntityType: 'transaction',
            targetEntityId: accountTarget.targetId,
            targetVersion: accountTarget.targetVersion,
          }
        : {}),
      now,
    });
    return {
      type: 'confirmation_required',
      inboxMessageId: message.id,
      status: 'needs_confirmation',
      confirmation: {
        id: session.id,
        action,
        expiresAt: session.expiresAt,
        options: options.length ? options : undefined,
      },
    };
  }

  const original = preview ? await ctx.inbox.findById(preview.inboxMessageId) : null;
  if (!preview || !original || !pending?.intent) return null;
  const value = pending.mutation;
  const selectedOption =
    parsed.response === '1' || parsed.response === '2'
      ? pending.options?.find((row) => row.number === parsed.response)
      : undefined;
  const selectedTarget =
    selectedOption && !pending.accountTarget ? await ctx.reads.findById(selectedOption.id) : null;
  const selectedTargetChanged =
    selectedTarget &&
    selectedOption?.version !== undefined &&
    selectedTarget.version !== selectedOption.version;
  const chosen =
    selectedTarget?.status === 'posted' && !selectedTargetChanged
      ? await resolveMutation(
          ctx,
          {
            ...pending.intent,
            target: 'reference',
            humanRef: selectedTarget.humanRef,
            context: undefined,
          },
          original.senderReference,
          now,
        )
      : null;
  const receipt = value && parsed.response === 'yes' ? await prepare(ctx, value) : null;
  const reply = await ctx.confirmations.resolveReply({
    ...owner,
    resolverInboxMessageId: message.id,
    ...claimFields(claim),
    reply: parsed.response,
    now,
  });
  if (reply.kind === 'stale_claim') return { type: 'stale_claim', inboxMessageId: message.id };
  if (reply.kind === 'none')
    return { type: 'ignored', inboxMessageId: message.id, status: 'ignored' };
  if (reply.kind === 'expired' || reply.kind === 'cancelled')
    return { type: reply.kind, inboxMessageId: message.id, status: 'processed' };
  if (
    reply.session.id !== preview.id ||
    JSON.stringify(reply.session.payload) !== JSON.stringify(preview.payload)
  )
    throw new Error('Confirmation changed during reply');
  if (reply.kind === 'choice') {
    if (selectedTargetChanged) {
      return staleTarget(ctx, claim, owner, now);
    }
    if (pending.accountTarget && selectedOption) {
      const target = await ctx.transactions.findById(pending.accountTarget.targetId);
      if (
        !target ||
        target.version !== pending.accountTarget.targetVersion ||
        target.status !== 'posted'
      )
        return staleTarget(ctx, claim, owner, now);
      const selected = {
        ...pending.accountTarget,
        accountId: selectedOption.id,
        accountName: selectedOption.name,
      };
      const action = 'confirm_refund';
      const advanced = await ctx.confirmations.advanceChoice({
        ...owner,
        sessionId: reply.session.id,
        resolverInboxMessageId: message.id,
        ...claimFields(claim),
        action,
        payload: { intent: pending.intent, mutation: selected },
        targetEntityId: selected.targetId,
        targetVersion: selected.targetVersion,
        now,
      });
      return {
        type: 'confirmation_required',
        inboxMessageId: original.id,
        status: 'needs_confirmation',
        confirmation: {
          id: advanced.id,
          action,
          expiresAt: advanced.expiresAt,
          proposal: selected,
        },
      };
    }
    if (chosen?.kind === 'account_choice' && !value) {
      const accountOptions: Option[] = chosen.options.map((row, index) => ({
        number: index === 0 ? '1' : '2',
        id: row.id,
        name: row.name,
      }));
      const accountTarget: Stored = {
        intent: pending.intent,
        targetId: chosen.target.id,
        targetVersion: chosen.target.version,
        humanRef: chosen.target.humanRef,
        amount: chosen.target.amount,
        currency: chosen.target.currency,
        description: chosen.target.description,
        transactionDate: chosen.transactionDate,
      };
      const advanced = await ctx.confirmations.advanceChoice({
        ...owner,
        sessionId: reply.session.id,
        resolverInboxMessageId: message.id,
        ...claimFields(claim),
        action: 'select_refund_account',
        payload: { intent: pending.intent, accountTarget, options: accountOptions },
        targetEntityId: accountTarget.targetId,
        targetVersion: accountTarget.targetVersion,
        now,
      });
      return {
        type: 'confirmation_required',
        inboxMessageId: original.id,
        status: 'needs_confirmation',
        confirmation: {
          id: advanced.id,
          action: advanced.action,
          expiresAt: advanced.expiresAt,
          options: accountOptions,
        },
      };
    }
    if (!selectedOption || value || chosen?.kind !== 'proposal') {
      await finish(ctx, claim, now, 'processed');
      return {
        type: 'confirmation_required',
        inboxMessageId: original.id,
        status: 'needs_confirmation',
        confirmation: {
          id: reply.session.id,
          action: reply.session.action,
          expiresAt: reply.session.expiresAt,
        },
      };
    }
    const selected = stored(chosen.value);
    const action = proposalAction(pending.intent);
    const advanced = await ctx.confirmations.advanceChoice({
      ...owner,
      sessionId: reply.session.id,
      resolverInboxMessageId: message.id,
      ...claimFields(claim),
      action,
      payload: { intent: pending.intent, mutation: selected },
      targetEntityId: selected.targetId,
      targetVersion: selected.targetVersion,
      now,
    });
    return {
      type: 'confirmation_required',
      inboxMessageId: original.id,
      status: 'needs_confirmation',
      confirmation: { id: advanced.id, action, expiresAt: advanced.expiresAt, proposal: selected },
    };
  }
  if (!value || !receipt) {
    await finish(ctx, claim, now, 'processed');
    return {
      type: 'confirmation_required',
      inboxMessageId: original.id,
      status: 'needs_confirmation',
      confirmation: {
        id: reply.session.id,
        action: reply.session.action,
        expiresAt: reply.session.expiresAt,
      },
    };
  }
  if (
    reply.session.targetEntityId !== value.targetId ||
    reply.session.targetVersion !== value.targetVersion
  )
    throw new Error('Confirmation target mismatch');
  const currentTarget = await ctx.transactions.findById(value.targetId);
  if (
    !currentTarget ||
    currentTarget.version !== value.targetVersion ||
    currentTarget.status !== 'posted'
  ) {
    return staleTarget(ctx, claim, owner, now);
  }
  let result: Awaited<ReturnType<typeof execute>>;
  try {
    result = await execute(ctx, value, original, correlationId, deps, receipt);
  } catch (error) {
    if (
      value.intent.action === 'refund' &&
      error instanceof FinancialError &&
      [
        'REFUND_AMOUNT_EXCEEDED',
        'REFUND_INVALID_TARGET',
        'VERSION_CONFLICT',
        'ACCOUNT_NOT_FOUND',
        'ACCOUNT_INACTIVE',
        'BOOK_NOT_FOUND',
        'BOOK_INACTIVE',
      ].includes(error.code)
    )
      throw new RefundRevalidationRequiredError(reply.session.id);
    throw error;
  }
  await ctx.confirmations.finalizeConfirmed({
    ...owner,
    sessionId: reply.session.id,
    resolverInboxMessageId: message.id,
    ...claimFields(claim),
    now,
    proof: {
      resultId: result.transaction.id,
      action: result.action,
      resultVersion: result.transaction.version,
      correlationId,
    },
  });
  return {
    type: 'transaction_mutated',
    inboxMessageId: message.id,
    status: 'processed',
    transaction: result.transaction,
    action: value.intent.action,
  };
}
