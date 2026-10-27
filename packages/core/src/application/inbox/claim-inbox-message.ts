import type { InboxClaim, InboxTransactionPort } from '../ports/inbox-ports.js';

export class SenderNotAuthorizedError extends Error {
  readonly code = 'SENDER_NOT_AUTHORIZED';
  readonly statusCode = 403;

  constructor() {
    super('Sender is not authorized');
  }
}

export class InvalidInboxEnvelopeError extends Error {
  readonly code = 'INVALID_INBOX_ENVELOPE';
}

export interface IngestionEnvelope {
  source: string;
  sourceInstance: string;
  sourceMessageId: string;
  senderReference: string;
  receivedAt: Date;
  rawText: string;
  rawPayload?: Record<string, unknown> | null;
  isGroup: boolean;
  fromMe: boolean;
}

export function normalizeSenderReference(reference: string): string {
  const value = reference.trim().replace(/[\s()+.-]/g, '');
  if (!/^[0-9]{8,20}$/.test(value)) throw new InvalidInboxEnvelopeError('Invalid sender reference');
  return value;
}

export async function claimInboxMessage(
  envelope: IngestionEnvelope,
  transactions: InboxTransactionPort,
  options: { id: string; correlationId: string; now: Date; staleTimeoutMs: number },
): Promise<InboxClaim | null> {
  if (envelope.isGroup || envelope.fromMe) return null;
  const senderReference = normalizeSenderReference(envelope.senderReference);
  if (
    envelope.source !== 'whatsapp' ||
    !envelope.sourceInstance ||
    !envelope.sourceMessageId ||
    !Number.isFinite(envelope.receivedAt.getTime()) ||
    !Number.isFinite(options.now.getTime()) ||
    !Number.isSafeInteger(options.staleTimeoutMs) ||
    options.staleTimeoutMs <= 0
  ) {
    throw new InvalidInboxEnvelopeError('Invalid Inbox envelope');
  }

  return transactions.runInTransaction(async ({ senders, locks, inbox }) => {
    // Discovery is non-authoritative. Lock the sender, then re-read before raw persistence.
    const candidate = await senders.findByChannelAndReference('whatsapp', senderReference);
    if (!candidate) throw new SenderNotAuthorizedError();
    await locks.acquireLocks({ authorizedSenders: [candidate.id] });
    const sender = await senders.findByChannelAndReference('whatsapp', senderReference);
    if (!sender || sender.id !== candidate.id || !sender.active) {
      throw new SenderNotAuthorizedError();
    }

    return inbox.claim(
      {
        id: options.id,
        source: envelope.source,
        sourceInstance: envelope.sourceInstance,
        sourceMessageId: envelope.sourceMessageId,
        senderReference,
        authorizedSenderId: sender.id,
        rawText: envelope.rawText,
        rawPayload: envelope.rawPayload,
        receivedAt: envelope.receivedAt,
        correlationId: options.correlationId,
        now: options.now,
      },
      new Date(options.now.getTime() - options.staleTimeoutMs),
    );
  });
}
