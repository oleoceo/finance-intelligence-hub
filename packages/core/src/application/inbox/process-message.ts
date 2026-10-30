import { v7 as uuidv7 } from 'uuid';
import type { GenericCreateTransaction } from '../finance/create-transaction.js';
import type {
  InboxProcessingContext,
  InboxProcessingPort,
} from '../ports/financial-transaction-port.js';
import type { InboxClaim, InboxTransactionPort, InboxMessage } from '../ports/inbox-ports.js';
import type {
  CreateCandidate,
  Interpretation,
  ResolutionResult,
} from '../ports/interpretation-ports.js';
import type { TransactionReadRecord, TransactionRecord } from '../ports/transaction-ports.js';
import {
  claimInboxMessage,
  SenderNotAuthorizedError,
  type IngestionEnvelope,
} from './claim-inbox-message.js';
import { interpretMessage } from './interpret-message.js';
import { resolveInterpretation } from './resolve-interpretation.js';
import { presentInboxReply, REPLY_CONTRACT_VERSION, REPLY_TEXT_LIMIT } from './present-reply.js';
import {
  processTransactionMutation,
  type MutationDependencies,
} from './process-transaction-mutation.js';

export type InboxProcessingResult = (
  | {
      type:
        | 'ignored'
        | 'duplicate_message'
        | 'processing'
        | 'stale_claim'
        | 'cancelled'
        | 'expired'
        | 'choice';
      inboxMessageId?: string;
      status?: string;
    }
  | {
      type: 'transaction_created';
      inboxMessageId: string;
      status: 'processed';
      transaction: TransactionRecord;
    }
  | {
      type: 'query_last';
      inboxMessageId: string;
      status: 'processed';
      transaction: TransactionReadRecord | null;
    }
  | {
      type: 'transaction_mutated';
      inboxMessageId: string;
      status: 'processed';
      action: 'correction' | 'void' | 'refund';
      transaction: TransactionRecord;
    }
  | { type: 'stale_target'; inboxMessageId: string; status: 'processed' }
  | {
      type: 'confirmation_required';
      inboxMessageId: string;
      status: 'needs_confirmation';
      confirmation: {
        id: string;
        action: string;
        expiresAt: Date;
        options?: ChoiceOption[];
        proposal?: {
          intent: { action: 'correction' | 'void' | 'refund'; amount?: string };
          humanRef: string;
          amount: string;
          currency: string;
          description: string;
          accountName?: string;
          transactionDate?: string;
        };
      };
    }
) & {
  replyText?: string | null;
  replyContract?: { version: string; maxCodePoints: number };
};

type ChoiceOption = { number: '1' | '2'; id: string; name: string };

function offeredOptions(
  ctx: InboxProcessingContext,
  interpretation: Interpretation,
  resolution: ResolutionResult | null,
  senderReference: string,
): Promise<ChoiceOption[]> {
  if (
    !resolution ||
    resolution.kind !== 'clarification' ||
    (interpretation.kind === 'create_transaction' &&
      (!interpretation.amount || !interpretation.description)) ||
    (resolution.field !== 'book' && resolution.field !== 'account')
  )
    return Promise.resolve([]);
  return (async () => {
    const books = (await ctx.books.find()).filter((book) => book.active);
    const explicitBook =
      interpretation.kind === 'create_transaction' ? interpretation.book?.value : undefined;
    const sender = await ctx.authorizedSenders.findByChannelAndReference(
      'whatsapp',
      senderReference,
    );
    const effectiveBook = explicitBook
      ? books.find(
          (book) =>
            book.id === explicitBook ||
            book.normalizedName === explicitBook.toLocaleLowerCase('pt-BR'),
        )
      : (books.find((book) => book.id === sender?.defaultBookId) ??
        (books.length === 1 ? books[0] : undefined));
    const rows =
      resolution.field === 'book'
        ? books
        : (await ctx.accounts.find()).filter(
            (account) =>
              account.active &&
              account.bookId === effectiveBook?.id &&
              account.currency === effectiveBook?.currency,
          );
    if (rows.length !== 2) return [];
    return rows
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row, index) => ({
        number: index === 0 ? '1' : '2',
        id: row.id,
        name: row.name,
      }));
  })();
}

function selectedInterpretation(
  interpretation: Interpretation,
  field: string,
  option: ChoiceOption,
): Interpretation | null {
  const value = { value: option.id, raw: option.name, provenance: 'explicit_input' as const };
  if (field === 'book' && interpretation.kind === 'query_last')
    return { ...interpretation, book: value };
  if (interpretation.kind !== 'create_transaction') return null;
  if (field !== 'book' && field !== 'account') return null;
  return { ...interpretation, [field]: value } as CreateCandidate;
}

export interface ProcessMessageDependencies {
  inboxTransactions: InboxTransactionPort;
  processing: InboxProcessingPort;
  genericCreate: Pick<GenericCreateTransaction, 'executeInContext'>;
  mutation?: MutationDependencies;
  now: () => Date;
  id?: () => string;
  staleTimeoutMs?: number;
}

function claimToken(claim: InboxClaim): {
  id: string;
  attemptCount: number;
  processingStartedAt: Date;
} {
  if (!claim.processingStartedAt) throw new Error('Inbox claim has no processing timestamp');
  return {
    id: claim.message.id,
    attemptCount: claim.attemptCount,
    processingStartedAt: claim.processingStartedAt,
  };
}

async function assertClaim(ctx: InboxProcessingContext, claim: InboxClaim): Promise<void> {
  const current = await ctx.inbox.findById(claim.message.id);
  if (
    !current ||
    current.status !== 'processing' ||
    current.attemptCount !== claim.attemptCount ||
    current.processingStartedAt?.getTime() !== claim.processingStartedAt?.getTime()
  )
    throw new StaleInboxClaimError();
}

export class StaleInboxClaimError extends Error {}

async function resolveInContext(
  ctx: InboxProcessingContext,
  interpretation: Interpretation,
  message: InboxMessage,
  now: Date,
): Promise<ResolutionResult> {
  return resolveInterpretation(
    {
      interpretation,
      channel: 'whatsapp',
      senderReference: message.senderReference,
      receivedAt: message.receivedAt,
      now,
    },
    { runInTransaction: async (fn) => fn(ctx) },
  );
}

async function authorized(ctx: InboxProcessingContext, message: InboxMessage): Promise<void> {
  const sender = await ctx.authorizedSenders.findByChannelAndReference(
    'whatsapp',
    message.senderReference,
  );
  if (!sender || !sender.active || sender.id !== message.authorizedSenderId)
    throw new SenderNotAuthorizedError();
}

async function finish(
  ctx: InboxProcessingContext,
  claim: InboxClaim,
  status: 'processed' | 'ignored' | 'needs_confirmation',
  now: Date,
): Promise<void> {
  const row = await ctx.inbox.transition({ ...claimToken(claim), status, now });
  if (!row) throw new StaleInboxClaimError();
}

/** P01 claim is committed first; every subsequent effect shares one outer transaction. */
async function processInboxMessageInternal(
  envelope: IngestionEnvelope,
  correlationId: string,
  deps: ProcessMessageDependencies,
): Promise<InboxProcessingResult> {
  const now = deps.now();
  const id = deps.id ?? uuidv7;
  const claim = await claimInboxMessage(envelope, deps.inboxTransactions, {
    id: id(),
    correlationId,
    now,
    staleTimeoutMs: deps.staleTimeoutMs ?? 60_000,
  });
  if (!claim) return { type: 'ignored' };
  if (!claim.claimed)
    return {
      type:
        claim.message.status === 'processed' ||
        claim.message.status === 'ignored' ||
        claim.message.status === 'needs_confirmation'
          ? 'duplicate_message'
          : 'processing',
      inboxMessageId: claim.message.id,
      status: claim.message.status,
    };

  try {
    return await deps.processing.runInboxTransaction(async (ctx) => {
      const message = claim.message;
      const parsed = interpretMessage(message);
      const owner = {
        channel: 'whatsapp',
        senderReference: message.senderReference,
        authorizedSenderId: message.authorizedSenderId,
      };
      if (deps.mutation) {
        const mutation = await processTransactionMutation(
          ctx,
          parsed,
          claim,
          owner,
          correlationId,
          now,
          id,
          deps.mutation,
        );
        if (mutation) return mutation;
      }
      const token = claimToken(claim);
      const preview = await ctx.previewPending(owner);
      const original = preview ? await ctx.inbox.findById(preview.inboxMessageId) : null;
      const pendingInterpretation = preview?.payload.interpretation as Interpretation | undefined;
      const pendingResolution = preview?.payload.resolution as ResolutionResult | undefined;
      const pendingOptions = (preview?.payload.options ?? []) as ChoiceOption[];
      const selected =
        parsed.kind === 'reply' && (parsed.response === '1' || parsed.response === '2')
          ? pendingOptions.find((option) => option.number === parsed.response)
          : undefined;
      const replyInterpretation =
        selected && pendingInterpretation && pendingResolution?.kind === 'clarification'
          ? selectedInterpretation(pendingInterpretation, pendingResolution.field, selected)
          : pendingInterpretation;
      let resolution: ResolutionResult | null = null;

      // P03 discovers, locks and re-reads the complete M03 configuration set.
      // A reply resolves the original candidate before P04 locks Inbox rows.
      if (parsed.kind === 'create_transaction' || parsed.kind === 'query_last')
        resolution = await resolveInContext(ctx, parsed, message, now);
      else if (
        parsed.kind === 'reply' &&
        preview &&
        original &&
        replyInterpretation &&
        (replyInterpretation.kind === 'create_transaction' ||
          replyInterpretation.kind === 'query_last')
      )
        resolution = await resolveInContext(ctx, replyInterpretation, original, now);
      else await ctx.locks.acquireLocks({ authorizedSenders: [message.authorizedSenderId] });

      await authorized(ctx, message);
      await assertClaim(ctx, claim);
      await ctx.interpretations.create({
        id: id(),
        inboxMessageId: message.id,
        attemptNumber: claim.attemptCount,
        interpretation: parsed,
        now,
      });

      if (parsed.kind === 'reply') {
        const reply = await ctx.confirmations.resolveReply({
          ...owner,
          resolverInboxMessageId: message.id,
          attemptCount: token.attemptCount,
          processingStartedAt: token.processingStartedAt,
          reply: parsed.response,
          now,
        });
        if (reply.kind === 'stale_claim') throw new StaleInboxClaimError();
        if (reply.kind === 'none')
          return { type: 'ignored', inboxMessageId: message.id, status: 'ignored' };
        if (reply.kind === 'expired' || reply.kind === 'cancelled')
          return { type: reply.kind, inboxMessageId: message.id, status: 'processed' };
        if (reply.session.id !== preview?.id || !original) throw new StaleInboxClaimError();
        // A competing reply may have advanced this same session after preview.
        // Its reply belongs to the old stage, never the new options.
        if (
          reply.session.action !== preview.action ||
          JSON.stringify(reply.session.payload) !== JSON.stringify(preview.payload)
        ) {
          await finish(ctx, claim, 'processed', now);
          return {
            type: 'confirmation_required',
            inboxMessageId: original.id,
            status: 'needs_confirmation',
            confirmation: {
              id: reply.session.id,
              action: reply.session.action,
              expiresAt: reply.session.expiresAt,
              options: (reply.session.payload.options ?? []) as ChoiceOption[],
            },
          };
        }
        if (reply.kind === 'choice') {
          if (selected && resolution?.kind === 'create') {
            const transaction = await deps.genericCreate.executeInContext(
              resolution.input,
              `inbox:${original.id}`,
              { correlationId },
              ctx,
              {
                inboxMessageId: original.id,
                sourceReference: original.sourceMessageId,
                senderReference: original.senderReference,
              },
            );
            await ctx.confirmations.finalizeConfirmed({
              ...owner,
              sessionId: reply.session.id,
              resolverInboxMessageId: message.id,
              attemptCount: token.attemptCount,
              processingStartedAt: token.processingStartedAt,
              now,
            });
            return {
              type: 'transaction_created',
              inboxMessageId: message.id,
              status: 'processed',
              transaction,
            };
          }
          if (selected && resolution?.kind === 'query_last') {
            const transaction = await ctx.reads.getLast({ bookId: resolution.bookId });
            await ctx.confirmations.finalizeConfirmed({
              ...owner,
              sessionId: reply.session.id,
              resolverInboxMessageId: message.id,
              attemptCount: token.attemptCount,
              processingStartedAt: token.processingStartedAt,
              now,
            });
            return {
              type: 'query_last',
              inboxMessageId: message.id,
              status: 'processed',
              transaction,
            };
          }
          if (
            selected &&
            replyInterpretation &&
            resolution?.kind === 'clarification' &&
            pendingResolution?.kind === 'clarification' &&
            pendingResolution.field === 'book'
          ) {
            const options = await offeredOptions(
              ctx,
              replyInterpretation,
              resolution,
              message.senderReference,
            );
            const action =
              options.length === 2 ? `select_${resolution.field}` : `clarify_${resolution.field}`;
            const advanced = await ctx.confirmations.advanceChoice({
              ...owner,
              sessionId: reply.session.id,
              resolverInboxMessageId: message.id,
              attemptCount: token.attemptCount,
              processingStartedAt: token.processingStartedAt,
              action,
              payload: { interpretation: replyInterpretation, resolution, options },
              now,
            });
            return {
              type: 'confirmation_required',
              inboxMessageId: original.id,
              status: 'needs_confirmation',
              confirmation: { id: advanced.id, action, expiresAt: advanced.expiresAt, options },
            };
          }
          await finish(ctx, claim, 'processed', now);
          return {
            type: 'confirmation_required',
            inboxMessageId: original.id,
            status: 'needs_confirmation',
            confirmation: {
              id: reply.session.id,
              action: reply.session.action,
              expiresAt: reply.session.expiresAt,
              options: pendingOptions,
            },
          };
        }
        if (reply.session.id !== preview?.id || !original) throw new StaleInboxClaimError();
        if (resolution?.kind !== 'create') {
          await finish(ctx, claim, 'processed', now);
          return {
            type: 'confirmation_required',
            inboxMessageId: original.id,
            status: 'needs_confirmation',
            confirmation: {
              id: reply.session.id,
              action: reply.session.action,
              expiresAt: reply.session.expiresAt,
              options: pendingOptions,
            },
          };
        }
        const transaction = await deps.genericCreate.executeInContext(
          resolution.input,
          `inbox:${original.id}`,
          { correlationId },
          ctx,
          {
            inboxMessageId: original.id,
            sourceReference: original.sourceMessageId,
            senderReference: original.senderReference,
          },
        );
        await ctx.confirmations.finalizeConfirmed({
          ...owner,
          sessionId: reply.session.id,
          resolverInboxMessageId: message.id,
          attemptCount: token.attemptCount,
          processingStartedAt: token.processingStartedAt,
          now,
        });
        return {
          type: 'transaction_created',
          inboxMessageId: message.id,
          status: 'processed',
          transaction,
        };
      }

      if (resolution?.kind === 'create') {
        await ctx.confirmations.supersede({ ...owner, now });
        const transaction = await deps.genericCreate.executeInContext(
          resolution.input,
          `inbox:${message.id}`,
          { correlationId },
          ctx,
          {
            inboxMessageId: message.id,
            sourceReference: message.sourceMessageId,
            senderReference: message.senderReference,
          },
        );
        await finish(ctx, claim, 'processed', now);
        return {
          type: 'transaction_created',
          inboxMessageId: message.id,
          status: 'processed',
          transaction,
        };
      }
      if (resolution?.kind === 'query_last') {
        // A complete read command replaces prior intent, while an unresolved read preserves it.
        await ctx.confirmations.supersede({ ...owner, now });
        const transaction = await ctx.reads.getLast({ bookId: resolution.bookId });
        await finish(ctx, claim, 'processed', now);
        return { type: 'query_last', inboxMessageId: message.id, status: 'processed', transaction };
      }
      if (preview) {
        await finish(ctx, claim, 'processed', now);
        return {
          type: 'confirmation_required',
          inboxMessageId: preview.inboxMessageId,
          status: 'needs_confirmation',
          confirmation: {
            id: preview.id,
            action: preview.action,
            expiresAt: preview.expiresAt,
            options: pendingOptions,
          },
        };
      }
      await finish(ctx, claim, 'needs_confirmation', now);
      const action =
        resolution?.kind === 'clarification' ? `select_${resolution.field}` : 'clarify_intent';
      const options = await offeredOptions(ctx, parsed, resolution, message.senderReference);
      const confirmation = await ctx.confirmations.create({
        ...owner,
        id: id(),
        inboxMessageId: message.id,
        action,
        payload: { interpretation: parsed, resolution, options },
        now,
      });
      return {
        type: 'confirmation_required',
        inboxMessageId: message.id,
        status: 'needs_confirmation',
        confirmation: { id: confirmation.id, action, expiresAt: confirmation.expiresAt, options },
      };
    });
  } catch (error) {
    if (error instanceof StaleInboxClaimError)
      return { type: 'stale_claim', inboxMessageId: claim.message.id };
    // The financial transaction rolled back. A separate fenced transition makes
    // this same Inbox row eligible for a future retry without recording a false effect.
    await deps.inboxTransactions.runInTransaction(async ({ inbox }) => {
      await inbox.transition({
        ...claimToken(claim),
        status: 'failed',
        now: deps.now(),
        failureCode: 'PROCESSING_FAILED',
      });
    });
    throw error;
  }
}

export async function processInboxMessage(
  envelope: IngestionEnvelope,
  correlationId: string,
  deps: ProcessMessageDependencies,
): Promise<InboxProcessingResult> {
  const result = await processInboxMessageInternal(envelope, correlationId, deps);
  const replyText = presentInboxReply(result);
  return replyText === null
    ? result
    : {
        ...result,
        replyText,
        replyContract: { version: REPLY_CONTRACT_VERSION, maxCodePoints: REPLY_TEXT_LIMIT },
      };
}
